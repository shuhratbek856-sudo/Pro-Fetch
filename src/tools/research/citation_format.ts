import { defineTool } from '../../core/tool.js';
import { formatCitations } from '../../core/research-tools.js';

/**
 * pro_research_citation_format — Format citations in APA MLA or BibTeX for given sources
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_citation_format',
  description: 'Format citations in APA MLA or BibTeX for given sources',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return formatCitations(input);
  },
});
