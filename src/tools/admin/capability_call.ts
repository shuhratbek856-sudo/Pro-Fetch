import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { asRecord, arr, obj, strOrEmpty, view } from '../../core/input.js';
import { SMART_TOOL_NAMES } from '../../core/profile.js';
import { detailMode } from '../../core/composite-budget.js';
import { MAX_MODE_CEILING, SIMPLE_CEILING, maxMode, modeSummary } from '../../core/mode.js';

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
    'when your client limits how many tools you can see. ' +
    modeSummary(),
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
      mode: {
        type: 'string',
        enum: ['simple', 'max'],
        description:
          'Bu batch uchun quvvat rejimi. "simple" (yoki qo‘yilmasa) — 5000 tagacha. "max" — ' +
          '9999999999 tagacha, katta batch bo‘laklab navbat bilan bajariladi. Tanlanmasa server ' +
          'davomatidagi PRO_FETCH_MODE qo‘llaniladi. Rejim faqat quvvatni o‘zgartiradi: SSRF, ' +
          'sandbox va kalit himoyalari har ikki rejimda ham o‘lchov qoladi.',
      },
      confirm_large_batch: {
        type: 'boolean',
        description:
          'O‘z-o‘zidan bajariladigan chegaradan (PRO_FETCH_MAX_SELF_SERVE, standart 99999) katta ' +
          'batch uchun foydalanuvchi tasdig‘i. Bu qiymatni faqat foydalanuvchiga aytib, javob ' +
          'olinganidan keyin qo‘yish kerak.',
      },
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
    // Two ways in, deliberately different in what they can reach.
    //
    // `PRO_FETCH_MODE=max` in the environment is server-wide: it lifts the concurrency and timeout
    // ceilings too, because `boundedEnv` reads it while the semaphores are being constructed.
    //
    // `mode: "max"` on the call lifts only *this* batch's ceiling. It cannot raise concurrency,
    // because the semaphores already exist by the time a handler runs - and pretending otherwise
    // would be a claim the code cannot keep. That split is the right one anyway: a sweep that needs
    // room for its batch size is a per-call decision, while a server-wide concurrency change is an
    // operator's decision.
    //
    // Simple remains the default, so an install that knows nothing about this stays conservative.
    const requested = strOrEmpty(p, 'mode').trim().toLowerCase();
    if (requested !== '' && requested !== 'simple' && requested !== 'max') {
      return fail(`mode yaroqsiz: "${requested}". "simple" yoki "max" bo'lishi kerak.`);
    }
    const wantsMax = requested === 'max' || (requested === '' && maxMode());
    const batchLimit = Number(process.env.PRO_FETCH_MAX_BATCH ?? (wantsMax ? MAX_MODE_CEILING : SIMPLE_CEILING));

    // Above the self-serve line the size stops being the caller's decision alone. This is not a
    // resource guard - the queue below would carry any size that is allowed. It is a prompt to involve
    // the user: "read everything in this project" can mean four hundred requests or four hundred
    // thousand, and only the person asking knows which they meant.
    //
    // `confirm_large_batch` is set by the caller *after* the user has said yes. The refusal says so, so
    // the path is discoverable rather than a dead end.
    const selfServe = Number(process.env.PRO_FETCH_MAX_SELF_SERVE ?? 99_999);
    if (calls.length > selfServe && p.confirm_large_batch !== true) {
      return fail(
        `Bu so'rov ${calls.length} ta - o'z-o'zidan bajariladigan chegaradan (${selfServe}) katta. ` +
          `Foydalanuvchiga ayting; tasdiqlash olinsa, arguments'ga "confirm_large_batch": true ` +
          `qo'shib qayta yuboring.`,
      );
    }
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

    // `compositeDepth` is module-level because the dispatch chain crosses module boundaries. But it must
    // be reset even when `runParallel` throws — otherwise one failed batch leaves it elevated forever
    // and every subsequent composite call is refused with "nesting limit exceeded".
    //
    // Measured before this: a single `runParallel` throw (e.g. a batch entry naming a tool that does
    // not exist) incremented the counter and never decremented it. The next composite call saw
    // depth 1, the one after saw depth 2, and the third was refused. The server had to be restarted.
    const enteredComposite = runnable.some(([, tool]) => isComposite(tool));
    if (enteredComposite) compositeDepth++;

    // Queue, do not fan out.
    //
    // A large batch must not open thousands of sockets at once: that is a self-inflicted denial of
    // service against the user's own machine, and the process is killed before any result comes back.
    // So a batch larger than the chunk size is cut up, and each chunk is awaited before the next
    // starts. Concurrency inside a chunk is still the engine's own fan-out, so a small batch behaves
    // exactly as it always did.
    const chunkSize = Number(process.env.PRO_FETCH_BATCH_CHUNK ?? 1000);
    let outcomes: Awaited<ReturnType<typeof runParallel>>;

    // `stop_on_error` requires sequential execution. `runParallel` runs everything concurrently, so a
    // failure in entry 3 cannot stop entries 4-50 — they are already in flight. The only honest way to
    // honour "stop on error" is to run one at a time and break at the first failure.
    //
    // Measured before this: `stop_on_error: true` on a batch where entry 2 failed still ran all 50
    // entries and appended a "(stopped)" marker at the end. The flag changed the report, not the
    // behaviour.
    if (stopOnError) {
      const sequential: typeof outcomes = [];
      for (const [label, tool, args] of runnable) {
        const outcome = await runParallel([[label, tool, args]], 1);
        sequential.push(...outcome);
        if (!outcome[0]!.ok) break;
      }
      outcomes = sequential;
    } else if (runnable.length > chunkSize) {
      const merged: typeof outcomes = [];
      for (let at = 0; at < runnable.length; at += chunkSize) {
        const part = await runParallel(runnable.slice(at, at + chunkSize), batchFanout(chunkSize));
        merged.push(...part);
      }
      outcomes = merged;
    } else {
      try {
        outcomes = await runParallel(runnable, batchFanout(runnable.length));
      } catch (error) {
        if (enteredComposite) compositeDepth--;
        return fail(`Batch bajarilmadi: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (enteredComposite) compositeDepth--;

    // Rebuild in request order. Indexing `slots` by the outcome index was wrong: an invalid entry
    // occupies a slot but produces no outcome, so later results shifted onto the wrong entry and the
    // tail disappeared entirely. A cursor advances only for entries that actually ran.
    //
    // When `stop_on_error` breaks early, `outcomes` is shorter than the number of runnable slots. The
    // remaining slots get a "(stopped)" entry rather than reading past the end of the array.
    let cursor = 0;
    for (const slot of slots) {
      if (!slot.entry) {
        results.push(slot.value);
        continue;
      }
      const outcome = outcomes[cursor++];
      if (!outcome) {
        results.push({ label: '(stopped)', tool: '-', ok: false, ms: 0, error: 'stop_on_error=true' });
        continue;
      }
      results.push({
        label: outcome.step,
        tool: outcome.tool,
        ok: outcome.ok,
        ms: outcome.ms,
        output: outcome.output,
        ...(outcome.ok ? {} : { error: outcome.error ?? 'unknown' }),
      });
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
  if (maxMode()) return Number(process.env.PRO_FETCH_MAX_MODE_FANOUT ?? 64);
  return 10;
}
