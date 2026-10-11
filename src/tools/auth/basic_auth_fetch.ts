import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { assertSafeUrl } from '../../core/ssrf-guard.js';
import { result } from '../../core/format.js';
import { sanitizeToolError } from '../../core/tool.js';

/**
 * pro_fetch_basic_auth_fetch — Fetch a URL with basic authentication
 * Pack: auth (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_basic_auth_fetch',
  description: 'Fetch a URL with basic authentication',
  category: 'auth',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Basic Auth билан чақириладиган URL' },
      username: { type: 'string', description: 'HTTP Basic username' },
      password: { type: 'string', description: 'HTTP Basic password; secret' },
      method: { type: 'string', enum: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method' },
      headers: { type: 'object', description: 'Qo‘shimcha HTTP headerlar', additionalProperties: { type: 'string' } },
      body: { type: 'string', description: 'Optional request body' },
      max_chars: { type: 'number', description: 'Javob matni limiti' },
    },
    required: ['url', 'username', 'password'],
  },
  async handler(input) {
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    const username = typeof input.username === 'string' ? input.username : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!rawUrl || !username || !password) throw new Error('url, username ва password керак.');
    const url = await assertSafeUrl(rawUrl);
    const method = typeof input.method === 'string' ? input.method.toUpperCase() : 'GET';
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
      throw new Error('HTTP method қўллаб-қувватланмайди.');
    const userHeaders =
      input.headers && typeof input.headers === 'object' && !Array.isArray(input.headers)
        ? (input.headers as Record<string, string>)
        : {};
    const response = await fetchWithOptions(url.toString(), {
      method,
      headers: { ...userHeaders, authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64') },
      body: typeof input.body === 'string' ? input.body : undefined,
      timeoutMs: Number(input.timeout_ms ?? 15_000),
      maxBytes: Number(input.max_bytes ?? 2_000_000),
      retries: 0,
    });
    const maxCharsValue = Number(input.max_chars ?? 8000);
    const maxChars = Number.isFinite(maxCharsValue) ? Math.max(0, Math.min(50_000, Math.floor(maxCharsValue))) : 8000;
    const safeBody = sanitizeToolError(response.text, input);
    return result(
      JSON.stringify(
        {
          url: url.toString(),
          method,
          status: response.status,
          contentType: response.contentType,
          headers: { 'www-authenticate': response.headers['www-authenticate'] },
          body: safeBody.slice(0, maxChars),
          truncated: response.truncated || safeBody.length > maxChars,
          credentialReturned: false,
        },
        null,
        2,
      ),
    );
  },
});
