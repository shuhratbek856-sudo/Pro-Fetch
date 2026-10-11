import { defineTool } from '../../core/tool.js';
import { buildCitationGraph } from '../../core/research-tools.js';

/**
 * pro_research_citation_graph — Build a citation graph between gathered sources
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_citation_graph',
  description: 'Build a citation graph between gathered sources',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return buildCitationGraph(input);
  },
});
