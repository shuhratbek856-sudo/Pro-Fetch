import { defineTool } from '../../core/tool.js';
import { gatherSources } from '../../core/research-tools.js';

/**
 * pro_research_gather_sources — Fetch a list of candidate source URLs in parallel
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_gather_sources',
  description: 'Fetch a list of candidate source URLs in parallel',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return gatherSources(input);
  },
});
