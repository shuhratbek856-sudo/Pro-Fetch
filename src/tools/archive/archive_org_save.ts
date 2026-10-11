import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { assertSafeUrl } from '../../core/ssrf-guard.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_archive_org_save — Save a URL to the Internet Archive
 * Pack: archive (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_archive_org_save',
  description: 'Save a URL to the Internet Archive',
  category: 'archive',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "Wayback'ка сақланадиган HTTP(S) URL" },
    },
    required: ['url'],
  },
  async handler(input) {
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    if (!rawUrl) throw new Error('url parametri kerak.');
    const source = await assertSafeUrl(rawUrl);
    const response = await fetchWithOptions('https://web.archive.org/save/' + encodeURIComponent(source.toString()), {
      method: 'POST',
      headers: { accept: 'application/json, text/plain, */*' },
      timeoutMs: 60_000,
      maxBytes: 500_000,
      retries: 0,
    });
    if (response.status < 200 || response.status >= 400) throw new Error('Wayback save HTTP ' + response.status);
    const archiveUrl =
      response.headers['content-location'] ??
      response.headers.location ??
      (/https?:\/\//i.test(response.text) ? response.text.match(/https?:\/\/\S+/)?.[0] : '') ??
      '';
    if (!archiveUrl) throw new Error('Wayback save accepted the request but returned no snapshot URL.');
    return result(JSON.stringify({ source: source.toString(), status: response.status, archiveUrl }, null, 2));
  },
});
