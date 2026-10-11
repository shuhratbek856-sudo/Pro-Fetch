import { defineTool } from '../../core/tool.js';
import { fetchUrl } from '../../core/fetcher.js';
import { assertSafeUrl } from '../../core/ssrf-guard.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_google_cache_fetch — Fetch the Google cached copy of a page
 * Pack: archive (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_google_cache_fetch',
  description: 'Fetch the Google cached copy of a page',
  category: 'archive',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "Cache snapshot izlanadigan manba URL'i" },
      max_tokens: { type: 'number', description: 'Natija uchun token budget (max 16000)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    if (!rawUrl) throw new Error('url parametri kerak.');
    const source = await assertSafeUrl(rawUrl);
    const maxTokensValue = Number(input.max_tokens ?? 8000);
    const maxTokens = Number.isFinite(maxTokensValue)
      ? Math.max(256, Math.min(16_000, Math.floor(maxTokensValue)))
      : 8000;
    const googleCacheUrl =
      'https://webcache.googleusercontent.com/search?q=cache:' + encodeURIComponent(source.toString());
    try {
      const cached = await fetchUrl(googleCacheUrl, { maxTokens, useCache: true, timeoutMs: 15_000 });
      if (cached.status < 400 && !/cache unavailable|page not found/i.test(cached.markdown))
        return result(
          JSON.stringify(
            {
              source: source.toString(),
              provider: 'Google Web Cache',
              status: cached.status,
              archiveUrl: cached.url,
              markdown: cached.markdown,
            },
            null,
            2,
          ),
        );
    } catch {
      /* Google Web Cache has been retired; try Wayback below. */
    }
    const waybackUrl = `https://web.archive.org/web/2/${encodeURIComponent(source.toString())}`;
    const archived = await fetchUrl(waybackUrl, { maxTokens, useCache: true, timeoutMs: 30_000 });
    if (archived.status >= 400) throw new Error('Google cache va Wayback snapshot topilmadi.');
    return result(
      JSON.stringify(
        {
          source: source.toString(),
          provider: 'Internet Archive fallback',
          status: archived.status,
          archiveUrl: archived.url,
          markdown: archived.markdown,
        },
        null,
        2,
      ),
    );
  },
});
