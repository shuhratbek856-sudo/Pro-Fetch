import { defineTool } from '../../core/tool.js';
import { cache } from '../../core/cache.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_cookie_jar_manage — Inspect or clear stored cookies
 * Pack: auth (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_cookie_jar_manage',
  description: 'Inspect or clear stored cookies',
  category: 'auth',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Cookie jar identifikatori' },
      action: { type: 'string', enum: ['list', 'set', 'delete', 'clear'], description: 'Cookie amali' },
      cookie_name: { type: 'string', description: 'Cookie nomi' },
      value: { type: 'string', description: 'Cookie qiymati; list натижасида қайтарилмайди' },
      ttl_ms: { type: 'number', description: 'Jar saqlash muddati millisekundda' },
    },
  },
  async handler(input) {
    const id = typeof input.session_id === 'string' ? input.session_id.trim() : 'default';
    const key = 'auth:cookies:' + id;
    let jar: Record<string, string> = {};
    try {
      jar = JSON.parse(cache.get(key)?.value ?? '{}') as Record<string, string>;
    } catch {
      jar = {};
    }
    const action = typeof input.action === 'string' ? input.action : 'list';
    const cookieName = typeof input.cookie_name === 'string' ? input.cookie_name.trim() : '';
    if (!['list', 'set', 'delete', 'clear'].includes(action))
      throw new Error('action list, set, delete ёки clear бўлиши керак.');
    if (action === 'set') {
      const value = typeof input.value === 'string' ? input.value : '';
      if (!cookieName || !value) throw new Error('set учун cookie_name ва value керак.');
      if (cookieName.length > 256 || value.length > 8192) throw new Error('Cookie name/value size limitdan oshdi.');
      jar[cookieName] = value;
    } else if (action === 'delete') {
      if (!cookieName) throw new Error('delete учун cookie_name керак.');
      delete jar[cookieName];
    } else if (action === 'clear') jar = {};
    if (action !== 'list' || !cache.get(key)) {
      const ttlValue = Number(input.ttl_ms ?? 86_400_000);
      const ttl = Number.isFinite(ttlValue)
        ? Math.max(60_000, Math.min(365 * 86_400_000, Math.floor(ttlValue)))
        : 86_400_000;
      cache.put(key, JSON.stringify(jar), ttl);
    }
    return result(
      JSON.stringify(
        {
          session_id: id,
          action,
          count: Object.keys(jar).length,
          cookie_names: Object.keys(jar),
          secretsReturned: false,
        },
        null,
        2,
      ),
    );
  },
});
