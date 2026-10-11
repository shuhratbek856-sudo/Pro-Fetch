import { defineTool } from '../../core/tool.js';
import { summarizeResearch } from '../../core/research-tools.js';

/**
 * pro_research_research_summarize — Summarize the research state from gathered notes
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_research_summarize',
  description: 'Summarize the research state from gathered notes',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return summarizeResearch(input);
  },
});
