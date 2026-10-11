import { defineTool } from '../../core/tool.js';
import { buildResearchPlan } from '../../core/research-tools.js';

/**
 * pro_research_research_plan — Break a research question into 3-7 searchable sub-questions
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_research_plan',
  description: 'Break a research question into 3-7 searchable sub-questions',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return buildResearchPlan(input);
  },
});
