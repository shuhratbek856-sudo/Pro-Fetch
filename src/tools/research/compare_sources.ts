import { defineTool } from '../../core/tool.js';
import { compareResearchSources } from '../../core/research-tools.js';

/**
 * pro_research_compare_sources — Compare how multiple sources describe the same topic
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_compare_sources',
  description: 'Compare how multiple sources describe the same topic',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return compareResearchSources(input);
  },
});
