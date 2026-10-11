import { defineTool } from '../../core/tool.js';
import { analyzeResearchGaps } from '../../core/research-tools.js';

/**
 * pro_research_gap_analysis — Identify unanswered gaps in current research notes
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_gap_analysis',
  description: 'Identify unanswered gaps in current research notes',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return analyzeResearchGaps(input);
  },
});
