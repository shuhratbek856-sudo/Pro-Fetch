import { defineTool } from '../../core/tool.js';
import { cache } from '../../core/cache.js';
import { fail, result } from '../../core/format.js';

/**
 * pro_fetch_session_restore — Restore a saved session
 * Pack: auth (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_session_restore',
  description: 'Restore a saved session',
  category: 'auth',
  inputSchema: {
    type: 'object',
    properties: { session_id: { type: 'string', description: 'Qayta tiklanadigan session identifikatori' } },
    required: ['session_id'],
  },
  async handler(input) {
    const id = typeof input.session_id === 'string' ? input.session_id.trim() : '';
    if (!id) throw new Error('session_id parametri kerak.');
    const entry = cache.get('auth:session:' + id);
    if (!entry) return fail('Session topilmadi yoki muddati tugagan: ' + id);
    return result(
      JSON.stringify(
        { session_id: id, savedAt: new Date(entry.createdAt).toISOString(), session: JSON.parse(entry.value) },
        null,
        2,
      ),
    );
  },
});
