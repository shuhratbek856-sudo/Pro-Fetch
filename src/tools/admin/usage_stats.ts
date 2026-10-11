import { executionStats } from '../../core/execution-engine.js';
import { networkConcurrencyStats } from '../../core/network-gate.js';
import { allTools, usageStats } from '../../core/tool.js';
import { levelOf, PROFILE_LEVELS, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_usage_stats — Show tool usage statistics
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_usage_stats',
  description: 'Show tool usage statistics',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(input) {
    const p = view(input);
    return jsonBlock('# Tool ishlatilishi va runtime telemetry', {
      tool_calls: usageStats(),
      execution: executionStats(),
      network: networkConcurrencyStats(),
      cache: cache.stats(),
      rate_limit: bucketsSnapshot(),
    });
  },
});
