import { getCredential } from '../../core/credentials.js';
import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';
import { parseUpstreamJson } from '../../core/json-response.js';

/**
 * pro_fetch_github_auth_status — Check GitHub token validity and scopes
 * Pack: auth (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_github_auth_status',
  description: 'Check GitHub token validity and scopes',
  category: 'auth',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(input) {
    const token = getCredential('GITHUB_TOKEN');
    if (!token)
      return result(JSON.stringify({ configured: false, authenticated: false, message: 'GITHUB_TOKEN sozlanmagan.' }));
    const response = await fetchWithOptions('https://api.github.com/user', {
      headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json' },
      timeoutMs: 10_000,
      maxBytes: 500_000,
      retries: 0,
    });
    let user = '';
    try {
      user = String((parseUpstreamJson(response, 'pro_fetch_github_auth_status') as { login?: string }).login ?? '');
    } catch {
      /* API may return non-JSON error text. */
    }
    const scopes = (response.headers['x-oauth-scopes'] ?? '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean);
    return result(
      JSON.stringify(
        {
          configured: true,
          authenticated: response.status === 200,
          status: response.status,
          user,
          scopes,
          tokenReturned: false,
        },
        null,
        2,
      ),
    );
  },
});
