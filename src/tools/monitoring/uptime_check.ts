import { fetchWithOptions } from '../../core/http-client.js';
import { result, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_uptime_check — Check the availability and latency of a URL
 * Pack: monitoring (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_uptime_check',
  description: 'Check the availability and latency of a URL',
  category: 'monitoring',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil' },
      timeout_ms: { type: 'number', description: 'Timeout ms (default 10000)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const t0 = Date.now();
    const r = await fetchWithOptions(String(p.url), {
      cache: false,
      retries: 0,
      timeoutMs: Number(p.timeout_ms ?? 10_000),
    });
    const ms = Date.now() - t0;
    return result(
      '# Uptime: ' +
        p.url +
        '\n\nStatus: ' +
        r.status +
        '\nLatensiya: ' +
        ms +
        ' ms\nHolat: ' +
        (r.status < 400 ? '✅ UP' : '❌ DOWN'),
    );
  },
});
