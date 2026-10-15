import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { asRecord, arr, obj, strOrEmpty, view } from '../../core/input.js';
import { SMART_TOOL_NAMES } from '../../core/profile.js';
import { detailMode } from '../../core/composite-budget.js';

/**
 * Maximum nesting depth for composite execution.
 *
 * A batch can call a composite (like pro_research_deep), which itself calls tools. Without a limit,
 * a composite calling another composite calling another could recurse indefinitely. Three levels
 * (batch → composite → tool) is enough for any real workflow while preventing runaway recursion.
 */
const MAX_COMPOSITE_DEPTH = 3;

/**
 * Tracks the current composite execution depth.
 *
 * Module-level so it works across the recursive dispatch chain. Reset in finally to guarantee
 * cleanup even on error.
 */
let compositeDepth = 0;

/**
 * pro_capability_call — Run many Pro-Fetch tools in one call
 * Pack: smart-composite (pro-fetch)
 *
 * This is what turns a ten-tool budget into full capability. The model sends a list of
 * `{ tool, arguments }` and gets every result back in one round trip, instead of one call per
 * operation. Nothing here bypasses the registry: each entry goes through `dispatch()`, so
 * `assertToolAllowed`, SSRF checks, the output sandbox and the execution engine still apply to
 * every single call.
 *
 * Entries run sequentially. That is deliberate — parallelism here would multiply the network
 * concurrency across dozens of calls and make rate limiting unpredictable. Independent entries
 * could be parallelised here later, but sequential keeps the failure semantics obvious.
 */
