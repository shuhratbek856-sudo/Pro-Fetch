/**
 * Task-oriented composite tools.
 *
 * ## Why this exists
 *
 * MCP clients cap how many tool schemas they will send to the model (commonly ~10, sometimes fewer).
 * With 559 registered tools, a client either truncates the list — silently dropping capabilities —
 * or exposes nothing at all. The `smart` profile worked around this with 5 meta-tools, but that
 * design costs three round trips per operation and forces the model to *guess* the exact tool name
 * and its parameters from a text description, because it never sees the schema. Measured cost for
 * a three-step research task: 9 round trips, each dependent on the previous one guessing right.
 *
 * These composites invert the tradeoff. Each one is a single schema that describes an entire task
 * in the vocabulary the user actually has ("research this topic"), and the server internally
 * sequences the underlying tools. The client sends ten schemas; the model gets full capability.
 *
 * ## Rules
 *
 * - Composites call `dispatch()`, so every underlying call still passes `assertToolAllowed` and the
 *   execution engine: SSRF checks, read-only mode, output sandbox, timeouts and concurrency limits
 *   apply unchanged.
 * - They never bypass the registry. If a step fails, the failure is reported per step instead of
 *   being swallowed, so the model can see exactly what did not work.
 * - Every step result is labelled with the tool that produced it, which also keeps usage stats
 *   meaningful — the underlying tools are credited, not hidden behind the composite.
 */

import { dispatch } from './tool.js';
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
}

/** Cap per step so a noisy upstream cannot flood the model's context. */
const STEP_TEXT_LIMIT = 4_000;

/** Flatten a tool result into readable text, bounded in size. */
function textOf(result: ToolResult): string {
  const text = (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n\n');
  return text.length > STEP_TEXT_LIMIT ? text.slice(0, STEP_TEXT_LIMIT) + '\n…[truncated]' : text;
}

/**
 * Run one tool and capture the outcome.
 *
 * Never throws: a failing step is data, not an exception, because a composite should report
 * partial progress instead of collapsing the whole task.
 */
export async function runStep(step: string, tool: string, args: Record<string, unknown>): Promise<StepOutcome> {
  const started = Date.now();
  try {
    const result = await dispatch(tool, args);
    const isError = result.isError === true;
    return {
      step,
      tool,
      ok: !isError,
      output: textOf(result),
      ...(isError ? { error: textOf(result).slice(0, 400) } : {}),
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

/** Run several steps sequentially, collecting every outcome. */
export async function runPipeline(steps: Array<[string, string, Record<string, unknown>]>): Promise<StepOutcome[]> {
  const outcomes: StepOutcome[] = [];
  for (const [step, tool, args] of steps) outcomes.push(await runStep(step, tool, args));
  return outcomes;
}

/** Render outcomes as a compact, model-readable transcript. */
export function renderPipeline(title: string, outcomes: StepOutcome[]): string {
  const lines: string[] = [`# ${title}`, ''];
  outcomes.forEach((outcome, index) => {
    lines.push(`## ${index + 1}. ${outcome.step}`);
    lines.push(`tool: ${outcome.tool} · ${outcome.ok ? 'ok' : 'FAILED'} · ${outcome.ms}ms`);
    if (outcome.ok) {
      lines.push('');
      lines.push(outcome.output);
    } else {
      lines.push(`error: ${outcome.error ?? 'unknown'}`);
    }
    lines.push('');
  });
  const failed = outcomes.filter((outcome) => !outcome.ok);
  lines.push('---');
  lines.push(`steps=${outcomes.length}; ok=${outcomes.length - failed.length}; failed=${failed.length}`);
  if (failed.length) lines.push(`failed steps: ${failed.map((outcome) => outcome.step).join(', ')}`);
  return lines.join('\n');
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
    // Fall back to the first balanced object, since some tools append prose after the payload.
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
  const parsed = jsonFrom(outcome);
  return asRecordArray(parsed);
}

/** Best-effort string for a field that may be named differently across providers. */
export function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = pathStr(row, key, '');
    if (value) return value;
  }
  return '';
}
