import { allTools, usageStats } from '../../core/tool.js';
import { levelOf, PROFILE_LEVELS, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_cache_tune — Adjust cache TTL and size limits
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_cache_tune',
  description: 'Adjust cache TTL and size limits',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      default_ttl_ms: { type: 'number', description: 'Standart TTL ms' },
      max_entries: { type: 'number', description: 'Max yozuv' },
    },
    required: [],
  },
  async handler(input) {
    const p = view(input);
    cache.tune({
      defaultTtlMs: p.default_ttl_ms ? Number(p.default_ttl_ms) : undefined,
      maxEntries: p.max_entries ? Number(p.max_entries) : undefined,
    });
    return result('✅ Cache sozlandi: ' + JSON.stringify(cache.stats()));
  },
});
