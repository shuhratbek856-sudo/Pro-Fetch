import { allTools, usageStats } from '../../core/tool.js';
import { levelOf, PROFILE_LEVELS, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_batch_schedule — Schedule a batch fetch for later
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_batch_schedule',
  description: 'Schedule a batch fetch for later',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      urls: { type: 'array', description: "URL ro'yxati" },
      delay_ms: { type: 'number', description: 'Kutish ms (default 5000)' },
    },
    required: ['urls'],
  },
  async handler(input) {
    const p = view(input);
    const urls: string[] = (Array.isArray(p.urls) ? p.urls : []).map(String);
    if (!urls.length) return fail("urls bo'sh");
    const delay = Number(p.delay_ms ?? 5000);
    const id = 'sched:' + Date.now();
    cache.put(
      id,
      JSON.stringify({ urls, runAt: new Date(Date.now() + delay).toISOString(), status: 'kutilmoqda' }),
      86_400_000,
    );
    setTimeout(() => {
      import('../../core/fetcher.js')
        .then(({ fetchBatch }) => fetchBatch(urls))
        .then((res) =>
          cache.put(
            id,
            JSON.stringify({ urls, status: 'bajarildi', ok: res.filter((r: any) => r.ok).length + '/' + res.length }),
            86_400_000,
          ),
        );
    }, delay);
    return result('✅ ' + urls.length + ' URL ' + delay / 1000 + 's dan keyin yuklanadi (id: ' + id + ')');
  },
});
