import { defineTool } from '../../core/tool.js';
import { cache } from '../../core/cache.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_api_key_set — Set an API key for a provider for this session
 * Pack: auth (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_api_key_set',
  description: 'Set an API key for a provider for this session',
  category: 'auth',
  inputSchema: {
    type: 'object',
    properties: {
      key_name: { type: 'string', description: 'Provider API key nomi' },
      api_key: { type: 'string', description: 'Maxfiy API kalit' },
      ttl_ms: { type: 'number', description: 'Saqlash muddati millisekundda' },
    },
    required: ['key_name', 'api_key'],
  },
  async handler(input) {
    const name = typeof input.key_name === 'string' ? input.key_name.trim() : '';
    const secret = typeof input.api_key === 'string' ? input.api_key : '';
    if (!name || !secret) throw new Error('key_name va api_key bo‘sh bo‘lmasligi kerak.');
    if (name.length > 128) throw new Error('key_name 128 belgidan oshmasligi kerak.');
    const ttlValue = Number(input.ttl_ms ?? 86_400_000);
    const ttl = Number.isFinite(ttlValue)
      ? Math.max(60_000, Math.min(365 * 86_400_000, Math.floor(ttlValue)))
      : 86_400_000;
    cache.put('auth:apikey:' + name, secret, ttl);
    return result(JSON.stringify({ key_name: name, stored: true, expiresInMs: ttl, secretReturned: false }, null, 2));
  },
});
