import { result } from '../../core/format.js';
import { randomBytes } from 'node:crypto';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_random_string — Generate a cryptographically random string from a charset
 * Pack: data (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_random_string',
  description: 'Generate a cryptographically random string from a charset',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      length: { type: 'number', description: 'Uzunlik (1-1024)' },
      charset: { type: 'string', description: 'Ixtiyoriy belgilar to‘plami' },
    },
    required: [],
  },
  async handler(input) {
    const p = view(input);
    const len = Math.max(1, Math.min(1024, Number(p.length ?? 16)));
    const set = String(p.charset || 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
    if (!set.length) return result('');
    const bytes = randomBytes(len);
    return result(
      Array.from(bytes)
        .map((b) => set[b % set.length])
        .join(''),
    );
  },
});
