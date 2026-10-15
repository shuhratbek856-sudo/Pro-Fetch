import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { assertSafeUrl } from '../../core/ssrf-guard.js';
import { cache } from '../../core/cache.js';
import { result } from '../../core/format.js';
import { sanitizeToolError } from '../../core/tool.js';

/**
 * pro_fetch_bearer_fetch — Fetch a URL with bearer token authentication
 * Pack: auth (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_bearer_fetch',
  description: 'Fetch a URL with bearer token authentication',
  category: 'auth',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Bearer Auth билан чақириладиган URL' },
      token: { type: 'string', description: 'Bearer token; secret' },
      key_name: { type: 'string', description: 'Аввал сақланган API key номи' },
      method: { type: 'string', enum: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'], description: 'HTTP method' },
      headers: { type: 'object', description: 'Qo‘shimcha HTTP headerlar', additionalProperties: { type: 'string' } },
      body: { type: 'string', description: 'Optional request body' },
      max_chars: { type: 'number', description: 'Javob matni limiti' },
    },
    required: ['url'],
    anyOf: [{ required: ['token'] }, { required: ['key_name'] }],
  },
  async handler(input) {
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    if (!rawUrl) throw new Error('url parametri kerak.');
    const keyName = typeof input.key_name === 'string' ? input.key_name.trim() : '';
    // `bearer_token` is the alias `AUTH_TOOL_REQUIREMENTS` advertises as an alternative to `token`
    // for this tool, and `runIntegrationTool` already reads it that way (`str(input, 'token',
    // 'bearer_token')`). The handler here read only `input.token`, so a caller who followed the
    // schema and sent `bearer_token` got "token ёки мавжуд key_name керак" from a call the schema
    // said was valid. Verified by calling both spellings before this change.
    const directToken =
      typeof input.token === 'string' && input.token.trim()
        ? input.token.trim()
        : typeof input.bearer_token === 'string' && input.bearer_token.trim()
          ? input.bearer_token.trim()
          : '';
    const token = directToken ? directToken : keyName ? (cache.get('auth:apikey:' + keyName)?.value ?? '') : '';
    if (!token) throw new Error('token ёки мавжуд key_name керак.');
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
      headers: { ...userHeaders, authorization: 'Bearer ' + token },
      body: typeof input.body === 'string' ? input.body : undefined,
      timeoutMs: Number(input.timeout_ms ?? 15_000),
      maxBytes: Number(input.max_bytes ?? 2_000_000),
      retries: 0,
    });
    const maxCharsValue = Number(input.max_chars ?? 8000);
    const maxChars = Number.isFinite(maxCharsValue) ? Math.max(0, Math.min(50_000, Math.floor(maxCharsValue))) : 8000;
    const safeBody = sanitizeToolError(response.text, { ...input, token });
    return result(
      JSON.stringify(
        {
          url: url.toString(),
          method,
          status: response.status,
          contentType: response.contentType,
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
