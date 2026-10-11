import { defineTool } from '../../core/tool.js';
import { summarizeResearch } from '../../core/research-tools.js';

/**
 * pro_research_research_report — Compile a final cited research report
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_research_report',
  description: 'Compile a final cited research report',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return summarizeResearch(input, true);
  },
});
