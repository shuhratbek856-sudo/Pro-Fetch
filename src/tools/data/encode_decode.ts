import { result, fail } from '../../core/format.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_encode_decode — Encode or decode text as Base64, URL or hex
 * Pack: data (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_encode_decode',
  description: 'Encode or decode text as Base64, URL or hex',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Matn' },
      action: {
        type: 'string',
        description: 'base64_encode|base64_decode|url_encode|url_decode|hex_encode|hex_decode',
      },
    },
    required: ['text', 'action'],
  },
  async handler(input) {
    const p = view(input);
    const a = String(p.action || '').toLowerCase();
    const s = String(p.text ?? '');
    switch (a) {
      case 'base64_encode':
        return result(Buffer.from(s, 'utf8').toString('base64'));
      case 'base64_decode':
        return result(Buffer.from(s, 'base64').toString('utf8'));
      case 'url_encode':
        return result(encodeURIComponent(s));
      case 'url_decode':
        return result(decodeURIComponent(s));
      case 'hex_encode':
        return result(Buffer.from(s, 'utf8').toString('hex'));
      case 'hex_decode':
        return result(Buffer.from(s, 'hex').toString('utf8'));
      default:
        return fail('action base64_encode|base64_decode|url_encode|url_decode|hex_encode|hex_decode.');
    }
  },
});
