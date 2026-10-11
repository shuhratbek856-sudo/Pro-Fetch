import { defineTool } from '../../core/tool.js';
import { deduplicateSources } from '../../core/research-tools.js';

/**
 * pro_research_dedupe_sources — Remove duplicate or mirrored sources
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_dedupe_sources',
  description: 'Remove duplicate or mirrored sources',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return deduplicateSources(input);
  },
});
