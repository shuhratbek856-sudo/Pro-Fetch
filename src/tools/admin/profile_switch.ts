import { allTools, usageStats } from '../../core/tool.js';
import { isToolVisibleInProfile, PROFILE_LEVELS, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_profile_switch — Switch the active tool profile between smart, minimal, standard and full
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_profile_switch',
  description: 'Switch the active tool profile between smart, minimal, standard and full',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      profile: { type: 'string', description: 'smart | minimal | standard | full' },
    },
    required: ['profile'],
  },
  async handler(input) {
    const p = view(input);
    const prof = String(p.profile ?? 'standard');
    if (!(prof in PROFILE_LEVELS)) return fail('Profil: smart | minimal | standard | full');
    process.env.PRO_FETCH_PROFILE = prof;
    const active = allTools().filter((tool) =>
      isToolVisibleInProfile(tool, prof as keyof typeof PROFILE_LEVELS),
    ).length;
    return result('✅ Profil: ' + prof + ' — ' + active + " tool aktiv (keyingi so'rovlardan kuchga kiradi)");
  },
});
