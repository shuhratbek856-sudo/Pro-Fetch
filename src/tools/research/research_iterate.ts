import { defineTool } from '../../core/tool.js';
import { planResearchIteration } from '../../core/research-tools.js';

/**
 * pro_research_research_iterate — Run one research iteration step of search fetch and note
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_research_iterate',
  description: 'Run one research iteration step of search fetch and note',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return planResearchIteration(input);
  },
});
