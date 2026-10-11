import { defineTool } from '../../core/tool.js';
import { generateHypotheses } from '../../core/research-tools.js';

/**
 * pro_research_hypothesis_generate — Generate testable hypotheses from findings
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_hypothesis_generate',
  description: 'Generate testable hypotheses from findings',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return generateHypotheses(input);
  },
});
