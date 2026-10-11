import { defineTool } from '../../core/tool.js';
import { runIntegrationTool } from '../../core/integration-tools.js';

/**
 * pro_fetch_swagger_validate — Validate a spec against OpenAPI rules
 * Pack: apitest (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_swagger_validate',
  description: 'Validate a spec against OpenAPI rules',
  category: 'apitest',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runIntegrationTool('pro_fetch_swagger_validate', input);
  },
});
