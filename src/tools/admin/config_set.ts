import { allTools, usageStats } from '../../core/tool.js';
import { levelOf, PROFILE_LEVELS, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_config_set — Update a configuration key at runtime
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_config_set',
  description: 'Update a configuration key at runtime',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'PRO_FETCH_ kaliti' },
      value: { type: 'string', description: 'Qiymat' },
    },
    required: ['key', 'value'],
  },
  async handler(input) {
    const p = view(input);
    const allowed = [
      'PRO_FETCH_PROFILE',
      'PRO_FETCH_TIMEOUT_MS',
      'PRO_FETCH_MAX_BYTES',
      'PRO_FETCH_ALLOW_JS',
      'PRO_FETCH_CACHE_DIR',
    ];
    if (!allowed.includes(String(p.key))) return fail('Ruxsat etilgan kalitlar: ' + allowed.join(', '));
    process.env[String(p.key)] = String(p.value);
    return result('✅ ' + p.key + ' = ' + p.value + ' (sessiya)');
  },
});
