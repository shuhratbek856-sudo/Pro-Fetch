import { jsonBlock, fail } from '../../core/format.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_jwt_decode — Decode a JWT header and payload without signature verification
 * Pack: data (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_jwt_decode',
  description: 'Decode a JWT header and payload without signature verification',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: { token: { type: 'string', description: 'JWT token' } },
    required: ['token'],
  },
  async handler(input) {
    const p = view(input);
    const t = String(p.token ?? '').trim();
    const parts = t.split('.');
    if (parts.length < 2) return fail('JWT formatida emas (header.payload.signature).');
    const dec = (seg: string) =>
      JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    try {
      return jsonBlock('# JWT (decode only, unverified)', { header: dec(parts[0]), payload: dec(parts[1]) });
    } catch {
      return fail('JWT qismlari decode qilinmadi.');
    }
  },
});
