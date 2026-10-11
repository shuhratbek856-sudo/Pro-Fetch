import { fail, result } from '../../core/format.js';
import { cache } from '../../core/cache.js';

/**
 * pro_fetch_offline_browse — Browse cached pages without network
 * Pack: archive (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
export default defineTool({
  name: 'pro_fetch_offline_browse',
  description: 'Browse cached pages without network',
  category: 'archive',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "Cache'dan ochiladigan URL; bo‘sh bo‘lsa ro‘yxat chiqadi" },
      query: { type: 'string', description: 'Cache ichidagi matndan local qidiruv' },
      limit: { type: 'number', description: 'Ko‘rsatiladigan sahifalar soni (1-50)' },
    },
  },
  async handler(input) {
    const url = typeof input.url === 'string' ? input.url.trim() : '';
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    const limitValue = Number(input.limit ?? 20);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(50, Math.floor(limitValue))) : 20;
    if (url) {
      let normalized: string;
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) URLs are supported.');
        normalized = parsed.toString();
      } catch (error) {
        throw new Error('Yaroqsiz cached URL: ' + (error instanceof Error ? error.message : String(error)));
      }
      const hit = cache.get('fetch:' + normalized);
      if (!hit) return fail('Bu URL offline cache’da yo‘q: ' + normalized);
      try {
        const page = JSON.parse(hit.value) as {
          markdown?: string;
          status?: number;
          contentType?: string;
          tokens?: number;
          truncated?: boolean;
        };
        return result(
          JSON.stringify(
            {
              url: normalized,
              cached: true,
              cachedAt: new Date(hit.createdAt).toISOString(),
              status: page.status ?? null,
              contentType: page.contentType ?? '',
              tokens: page.tokens ?? null,
              truncated: Boolean(page.truncated),
              content: page.markdown ?? hit.value,
            },
            null,
            2,
          ),
        );
      } catch {
        return result(
          JSON.stringify(
            { url: normalized, cached: true, cachedAt: new Date(hit.createdAt).toISOString(), content: hit.value },
            null,
            2,
          ),
        );
      }
    }
    const keys = cache.keys('fetch:');
    if (query) {
      const hits = cache
        .search(query)
        .filter((hit) => hit.key.startsWith('fetch:'))
        .slice(0, limit);
      return result(
        JSON.stringify(
          {
            offline: true,
            query,
            count: hits.length,
            pages: hits.map((hit) => ({ url: hit.key.slice('fetch:'.length), excerpt: hit.value.slice(0, 1000) })),
          },
          null,
          2,
        ),
      );
    }
    return result(
      JSON.stringify(
        {
          offline: true,
          count: keys.length,
          pages: keys.slice(0, limit).map((key) => ({ url: key.slice('fetch:'.length) })),
          truncated: keys.length > limit,
        },
        null,
        2,
      ),
    );
  },
});
