import { defineTool } from '../../core/tool.js';
import { cache } from '../../core/cache.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_session_save — Persist the current session state
 * Pack: auth (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_session_save',
  description: 'Persist the current session state',
  category: 'auth',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Session identifikatori' },
      session: { type: 'object', description: 'Saqlanadigan session JSON qiymati' },
      data: { type: 'object', description: "Saqlanadigan session JSON ma'lumoti" },
      value: { type: 'object', description: 'Saqlanadigan session JSON qiymati' },
      ttl_ms: { type: 'number', description: 'Saqlash muddati millisekundda' },
    },
    required: ['session_id'],
  },
  async handler(input) {
    const id = typeof input.session_id === 'string' ? input.session_id.trim() : '';
    if (!id || id.length > 128) throw new Error('session_id 1-128 belgidan iborat bo‘lishi kerak.');
    const payload = input.session ?? input.data ?? input.value;
    if (payload === undefined) throw new Error('Saqlash uchun session qiymati kerak.');
    const serialized = JSON.stringify(payload);
    if (Buffer.byteLength(serialized, 'utf8') > 1_000_000) throw new Error('Session payload 1 MiB limitdan katta.');
    const ttlValue = Number(input.ttl_ms ?? 86_400_000);
    const ttl = Number.isFinite(ttlValue)
      ? Math.max(60_000, Math.min(365 * 86_400_000, Math.floor(ttlValue)))
      : 86_400_000;
    cache.put('auth:session:' + id, serialized, ttl);
    return result(JSON.stringify({ session_id: id, stored: true, expiresInMs: ttl }, null, 2));
  },
});
