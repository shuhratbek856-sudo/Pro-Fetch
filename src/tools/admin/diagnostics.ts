import { executionStats } from '../../core/execution-engine.js';
import { networkConcurrencyStats } from '../../core/network-gate.js';
import { credentialStatus } from '../../core/credentials.js';
import { allTools, usageStats } from '../../core/tool.js';
import { levelOf, PROFILE_LEVELS, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_diagnostics — Run a full diagnostic report
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { nativeMediaAvailable } from '../../core/media-tools.js';
import { playwrightAvailable } from '../../core/browser-tools.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_diagnostics',
  description: 'Run a full diagnostic report',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(input) {
    const p = view(input);
    return jsonBlock('# Diagnostika', {
      health: { uptime_sec: Math.round(process.uptime()), node: process.version, tools: allTools().length },
      // Platform and native-binary availability, so a user on Alpine/musl or an unsupported
      // glibc can see exactly which optional tools are unavailable and why.
      platform: {
        os: process.platform,
        arch: process.arch,
        release: process.platform === 'win32' ? (process.env.OS ?? undefined) : process.release.name,
        native_media: await nativeMediaAvailable(),
        playwright: await playwrightAvailable(),
      },
      cache: cache.stats(),
      rate_limit: bucketsSnapshot(),
      env: {
        GITHUB_TOKEN: credentialStatus('GITHUB_TOKEN'),
        SEARCH_API_KEY: credentialStatus('SEARCH_API_KEY'),
        OPENAI_API_KEY: credentialStatus('OPENAI_API_KEY'),
      },
      execution: executionStats(),
      network: networkConcurrencyStats(),
      logs: tail(20),
    });
  },
});
