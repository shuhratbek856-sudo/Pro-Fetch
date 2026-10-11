import { defineTool } from '../../core/tool.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_unicode_normalize — Normalize Unicode text (NFC, NFD, NFKC, NFKD)
 * Pack: i18n (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_unicode_normalize',
  description: 'Normalize Unicode text (NFC, NFD, NFKC, NFKD)',
  category: 'i18n',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Matn' },
      format: { type: 'string', description: 'NFC|NFD|NFKC|NFKD' },
    },
    required: ['text', 'format'],
  },
  async handler(input) {
    const p = view(input);
    const form = String(p.format).toUpperCase();
    if (!['NFC', 'NFD', 'NFKC', 'NFKD'].includes(form)) return fail('format NFC|NFD|NFKC|NFKD.');
    return result(String(p.text ?? '').normalize(form as 'NFC' | 'NFD' | 'NFKC' | 'NFKD'));
  },
});
