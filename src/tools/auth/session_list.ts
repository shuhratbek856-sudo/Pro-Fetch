import { defineTool } from '../../core/tool.js';
import { cache } from '../../core/cache.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_session_list — List saved sessions
 * Pack: auth (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_session_list',
  description: 'List saved sessions',
  category: 'auth',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(input) {
    const sessions = cache.keys('auth:session:').flatMap((key) => {
      const entry = cache.get(key);
      return entry
        ? [{ session_id: key.slice('auth:session:'.length), savedAt: new Date(entry.createdAt).toISOString() }]
        : [];
    });
    return result(JSON.stringify({ count: sessions.length, sessions }, null, 2));
  },
});
