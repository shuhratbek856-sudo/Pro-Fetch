import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_oauth_device_flow — Run the OAuth device flow for a provider
 * Pack: auth (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_oauth_device_flow',
  description: 'Run the OAuth device flow for a provider',
  category: 'auth',
  inputSchema: {
    type: 'object',
    properties: { scope: { type: 'string', description: 'GitHub OAuth учун сўраладиган scope’лар' } },
  },
  async handler(input) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) throw new Error('GitHub device flow учун GITHUB_CLIENT_ID environment variable керак.');
    const scope = typeof input.scope === 'string' && input.scope.trim() ? input.scope.trim() : 'read:user repo';
    const response = await fetchWithOptions('https://github.com/login/device/code', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, scope }),
      timeoutMs: 15_000,
      maxBytes: 500_000,
      retries: 0,
    });
    if (response.status < 200 || response.status >= 300) throw new Error('GitHub device flow HTTP ' + response.status);
    const payload = JSON.parse(response.text) as {
      device_code?: string;
      user_code?: string;
      verification_uri?: string;
      verification_uri_complete?: string;
      expires_in?: number;
      interval?: number;
    };
    if (!payload.device_code || !payload.user_code || !payload.verification_uri)
      throw new Error('GitHub device flow response required fields қайтармади.');
    return result(
      JSON.stringify(
        {
          ...payload,
          client_secret_returned: false,
          instructions:
            'verification_uri’ни очиб, user_code’ни киритинг; polling учун device_code’ни secure storage’да сақланг.',
        },
        null,
        2,
      ),
    );
  },
});
