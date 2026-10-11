import { defineTool } from '../../core/tool.js';
import { resolveEntities } from '../../core/research-tools.js';

/**
 * pro_research_entity_resolve — Resolve the same entity across differently named sources
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_entity_resolve',
  description: 'Resolve the same entity across differently named sources',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return resolveEntities(input);
  },
});
