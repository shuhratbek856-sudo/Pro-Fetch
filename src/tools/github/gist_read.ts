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
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_gist_read',
  description: 'Read a Gist by ID',
  category: 'github',
  inputSchema: ghSchema(['gist_id'], ['gist_id']),
  async handler(input) {
    const p = view(input);
    // Without this the call goes out as `/gists/undefined` and comes back a 404, which reads as
    // "gist not found" when the truth is "no gist was named".
    const gistId = typeof p.gist_id === 'string' ? p.gist_id.trim() : '';
    if (!gistId) return fail('MISSING_INPUT: gist_id majburiy.');
    const r = await ghApi('/gists/' + gistId);
    if (r.status >= 400) return ghErr(r.status, r.json);
    const files = Object.entries(r.json.files ?? {}).map(
      ([n, f]: any) => '## ' + n + '\n\n' + clipToTokens(f.content ?? '', 3000),
    );
    return md('# Gist: ' + (r.json.description ?? p.gist_id) + '\n\n' + files.join('\n\n---\n\n'));
  },
});
