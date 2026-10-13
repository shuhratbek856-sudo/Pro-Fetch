import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_dockerhub_read — Read Docker Hub image metadata and tags
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import { parseUpstreamJson } from '../../core/json-response.js';
export default defineTool({
  name: 'pro_fetch_dockerhub_read',
  description: 'Read Docker Hub image metadata and tags',
  category: 'docs',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "Repo (owner/name yoki rasmiy bo'lsa nom)" },
    },
    required: ['query'],
  },
  async handler(input) {
    const p = view(input);
    const repo = String(p.query).includes('/') ? p.query : 'library/' + p.query;
    const r = await fetchWithOptions('https://hub.docker.com/v2/repositories/' + repo);
    if (r.status >= 400) return fail('Repo topilmadi: ' + p.query);
    const t = await fetchWithOptions('https://hub.docker.com/v2/repositories/' + repo + '/tags?page_size=10');
    const tj =
      t.status < 400
        ? (parseUpstreamJson<{ results?: Array<{ name?: string }> }>(t, 'pro_fetch_dockerhub_read').results ?? [])
        : [];
    return jsonBlock('# Docker Hub: ' + repo, {
      repo: parseUpstreamJson(r, 'pro_fetch_dockerhub_read'),
      tags: tj.map((x: any) => x.name),
    });
  },
});
