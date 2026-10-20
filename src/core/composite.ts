/**
 * Task-oriented composite tools.
 *
 * ## Why this exists
 *
 * MCP clients cap how many tool schemas reach the model (commonly ~10, sometimes fewer). With 569
 * registered tools a client either truncates the list — silently dropping capabilities — or exposes
 * nothing. The original `smart` profile worked around this with meta-tools, but it cost three round
 * trips per operation and forced the model to *guess* exact tool names from prose, because it never
 * saw the schemas. Measured cost for a three-step research task: 9 round trips, each dependent on
 * the previous one guessing right.
 *
 * These composites invert the tradeoff. Each is a single schema describing a whole task in the
 * user's own vocabulary ("research this topic"), and the server does the rest. Ten schemas reach the
 * model; full capability reaches the work.
 *
 * ## Rules
 *
 * - Composites call `dispatch()`, so every underlying call still passes `assertToolAllowed` and the
 *   execution engine: SSRF checks, read-only mode, output sandbox, timeouts and concurrency limits
 *   apply unchanged.
 * - They never bypass the registry. A failing step is reported as data, not swallowed.
 * - Every step is labelled with the tool that produced it, so usage stats stay honest — the
 *   underlying tools are credited, not hidden behind the composite.
 */

import { dispatch } from './tool.js';
import { isMutationTool } from './tool-classification.js';
import { fetchWithOptions } from './http-client.js';
import { asRecordArray, pathStr } from './input.js';
import type { ToolResult } from './types.js';

/** One step of a composite, already dispatched. */
export interface StepOutcome {
  step: string;
  tool: string;
  ok: boolean;
  /** Truncated text of the underlying tool result. */
  output: string;
  error?: string;
  ms: number;
  /**
   * Whether the step's own text was cut at the per-step limit.
   *
   * The cut was invisible in the summary before: a step that produced 9 000 characters arrived in
   * the transcript as 4 000 characters and a marker, and the closing note said nothing about it -
   * the note counted the budget shrink, which is a different thing. A caller reading the summary
   * could not tell that a step's answer had been shortened before the budget was even considered.
   */
  clipped?: boolean;
}

/** Default characters kept per step, so one noisy upstream cannot flood the context. */
const STEP_TEXT_LIMIT = 4_000;

/**
 * Parallel fan-out width.
 *
 * The execution engine already owns the real limits (`PRO_FETCH_MAX_CONCURRENCY` and the per-category
 * semaphores), so this is not a second source of truth — it bounds how many promises a composite
 * holds at once, which matters because the engine queues rather than rejects. Eight keeps a
 * 17-step composite genuinely concurrent while staying well inside the default global cap of 32.
 */
const DEFAULT_FANOUT = 8;

