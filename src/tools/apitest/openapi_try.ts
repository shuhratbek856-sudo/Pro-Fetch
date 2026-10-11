import { defineTool } from '../../core/tool.js';
import { runIntegrationTool } from '../../core/integration-tools.js';

/**
 * pro_fetch_openapi_try — Execute an endpoint defined in an OpenAPI spec
 * Pack: apitest (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_openapi_try',
  description: 'Execute an endpoint defined in an OpenAPI spec',
  category: 'apitest',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runIntegrationTool('pro_fetch_openapi_try', input);
  },
});