export default defineTool({
  name: 'pro_capability_call',
  description:
    'Execute a batch of Pro-Fetch tools in a single call. Send a list of { tool, arguments } and ' +
    'receive every result together, instead of one round trip per tool. Failures are reported ' +
    'per entry and do not stop the rest of the batch. This is the way to use the full tool set ' +
    'when your client limits how many tools you can see.',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      detail: { type: 'string', enum: ['summary', 'full'], description: 'Natija hajmi: summary yoki full' },
      calls: {
        type: 'array',
        description: 'Bajariladigan toollar ro‘yxati',
        items: {
          type: 'object',
          properties: {
            detail: { type: 'string', enum: ['summary', 'full'], description: 'Natija hajmi: summary yoki full' },
            tool: {
              type: 'string',
              description: 'Aniq tool nomi (pro_capability_map yoki tool_list_details dan olingan)',
            },
            arguments: { type: 'object', description: 'Shu tool’ning input schema siga mos argumentlar' },
            label: { type: 'string', description: 'Natijani aniqlash uchun ixtiyoriy yorliq' },
          },
          required: ['tool'],
        },
      },
      stop_on_error: { type: 'boolean', description: 'Birinchi xatoda to‘xtatish (odatda false)' },
    },
    required: ['calls'],
  },
  async handler(input) {
    const p = view(input);
    const calls = arr(p, 'calls');
    if (calls.length === 0) return fail('calls bo‘sh. Kamida bitta { tool, arguments } yuboring.');

    // Bound the batch so one call cannot produce a single response too large for the MCP transport or
    // the client's memory to hold. It does not bound concurrency: `runParallel` fans out
    // DEFAULT_FANOUT (8) at a time and the execution engine's semaphore governs the rest, so a batch
    // of 500 is not 500 simultaneous requests.
    //
    // A million would not be "more capacity" - it is a guaranteed failure, because the response is one
    // MCP message holding a million results. What is useful is that the ceiling is the caller's to
    // choose, so it is configurable rather than a constant someone picked once.
    const batchLimit = Number(process.env.PRO_FETCH_MAX_BATCH ?? 5000);
    if (!Number.isFinite(batchLimit) || batchLimit < 1) {
      return fail(`PRO_FETCH_MAX_BATCH yaroqsiz: ${process.env.PRO_FETCH_MAX_BATCH}.`);
    }
    if (calls.length > batchLimit) {
      return fail(
        `Bir chaqiruvda ${batchLimit} tagacha. Yuborilgan: ${calls.length}. ` +
          `PRO_FETCH_MAX_BATCH orqali ko'paytirilishi mumkin.`,
      );
    }

    const { runParallel } = await import('../../core/composite.js');
    type Entry = { label: string; tool: string; ok: boolean; ms: number; output?: string; error?: string };
    const results: Entry[] = [];
    const started = Date.now();
    const stopOnError = p.stop_on_error === true;

    // Normalise first, so the fan-out only sees well-formed entries. Every input keeps a slot so the
    // result list matches the request exactly, including entries that never ran.
    const runnable: Array<[string, string, Record<string, unknown>]> = [];
    const slots: Array<{ entry: true } | { entry: false; value: Entry }> = [];

    for (let index = 0; index < calls.length; index++) {
      const record = asRecord(calls[index]);
      if (!record) {
        slots.push({
          entry: false,
          value: { label: `#${index + 1}`, tool: '(invalid)', ok: false, ms: 0, error: 'entry obyekt emas' },
        });
        continue;
      }
      const tool = strOrEmpty(record, 'tool').trim();
      const label = strOrEmpty(record, 'label').trim() || `${index + 1}. ${tool || '?'}`;
      if (!tool) {
        slots.push({ entry: false, value: { label, tool: '(missing)', ok: false, ms: 0, error: 'tool nomi kerak' } });
        continue;
      }
      slots.push({ entry: true });
      runnable.push([label, tool, obj(record, 'arguments')]);
    }

    // Run concurrently, bounded by the engine's own semaphores underneath. A 50-entry batch of
    // network calls would otherwise be serialised into 50 round trips, which is exactly the cost
    // this tool exists to avoid.
    //
    // Nested composition: a batch entry can name a composite (e.g. pro_research_deep), which then
    // calls its own tools. This is what lets one round trip express a whole workflow. Depth is
    // bounded so a composite calling a composite calling a composite cannot recurse forever.
    const isComposite = (name: string) => SMART_TOOL_NAMES.has(name);
    const depthExceeded = runnable.some(([, tool]) => isComposite(tool) && compositeDepth >= MAX_COMPOSITE_DEPTH);
    if (depthExceeded) {
      return fail(
        `Composite nesting limiti (${MAX_COMPOSITE_DEPTH}) oshdi. Murakkab vazifalarni bir necha qadamda bajarib ko'ring.`,
      );
    }

    if (runnable.some(([, tool]) => isComposite(tool))) compositeDepth++;
    let outcomes;
    try {
      outcomes = await runParallel(runnable, batchFanout(runnable.length));
    } finally {
      if (runnable.some(([, tool]) => isComposite(tool))) compositeDepth--;
    }
    let aborted = false;

    // Rebuild in request order. Indexing `slots` by the outcome index was wrong: an invalid entry
    // occupies a slot but produces no outcome, so later results shifted onto the wrong entry and the
    // tail disappeared entirely. A cursor advances only for entries that actually ran.
    let cursor = 0;
    for (const slot of slots) {
      if (!slot.entry) {
        results.push(slot.value);
        continue;
      }
      const outcome = outcomes[cursor++]!;
      results.push({
        label: outcome.step,
        tool: outcome.tool,
        ok: outcome.ok,
        ms: outcome.ms,
        output: outcome.output,
        ...(outcome.ok ? {} : { error: outcome.error ?? 'unknown' }),
      });
      if (!outcome.ok && stopOnError) aborted = true;
    }

    // `stop_on_error` aborts further dispatch, but entries already in flight still report:
    // calling a cancelled call a failure would misreport what the server actually did.
    if (aborted) {
      results.push({ label: '(stopped)', tool: '-', ok: false, ms: 0, error: 'stop_on_error=true' });
    }

    const failed = results.filter((entry) => !entry.ok);
    // `detail` was declared in the schema and never read, so a batch always returned every step's
    // full output. At the default fan-out of 50 that is the bulk of the response and often gets
    // clipped by the caller anyway, losing the per-step error that actually mattered.
    //
    // `summary` keeps what identifies the step and whether it worked, and drops the body. `full`
    // returns it unchanged. A failed step always keeps its error either way: an error that a summary
    // hides is worse than no summary.
    const detail = detailMode(p.detail);
    const shaped = results.map((entry) =>
      detail === 'full'
        ? entry
        : entry.ok
          ? { label: entry.label, tool: entry.tool, ok: true, ms: entry.ms }
          : { label: entry.label, tool: entry.tool, ok: false, ms: entry.ms, error: entry.error },
    );

    return jsonBlock('Batch results', {
      total: results.length,
      ok: results.length - failed.length,
      failed: failed.length,
      elapsed_ms: Date.now() - started,
      detail,
      results: shaped,
    });
  },
});

/**
 * How many batch entries to keep in flight.
 *
 * Small batches run wide because each entry is independent. Large batches narrow down so a 50-entry
 * call does not hold 50 slots waiting on per-category semaphores it could not use anyway.
 */
function batchFanout(size: number): number {
  if (size <= 4) return Math.max(1, size);
  if (size <= 12) return 6;
  return 10;
}
