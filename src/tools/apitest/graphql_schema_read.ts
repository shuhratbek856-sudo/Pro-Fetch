import { defineTool } from '../../core/tool.js';
import { runIntegrationTool } from '../../core/integration-tools.js';

/**
 * pro_fetch_graphql_schema_read — Read and render a GraphQL schema as SDL
 * Pack: apitest (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_graphql_schema_read',
  description: 'Read and render a GraphQL schema as SDL',
  category: 'apitest',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runIntegrationTool('pro_fetch_graphql_schema_read', input);
  },
});
