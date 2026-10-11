import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_wikipedia_deep_read — Deep read a Wikipedia article as plain text
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_wikipedia_deep_read',
  description: 'Deep read a Wikipedia article as plain text',
  category: 'docs',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    const p = view(input);
    const title = encodeURIComponent(String(p.query));
    const r = await fetchWithOptions(
      'https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&format=json&redirects=1&titles=' +
        title,
    );
    const j = JSON.parse(r.text || '{}');
    const page: any = Object.values(j.query?.pages ?? {})[0];
    if (!page || page.missing !== undefined) return fail('Maqola topilmadi: ' + p.query);
    return md('# ' + page.title + '\n\n' + (page.extract ?? ''));
  },
});
