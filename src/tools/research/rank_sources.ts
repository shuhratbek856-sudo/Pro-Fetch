import { defineTool } from '../../core/tool.js';
import { rankSources } from '../../core/research-tools.js';

/**
 * pro_research_rank_sources — Rank sources by credibility and relevance
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_rank_sources',
  description: 'Rank sources by credibility and relevance',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return rankSources(input);
  },
});
