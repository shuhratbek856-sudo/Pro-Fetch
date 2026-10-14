import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_directory_read — Read all files in a repository directory
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view, pathStr, pathNum, asRecordArray } from '../../core/input.js';
type JsonRow = Record<string, unknown>;
export default defineTool({
  name: 'pro_gh_repo_directory_read',
  description: 'Read all files in a repository directory',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'path'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    const dir = String(p.path ?? '').replace(/^\/+|\/+$/g, '');
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo + '/contents/' + dir);
    if (r.status >= 400) return ghErr(r.status, r.json);
    const files = asRecordArray(r.json)
      .filter((e) => pathStr(e, 'type') === 'file')
      .slice(0, 20);
    const parts: string[] = [];
    for (const f of files) {
      const fr = await ghApi('/repos/' + p.owner + '/' + p.repo + '/contents/' + f.path, 'application/vnd.github.raw');
      parts.push('## ' + f.path + '\n\n' + (fr.status < 400 ? clipToTokens(fr.text, 2000) : "(o'qilmadi)"));
    }
    return md('# ' + (dir || 'root') + ' — ' + files.length + ' fayl\n\n' + parts.join('\n\n---\n\n'));
  },
});
