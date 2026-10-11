import { defineTool } from '../../core/tool.js';
import { detectContradictions } from '../../core/research-tools.js';

/**
 * pro_research_contradiction_detect — Detect contradictions between sources
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_contradiction_detect',
  description: 'Detect contradictions between sources',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return detectContradictions(input);
  },
});
