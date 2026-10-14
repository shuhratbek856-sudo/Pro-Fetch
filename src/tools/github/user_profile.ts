import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_user_profile — Get a GitHub user profile and stats
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_user_profile',
  description: 'Get a GitHub user profile and stats',
  category: 'github',
  inputSchema: ghSchema(['user'], ['user']),
  async handler(input) {
    const p = view(input);
    // Without this the path becomes `/users/undefined` and GitHub's 404 reads as "no such user"
    // when the truth is that no user was named.
    const user = typeof p.user === 'string' ? p.user.trim() : '';
    if (!user) return fail('MISSING_INPUT: user majburiy.');
    const r = await ghApi('/users/' + encodeURIComponent(user));
    if (r.status >= 400) return ghErr(r.status, r.json);
    return jsonBlock('# ' + r.json.login, {
      name: r.json.name,
      company: r.json.company,
      bio: r.json.bio,
      followers: r.json.followers,
      public_repos: r.json.public_repos,
      created: r.json.created_at,
    });
  },
});
