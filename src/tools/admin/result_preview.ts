import { allTools, usageStats } from '../../core/tool.js';
import { levelOf, PROFILE_LEVELS, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_result_preview — Preview a stored result with token counting
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_result_preview',
  description: 'Preview a stored result with token counting',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Cache kalit' },
      max_tokens: { type: 'number', description: 'Preview limit' },
    },
    required: ['key'],
  },
  async handler(input) {
    const p = view(input);
    const hit = cache.get(String(p.key));
    if (!hit) return fail('Cache da topilmadi: ' + p.key);
    const text = hit.value;
    return result(
      '# ' + p.key + '\n\n~' + estimateTokens(text) + ' token\n\n' + clipToTokens(text, Number(p.max_tokens ?? 1000)),
    );
  },
});
