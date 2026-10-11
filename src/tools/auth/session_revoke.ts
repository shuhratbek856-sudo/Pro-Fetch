import { defineTool } from '../../core/tool.js';
import { cache } from '../../core/cache.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_session_revoke — Revoke and delete a saved session
 * Pack: auth (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_session_revoke',
  description: 'Revoke and delete a saved session',
  category: 'auth',
  inputSchema: {
    type: 'object',
    properties: { session_id: { type: 'string', description: 'O‘chiriladigan session identifikatori' } },
    required: ['session_id'],
  },
  async handler(input) {
    const id = typeof input.session_id === 'string' ? input.session_id.trim() : '';
    if (!id) throw new Error('session_id parametri kerak.');
    return result(JSON.stringify({ session_id: id, revoked: cache.delete('auth:session:' + id) > 0 }));
  },
});
