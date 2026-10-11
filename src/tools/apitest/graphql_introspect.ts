import { defineTool } from '../../core/tool.js';
import { runIntegrationTool } from '../../core/integration-tools.js';

/**
 * pro_fetch_graphql_introspect — Introspect a GraphQL endpoint schema
 * Pack: apitest (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_graphql_introspect',
  description: 'Introspect a GraphQL endpoint schema',
  category: 'apitest',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runIntegrationTool('pro_fetch_graphql_introspect', input);
  },
});
