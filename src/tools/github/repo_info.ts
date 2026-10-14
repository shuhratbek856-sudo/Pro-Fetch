import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_info — Get repository metadata such as language stars and license
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_repo_info',
  description: 'Get repository metadata such as language stars and license',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    if (!p.owner || !p.repo) return fail('owner va repo kerak');
    const r = await ghApi('/repos/' + p.owner + '/' + p.repo);
    if (r.status >= 400) return ghErr(r.status, r.json);
    return jsonBlock('# ' + p.owner + '/' + p.repo, {
      name: r.json.full_name,
      description: r.json.description,
      stars: r.json.stargazers_count,
      forks: r.json.forks_count,
      issues: r.json.open_issues_count,
      language: r.json.language,
      license: r.json.license?.spdx_id,
      default_branch: r.json.default_branch,
      created: r.json.created_at,
      updated: r.json.updated_at,
      homepage: r.json.homepage,
      topics: r.json.topics,
    });
  },
});
