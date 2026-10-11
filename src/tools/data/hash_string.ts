import { jsonBlock, fail } from '../../core/format.js';
import { createHash } from 'node:crypto';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_hash_string — Hash text with SHA-256, SHA-1, MD5 or SHA-512
 * Pack: data (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_hash_string',
  description: 'Hash text with SHA-256, SHA-1, MD5 or SHA-512',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Matn' },
      algo: { type: 'string', description: 'sha256|sha1|md5|sha512' },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const algo = String(p.algo || 'sha256').toLowerCase();
    if (!['sha256', 'sha1', 'md5', 'sha512'].includes(algo)) return fail('algo sha256|sha1|md5|sha512 bo‘lishi kerak.');
    return jsonBlock('# ' + algo, {
      algo,
      input_length: String(p.text ?? '').length,
      digest: createHash(algo)
        .update(String(p.text ?? ''), 'utf8')
        .digest('hex'),
    });
  },
});
