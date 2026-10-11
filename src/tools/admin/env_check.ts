import { allTools, usageStats } from '../../core/tool.js';
import { levelOf, PROFILE_LEVELS, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_env_check — Check required environment variables and API keys
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { credentialStatus } from '../../core/credentials.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_env_check',
  description: 'Check required environment variables and API keys',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(input) {
    const p = view(input);
    // Read through the credential resolver so a `<NAME>_FILE` secret is reported as configured.
    // Checking `process.env` directly reported "missing" for setups that use a secret file.
    const check = (name: string): boolean => credentialStatus(name).configured;
    return jsonBlock('# Environment tekshiruvi', {
      GITHUB_TOKEN: check('GITHUB_TOKEN') ? '✅' : '▫︎ (jamoa repolari 60 sorov/soat)',
      SEARCH_API_KEY: check('SEARCH_API_KEY') ? '✅' : '▫︎ (search pack shablon)',
      SERPER_API_KEY: check('SERPER_API_KEY') ? '✅' : '▫︎ (ixtiyoriy)',
      JIRA_TOKEN: check('JIRA_TOKEN') ? '✅' : '▫︎ (ixtiyoriy)',
      OPENAI_API_KEY: check('OPENAI_API_KEY') ? '✅' : '▫︎ (audio/embedding uchun)',
      HTTPS_PROXY: check('HTTPS_PROXY') ? '✅' : '▫︎',
      PRO_FETCH_PROFILE: process.env.PRO_FETCH_PROFILE ?? 'standard (default)',
      node: process.version,
    });
  },
});
