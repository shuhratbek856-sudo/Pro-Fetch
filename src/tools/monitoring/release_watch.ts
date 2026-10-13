import { getCredential } from '../../core/credentials.js';
import { defineTool } from '../../core/tool.js';
import { createHash } from 'node:crypto';
import { fetchWithOptions } from '../../core/http-client.js';
import { cache } from '../../core/cache.js';
import { result } from '../../core/format.js';
import { parseUpstreamJson } from '../../core/json-response.js';

/**
 * pro_fetch_release_watch — Watch a GitHub repository for new releases
 * Pack: monitoring (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_release_watch',
  description: 'Fetch the latest GitHub release and compare it with the previous stored tag',
  category: 'monitoring',
  inputSchema: {
    type: 'object',
    properties: {
      repository: { type: 'string', description: 'GitHub owner/repo' },
      url: { type: 'string', description: 'GitHub repository URL (alternative to repository)' },
      ttl_ms: { type: 'number', description: 'Release snapshot retention' },
    },
    required: ['url'],
  },
  async handler(input) {
    const url = typeof input.url === 'string' ? input.url.trim() : '';
    const rawRepository = typeof input.repository === 'string' ? input.repository.trim() : '';
    const repository = rawRepository || (url.match(/github\.com\/([^/?#]+\/[^/?#]+)/i)?.[1] ?? '');
    const normalized = repository.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
    const parts = normalized.split('/');
    if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part)))
      throw new Error('repository owner/repo ёки GitHub repository URL беринг.');
    const [owner, repo] = parts;
    const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
    if (getCredential('GITHUB_TOKEN')) headers.authorization = 'Bearer ' + getCredential('GITHUB_TOKEN');
    const response = await fetchWithOptions(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`,
      { cache: false, headers, timeoutMs: 15_000, maxBytes: 1_000_000 },
    );
    if (response.status === 404) throw new Error(`GitHub repo ${normalized} учун published release топилмади.`);
    if (response.status < 200 || response.status >= 300) throw new Error('GitHub release API HTTP ' + response.status);
    const release = parseUpstreamJson(response, 'pro_fetch_release_watch') as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      published_at?: string;
      body?: string;
      draft?: boolean;
      prerelease?: boolean;
    };
    if (!release.tag_name) throw new Error('GitHub API release tag_name қайтармади.');
    const key =
      'monitor:release_watch:' + createHash('sha256').update(normalized.toLowerCase()).digest('hex').slice(0, 24);
    const previous = cache.get(key)?.value;
    const ttlValue = Number(input.ttl_ms ?? 7 * 86_400_000);
    const ttl = Number.isFinite(ttlValue)
      ? Math.max(60_000, Math.min(90 * 86_400_000, Math.floor(ttlValue)))
      : 7 * 86_400_000;
    cache.put(key, release.tag_name, ttl, { repository: normalized, url: release.html_url });
    return result(
      JSON.stringify(
        {
          repository: normalized,
          ...release,
          changed: previous !== undefined && previous !== release.tag_name,
          initialized: previous === undefined,
          previous: previous ?? null,
        },
        null,
        2,
      ),
    );
  },
});
