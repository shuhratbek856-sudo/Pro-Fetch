import { credentialStatus } from '../../core/credentials.js';
import { allTools, usageStats } from '../../core/tool.js';
import { levelOf, PROFILE_LEVELS, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_config_get — Read the current server configuration
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_config_get',
  description: 'Read the current server configuration',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(input) {
    const p = view(input);
    const cfg: Record<string, unknown> = {};
    for (const k of [
      'PRO_FETCH_PROFILE',
      'PRO_FETCH_TIMEOUT_MS',
      'PRO_FETCH_MAX_BYTES',
      'PRO_FETCH_TOOL_TIMEOUT_MS',
      'PRO_FETCH_HTTP_CACHE_TTL_MS',
      'PRO_FETCH_MAX_CONCURRENCY',
      'PRO_FETCH_MAX_CATEGORY_CONCURRENCY',
      'PRO_FETCH_MAX_NETWORK_CONCURRENCY',
      'PRO_FETCH_MAX_PER_HOST_CONCURRENCY',
      'PRO_FETCH_BROWSER_MAX_SESSIONS',
      'PRO_FETCH_READ_ONLY',
      'PRO_FETCH_OUTPUT_ROOT',
      'PRO_FETCH_GITHUB_MAX_PAGES',
      'PRO_FETCH_ALLOW_JS',
      'PRO_FETCH_CACHE_DIR',
      'HTTPS_PROXY',
      'HTTP_PROXY',
      'ALL_PROXY',
      'NO_PROXY',
    ])
      cfg[k] = process.env[k] ?? "(o'rnatilmagan)";
    cfg.GITHUB_TOKEN = credentialStatus('GITHUB_TOKEN');
    cfg.SEARCH_API_KEY = credentialStatus('SEARCH_API_KEY');
    cfg.OPENAI_API_KEY = credentialStatus('OPENAI_API_KEY');
    return jsonBlock('# Konfiguratsiya', cfg);
  },
});
