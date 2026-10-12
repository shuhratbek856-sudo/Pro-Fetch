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
    const urls: string[] = (Array.isArray(p.urls) ? p.urls : []).filter(
      (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
    );
    if (!urls.length) return fail("urls bo'sh");

    // A hostile or mistyped delay reaches `setTimeout` unchanged, where NaN fires immediately and a
    // negative value does the same while the recorded `runAt` claims a time in the future.
    const requested = Number(p.delay_ms ?? 5000);
    const delay = Number.isFinite(requested) ? Math.min(Math.max(requested, 0), 86_400_000) : 5000;

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
            JSON.stringify({
              urls,
              status: 'bajarildi',
              ok: res.filter((r: { ok: boolean }) => r.ok).length + '/' + res.length,
            }),
            86_400_000,
          ),
        )
        // This work happens long after the call returned, with nothing awaiting it. A failed fetch
        // therefore rejects with no handler, and Node ends the process on an unhandled rejection --
        // killing an MCP server and every tool in it because one background fetch failed.
        .catch((error: unknown) => {
          cache.put(
            id,
            JSON.stringify({
              urls,
              status: 'xato',
              error: error instanceof Error ? error.message.split('\n')[0] : String(error),
            }),
            86_400_000,
          );
        });
    }, delay);
    return result('? ' + urls.length + ' URL ' + Math.round(delay / 1000) + 's dan keyin yuklanadi (id: ' + id + ')');
  },
});
