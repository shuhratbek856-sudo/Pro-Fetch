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
 * pro_fetch_health_check — Run server self diagnostics
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_health_check',
  description: 'Run server self diagnostics',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(input) {
    const p = view(input);
    const runtime = executionStats();
    return jsonBlock('# Health check', {
      ok: true,
      uptime_sec: Math.round(process.uptime()),
      node: process.version,
      tools: allTools().length,
      cache: cache.stats(),
      execution: runtime.totals,
      network: networkConcurrencyStats(),
      configuredConcurrency: {
        tools: process.env.PRO_FETCH_MAX_CONCURRENCY ?? '32',
        perCategory: process.env.PRO_FETCH_MAX_CATEGORY_CONCURRENCY ?? '8',
        network: process.env.PRO_FETCH_MAX_NETWORK_CONCURRENCY ?? '32',
        perHost: process.env.PRO_FETCH_MAX_PER_HOST_CONCURRENCY ?? '4',
      },
    });
  },
});
