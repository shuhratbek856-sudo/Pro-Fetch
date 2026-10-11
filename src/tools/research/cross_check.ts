import { defineTool } from '../../core/tool.js';
import { crossCheckResearchClaims } from '../../core/research-tools.js';

/**
 * pro_research_cross_check — Cross-check a fact across two or more independent sources
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_cross_check',
  description: 'Cross-check a fact across two or more independent sources',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return crossCheckResearchClaims(input);
  },
});
