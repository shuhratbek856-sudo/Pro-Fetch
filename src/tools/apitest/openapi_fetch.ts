import { defineTool } from '../../core/tool.js';
import { runIntegrationTool } from '../../core/integration-tools.js';

/**
 * pro_fetch_openapi_fetch — Fetch an OpenAPI or Swagger spec from a URL
 * Pack: apitest (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_openapi_fetch',
  description: 'Fetch an OpenAPI or Swagger spec from a URL',
  category: 'apitest',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runIntegrationTool('pro_fetch_openapi_fetch', input);
  },
});