/** Flatten a tool result into readable text, bounded in size. */
function textOf(result: ToolResult): { text: string; clipped: boolean } {
  const text = (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n\n');
  if (text.length <= STEP_TEXT_LIMIT) return { text, clipped: false };
  return { text: text.slice(0, STEP_TEXT_LIMIT) + '\n…[truncated]', clipped: true };
}

/**
 * Run one tool and capture the outcome.
 *
 * Never throws: a failing step is data, not an exception, because a composite should report partial
 * progress instead of collapsing the whole task.
 */
export async function runStep(step: string, tool: string, args: Record<string, unknown>): Promise<StepOutcome> {
  const started = Date.now();
  try {
    const result = await dispatch(tool, args);
    const isError = result.isError === true;
    const { text, clipped } = textOf(result);
    return {
      step,
      tool,
      ok: !isError,
      output: text,
      ...(clipped ? { clipped: true } : {}),
      ...(isError ? { error: text.slice(0, 400) } : {}),
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      step,
      tool,
      ok: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      ms: Date.now() - started,
    };
  }
}

/**
 * Fetch a source document once, for a composite that will analyse it many times.
 *
 * ## Why this is not `runStep('...', 'pro_fetch_fetch_url')`
 *
 * Every tool result is flattened through `textOf`, which truncates at 4,000 characters, and
 * `pro_fetch_fetch_url` renders the page to markdown with a status footer while `pro_fetch_raw`
 * clips at 12,000 tokens. A composite that needs to hand the *document* to several extractors cannot
 * use either: markdown has no `<script type="application/ld+json">` for a structured-data step to
 * find, no `<img alt>` for an alt-coverage step, and truncated markup silently drops the tail.
 *
 * This performs the one real request and returns the bytes, so every downstream step analyses the
 * same complete document. `url` and `html` are returned together so a caller can pass the content
 * while still labelling each step with the page it describes.
 *
 * The fetch still runs through `fetchWithOptions`, so SSRF resolution, redirect limits, timeouts
 * and the byte cap all apply exactly as they do to a normal tool call.
 */
export async function fetchSource(
  url: string,
  maxBytes = 2_000_000,
): Promise<{ ok: true; url: string; html: string } | { ok: false; error: string }> {
  try {
    // Same in-flight coalescing as `downloadToBuffer`, so a composite that fetches a page while a
    // binary converter fetches the same address performs one request rather than two.
    const response = await fetchWithOptions(url, { maxBytes });
    if (response.status >= 400) return { ok: false, error: `HTTP ${response.status}` };
    if (!response.text.trim()) return { ok: false, error: 'Bo‘sh javob olindi.' };
    return { ok: true, url, html: response.text };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Stable identity for a step, used to collapse exact duplicates within one fan-out.
 *
 * Keyed on the tool and its arguments, not on the step label: two steps asking the same question
 * are the same question whatever they are called.
 */
function stepKey(tool: string, args: Record<string, unknown>): string {
  let serialised: string;
  try {
    // Sorted keys, so argument order cannot make two identical calls look different.
    const sorted: Record<string, unknown> = {};
    for (const name of Object.keys(args).sort()) sorted[name] = args[name];
    serialised = JSON.stringify(sorted) ?? '{}';
  } catch {
    // Non-serialisable arguments are rare but possible; treat them as distinct rather than guessing.
    serialised = String(Date.now());
  }
  return `${tool}::${serialised}`;
}

/**
 * Run steps concurrently, collapsing exact duplicates and preserving input order.
 *
 * Deduplication matters because composites naturally ask several tools the same question — two
 * headings extractions for the same page, three converters for the same bytes. Without this, a single
 * fan-out multiplies one expensive call into several. Duplicates reuse the first result under their
 * own step name, so the transcript still shows what every step asked and found.
 *
 * Only read-only tools are deduplicated. A mutation called twice must run twice: the second call may
 * depend on the first having happened, and collapsing them would report two successes for one
 * operation. Measured before this: two identical `task_create` entries in a batch produced one
 * dispatch and two identical results, so the caller believed two tasks existed.
 *
 * Independence is still the caller's claim: only group steps that do not consume each other's output.
 * Concurrency stays bounded by the execution engine, so this cannot exceed the configured limits.
 */
export async function runParallel(
  steps: Array<[string, string, Record<string, unknown>]>,
  fanout = DEFAULT_FANOUT,
): Promise<StepOutcome[]> {
  // Plan the unique work, then map each step onto the item that satisfies it.
  //
  // Every step keeps its own label. Two steps that share a tool and arguments are one dispatch, but
  // they are not one *step*: a caller who asked the same question twice, or who gave the operations
  // distinct ids, must still see two labelled results. Sharing the label would report the second
  // operation under the first one's name, which reads as if only one had been requested.
  const unique = new Map<string, { index: number; step: string; tool: string; args: Record<string, unknown> }>();
  const plan: Array<{ source: number; label: string }> = [];
  // Every entry gets its own number, and a mutation is keyed by it.
  //
  // The key used to be `${step}::${Date.now()}`, which was meant to defeat deduplication. It does not:
  // `Date.now()` has one-millisecond resolution and this planning loop is synchronous, so two mutation
  // entries that share a label got the same key. The second was folded into the first — the write never
  // happened, the second entry's arguments were discarded, and the transcript reported two successes.
  // Measured: two `create` steps with the same label produced one handler invocation with only the
  // first step's arguments, and a batch reported `total: 2, ok: 2, failed: 0`.
  //
  // The entry number is what makes each mutation its own dispatch. It is stable, it is unique, and it
  // does not depend on a clock.
  let entry = 0;
  for (const [step, tool, args] of steps) {
    // Mutations are never deduplicated. A write called twice is two writes, and reporting one
    // dispatch as two results would tell the caller both happened when only one did.
    const key = isMutationTool(tool) ? `mutation::${entry}` : stepKey(tool, args);
    entry += 1;
    let item = unique.get(key);
    if (!item) {
      item = { index: unique.size, step, tool, args };
      unique.set(key, item);
    }
    plan.push({ source: item.index, label: step });
  }

  const work = [...unique.values()];
  const width = Math.max(1, Math.min(fanout, work.length));
  const results = new Array<StepOutcome>(work.length);
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor++;
      if (index >= work.length) return;
      const item = work[index]!;
      results[index] = await runStep(item.step, item.tool, item.args);
    }
  };

  await Promise.all(Array.from({ length: width }, worker));
  // Reuse the shared outcome, but under the step's own label. A deduplicated step must not inherit
  // another step's name, or the transcript under-reports how many operations the caller requested.
  return plan.map(({ source, label }) => ({ ...results[source]!, step: label }));
}

/** Run steps sequentially, collecting every outcome. Needed when later steps consume earlier output. */
export async function runPipeline(steps: Array<[string, string, Record<string, unknown>]>): Promise<StepOutcome[]> {
  const outcomes: StepOutcome[] = [];
  for (const [step, tool, args] of steps) outcomes.push(await runStep(step, tool, args));
  return outcomes;
}

/**
 * Render outcomes as a compact, model-readable transcript.
 *
 * `budget` caps the total characters. When the transcript would exceed it, the longest step outputs
 * are dropped first and the transcript says how to retrieve them — a 17-step page audit would
 * otherwise bury the result the model came for. The successful steps always survive; only their
 * bodies shrink, so a summary is never lost to make room for another summary.
 */
export function renderPipeline(title: string, outcomes: StepOutcome[], budget = 60_000): string {
  const header = `# ${title}\n\n`;
  const footer = renderFooter(outcomes);
  const bodies = outcomes.map((outcome) => outcome.output);
  let body = outcomes.map((outcome, index) => renderStep(index, outcome, bodies[index]!)).join('\n');
  const shortened = new Set<number>();

  // The budget is a budget, not a wish.
  //
  // The previous pass halved each body once and stopped when the list ran out, and it only
  // considered bodies longer than 400 characters. Measured: 150 steps of 400 characters came out
  // 67 322 characters against a 60 000 budget, and the closing note said nothing had been
  // shortened - because the note counted halvings, and no body was eligible for one.
  //
  // Now the largest body is halved again and again until the transcript fits, and a body that
  // cannot be shortened further is left alone rather than cut to nothing.
  const MIN_BODY = 200;
  // Room for the closing note, which is added after the loop and would otherwise push the
  // transcript over the limit it just met.
  const RESERVE = 260;
  for (;;) {
    if (header.length + body.length + footer.length + RESERVE <= budget) break;
    let target = -1;
    let longest = MIN_BODY;
    for (let index = 0; index < bodies.length; index += 1) {
      const length = bodies[index]!.length;
      if (length > longest) {
        longest = length;
        target = index;
      }
    }
    if (target < 0) break;
    bodies[target] = bodies[target]!.slice(0, Math.floor(bodies[target]!.length / 2));
    shortened.add(target);
    body = outcomes.map((outcome, index) => renderStep(index, outcome, bodies[index]!)).join('\n');
  }

  const clippedSteps = outcomes.filter((outcome) => outcome.clipped === true).length;
  const overBudget = header.length + body.length + footer.length + RESERVE > budget;
  const notes: string[] = [];
  if (shortened.size > 0) notes.push(`${shortened.size} ta qadam qisqartirildi`);
  if (clippedSteps > 0) notes.push(`${clippedSteps} ta qadam 4 000 belgi bilan kesildi`);
  if (overBudget) notes.push('Natijaning hajmi byudjetdan oshdi');
  const note = notes.length > 0 ? `\n\n_${notes.join('; ')}._` : '';

  return header + body + footer + note;
}

function renderStep(index: number, outcome: StepOutcome, body: string): string {
  const head = `## ${index + 1}. ${outcome.step}\ntool: ${outcome.tool} · ${outcome.ok ? 'ok' : 'FAILED'} · ${outcome.ms}ms\n`;
  return outcome.ok ? `${head}\n${body}\n\n` : `${head}error: ${outcome.error ?? 'unknown'}\n\n`;
}

function renderFooter(outcomes: StepOutcome[]): string {
  const failed = outcomes.filter((outcome) => !outcome.ok);
  const lines = ['---', `steps=${outcomes.length}; ok=${outcomes.length - failed.length}; failed=${failed.length}`];
  if (failed.length) lines.push(`failed steps: ${failed.map((outcome) => outcome.step).join(', ')}`);
  return lines.join('\n') + '\n';
}

/** Extract URLs from an arbitrary tool output, which is how the steps feed each other. */
export function urlsFrom(outcomes: StepOutcome[]): string[] {
  const urls: string[] = [];
  for (const outcome of outcomes) {
    if (!outcome.ok) continue;
    for (const match of outcome.output.matchAll(/https?:\/\/[^\s"'`<>\])]+/g)) {
      const cleaned = match[0].replace(/[.,;:]+$/, '');
      if (!urls.includes(cleaned)) urls.push(cleaned);
    }
  }
  return urls;
}

/** Extract a JSON payload from a tool output, tolerating the markdown fence tools wrap it in. */
export function jsonFrom(outcome: StepOutcome): unknown {
  const text = outcome.output
    .replace(/^```(?:json)?\s*/gm, '')
    .replace(/```$/gm, '')
    .trim();
  const start = text.indexOf('{');
  const arrayStart = text.indexOf('[');
  const from = start === -1 ? arrayStart : arrayStart === -1 ? start : Math.min(start, arrayStart);
  if (from === -1) return undefined;
  const candidate = text.slice(from);
  try {
    return JSON.parse(candidate);
  } catch {
    const end = candidate.lastIndexOf('}');
    if (end === -1) return undefined;
    try {
      return JSON.parse(candidate.slice(0, end + 1));
    } catch {
      return undefined;
    }
  }
}

/** Rows of a JSON array payload, as records. */
export function rowsFrom(outcome: StepOutcome): Array<Record<string, unknown>> {
  return asRecordArray(jsonFrom(outcome));
}

/** Best-effort string for a field that may be named differently across providers. */
export function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = pathStr(row, key, '');
    if (value) return value;
  }
  return '';
}
