import { defineTool } from '../../core/tool.js';
import { verifyClaim } from '../../core/research-tools.js';

/**
 * pro_research_verify_claim — Verify a single claim against given sources
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_verify_claim',
  description: 'Verify a single claim against given sources',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return verifyClaim(input);
  },
});
