import { defineTool } from '../../core/tool.js';
import { extractResearchFacts } from '../../core/research-tools.js';

/**
 * pro_research_extract_facts — Extract atomic facts with provenance from text
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_extract_facts',
  description: 'Extract atomic facts with provenance from text',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return extractResearchFacts(input);
  },
});
