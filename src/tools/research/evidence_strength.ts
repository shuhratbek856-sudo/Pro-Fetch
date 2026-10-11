import { defineTool } from '../../core/tool.js';
import { scoreEvidence } from '../../core/research-tools.js';

/**
 * pro_research_evidence_strength — Grade evidence strength for a set of claims
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_evidence_strength',
  description: 'Grade evidence strength for a set of claims',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return scoreEvidence(input);
  },
});
