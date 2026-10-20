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
import { parseUpstreamJson } from '../../core/json-response.js';
export default defineTool({
  name: 'pro_fetch_fetch_graphql',
  description: 'Send a GraphQL query to an endpoint and return data',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'GraphQL endpoint' },
      query: { type: 'string', description: "GraphQL so'rov" },
      // `JSON.stringify({ query, variables: p.variables ?? {} })`. The handler read it and the schema
      // did not name it, so a query could not be parameterised through the tool at all.
      variables: { type: 'object', description: 'GraphQL o‘zgaruvchilari', additionalProperties: true },
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
    // A 4xx/5xx reports as failed even with well-formed GraphQL JSON in the body; before this
    // check an upstream outage reached the caller as a normal result with the status only in a
    // heading.
    if (r.status >= 400) return fail('GraphQL HTTP ' + r.status + ': ' + String(r.text).trim().slice(0, 600));
    return jsonBlock('# GraphQL ' + p.url, parseUpstreamJson(r, 'pro_fetch_fetch_graphql'));
  },
});
