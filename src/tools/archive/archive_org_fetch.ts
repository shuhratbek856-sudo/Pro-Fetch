import { defineTool } from '../../core/tool.js';
import { fetchUrl } from '../../core/fetcher.js';
import { assertSafeUrl } from '../../core/ssrf-guard.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_archive_org_fetch — Fetch a URL snapshot from the Internet Archive
 * Pack: archive (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_archive_org_fetch',
  description: 'Fetch a URL snapshot from the Internet Archive',
  category: 'archive',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "Arxivlanadigan manba URL'i" },
      max_tokens: { type: 'number', description: 'Natija uchun token budget (max 16000)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    if (!rawUrl) throw new Error('url parametri kerak.');
    const source = await assertSafeUrl(rawUrl);
    const archiveUrl = `https://web.archive.org/web/2/${encodeURIComponent(source.toString())}`;
    const maxTokens = Number(input.max_tokens ?? 8000);
    const snapshot = await fetchUrl(archiveUrl, {
      maxTokens: Number.isFinite(maxTokens) ? Math.max(256, Math.min(16_000, Math.floor(maxTokens))) : 8000,
      useCache: true,
      timeoutMs: 30_000,
    });
    if (snapshot.status >= 400) throw new Error('Internet Archive HTTP ' + snapshot.status);
    return result(
      JSON.stringify(
        {
          source: source.toString(),
          archiveUrl: snapshot.url,
          status: snapshot.status,
          contentType: snapshot.contentType,
          cached: snapshot.cached,
          truncated: snapshot.truncated,
          markdown: snapshot.markdown,
        },
        null,
        2,
      ),
    );
  },
});
