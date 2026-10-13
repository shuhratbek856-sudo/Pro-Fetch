import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';
import { parseUpstreamJson } from '../../core/json-response.js';

/**
 * pro_fetch_image_search — Search images by keyword and return sources
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_image_search',
  description: 'Search Wikimedia Commons images with source and license metadata',
  category: 'search',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
      limit: { type: 'number', description: 'Natijalar soni (1-20)' },
    },
    required: ['query'],
  },
  async handler(input) {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) throw new Error('query parametri kerak.');
    const limitValue = Number(input.limit ?? 10);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(20, Math.floor(limitValue))) : 10;
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    for (const [key, value] of Object.entries({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrnamespace: '6',
      gsrlimit: String(limit),
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: '800',
      format: 'json',
      origin: '*',
    }))
      url.searchParams.set(key, value);
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 3_000_000,
    });
    if (response.status >= 400) throw new Error('Wikimedia Commons API HTTP ' + response.status);
    const payload = parseUpstreamJson(response, 'pro_fetch_image_search') as {
      query?: {
        pages?: Record<
          string,
          {
            title?: string;
            imageinfo?: Array<{
              url?: string;
              thumburl?: string;
              descriptionurl?: string;
              extmetadata?: Record<string, { value?: string }>;
            }>;
          }
        >;
      };
    };
    const results = Object.values(payload.query?.pages ?? [])
      .map((page) => {
        const info = page.imageinfo?.[0];
        return {
          title: page.title ?? '',
          imageUrl: info?.url ?? '',
          thumbnailUrl: info?.thumburl ?? '',
          pageUrl: info?.descriptionurl ?? '',
          license: info?.extmetadata?.LicenseShortName?.value ?? '',
          artist: info?.extmetadata?.Artist?.value ?? '',
        };
      })
      .filter((item) => item.imageUrl);
    return result(JSON.stringify({ provider: 'Wikimedia Commons', query, count: results.length, results }, null, 2));
  },
});
