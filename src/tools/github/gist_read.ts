import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_gist_read — Read a Gist by ID
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_gist_read',
  description: 'Read a Gist by ID',
  category: 'github',
  inputSchema: {
    type: 'object',
    properties: {
      gist_id: { type: 'string', description: 'Gist ID' },
    },
    required: ['gist_id'],
  },
  async handler(input) {
    const p = view(input);
    const r = await ghApi('/gists/' + p.gist_id);
    if (r.status >= 400) return ghErr(r.status, r.json);
    const files = Object.entries(r.json.files ?? {}).map(
      ([n, f]: any) => '## ' + n + '\n\n' + clipToTokens(f.content ?? '', 3000),
    );
    return md('# Gist: ' + (r.json.description ?? p.gist_id) + '\n\n' + files.join('\n\n---\n\n'));
  },
});
