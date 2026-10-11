import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_fetch_graphql — Send a GraphQL query to an endpoint and return data
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_fetch_graphql',
  description: 'Send a GraphQL query to an endpoint and return data',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'GraphQL endpoint' },
      query: { type: 'string', description: "GraphQL so'rov" },
    },
    required: ['url', 'query'],
  },
  async handler(input) {
    const p = view(input);
    const r = await fetchWithOptions(String(p.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: String(p.query), variables: p.variables ?? {} }),
    });
    return jsonBlock('# GraphQL ' + p.url, JSON.parse(r.text));
  },
});
