import { allTools, usageStats } from '../../core/tool.js';
import { levelOf, PROFILE_LEVELS, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_log_tail — Tail the recent server logs
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_log_tail',
  description: 'Tail the recent server logs',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      lines: { type: 'number', description: 'Oxirgi N satr (default 30)' },
    },
    required: [],
  },
  async handler(input) {
    const p = view(input);
    const lines = tail(Number(p.lines ?? 30));
    return result('# Log (oxirgi ' + lines.length + ' satr)\n\n' + lines.join('\n') || "(log bo'sh)");
  },
});
