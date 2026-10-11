import { defineTool } from '../../core/tool.js';
import { buildKnowledgeGraph } from '../../core/research-tools.js';

/**
 * pro_research_build_knowledge_graph — Build an entity-relation graph from gathered facts
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_build_knowledge_graph',
  description: 'Build an entity-relation graph from gathered facts',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return buildKnowledgeGraph(input);
  },
});
