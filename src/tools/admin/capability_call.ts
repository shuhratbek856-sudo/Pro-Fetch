import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { asRecord, arr, obj, strOrEmpty, view } from '../../core/input.js';

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
      calls: {
        type: 'array',
        description: 'Bajariladigan toollar ro‘yxati',
        items: {
          type: 'object',
          properties: {
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

    // Bound the batch so one call cannot fan out into hundreds of concurrent operations and
    // exhaust the process. The engine's per-category semaphore still applies underneath.
    if (calls.length > 50) return fail(`Bir chaqiruvda 50 tagacha. Yuborilgan: ${calls.length}.`);

    const { dispatch } = await import('../../core/tool.js');
    const results: Array<{ label: string; tool: string; ok: boolean; ms: number; output?: string; error?: string }> =
      [];
    const started = Date.now();

    for (let index = 0; index < calls.length; index++) {
      const record = asRecord(calls[index]);
      if (!record) {
        results.push({ label: `#${index + 1}`, tool: '(invalid)', ok: false, ms: 0, error: 'entry obyekt emas' });
        continue;
      }
      const tool = strOrEmpty(record, 'tool').trim();
      const label = strOrEmpty(record, 'label').trim() || `${index + 1}. ${tool || '?'}`;
      if (!tool) {
        results.push({ label, tool: '(missing)', ok: false, ms: 0, error: 'tool nomi kerak' });
        continue;
      }

      const args = obj(record, 'arguments');
      const stepStart = Date.now();
      try {
        const outcome = await dispatch(tool, args);
        const text = (outcome.content ?? [])
          .filter((item) => item.type === 'text')
          .map((item) => item.text)
          .join('\n\n');
        const isError = outcome.isError === true;
        results.push({
          label,
          tool,
          ok: !isError,
          ms: Date.now() - stepStart,
          output: text.length > 6000 ? text.slice(0, 6000) + '\n…[truncated]' : text,
          ...(isError ? { error: text.slice(0, 300) } : {}),
        });
        if (isError && p.stop_on_error === true) {
          results.push({ label: '(stopped)', tool: '-', ok: false, ms: 0, error: 'stop_on_error=true' });
          break;
        }
      } catch (error) {
        results.push({
          label,
          tool,
          ok: false,
          ms: Date.now() - stepStart,
          error: error instanceof Error ? error.message : String(error),
        });
        if (p.stop_on_error === true) break;
      }
    }

    const failed = results.filter((entry) => !entry.ok);
    return jsonBlock('Batch results', {
      total: results.length,
      ok: results.length - failed.length,
      failed: failed.length,
      elapsed_ms: Date.now() - started,
      results,
    });
  },
});
