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
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_repo_info',
  description: 'Get repository metadata such as language stars and license',
  category: 'github',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository egasi' },
      repo: { type: 'string', description: 'Repository nomi' },
      path: { type: 'string', description: "Fayl yoki papka yo'li" },
      ref: { type: 'string', description: 'Branch, tag yoki SHA' },
      issue_number: { type: 'number', description: 'Issue raqami' },
      pr_number: { type: 'number', description: 'PR raqami' },
      sha: { type: 'string', description: 'Commit SHA' },
      base: { type: 'string', description: 'Taqqoslash bazasi' },
      head: { type: 'string', description: 'Taqqoslash boshi' },
      state: { type: 'string', description: 'open | closed | all' },
      per_page: { type: 'number', description: 'Natija soni (default 20-30)' },
      page: { type: 'number', description: 'Sahifa raqami' },
      query: { type: 'string', description: "Qidiruv so'rovi" },
      user: { type: 'string', description: 'Foydalanuvchi' },
      org: { type: 'string', description: 'Tashkilot' },
      gist_id: { type: 'string', description: 'Gist ID' },
      tag: { type: 'string', description: 'Tag nomi' },
    },
    required: [],
  },
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
