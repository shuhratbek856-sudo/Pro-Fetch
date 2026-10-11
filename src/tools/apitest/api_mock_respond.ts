import { defineTool } from '../../core/tool.js';
import { runIntegrationTool } from '../../core/integration-tools.js';

/**
 * pro_fetch_api_mock_respond — Return a mock response for an endpoint
 * Pack: apitest (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_api_mock_respond',
  description: 'Return a mock response for an endpoint',
  category: 'apitest',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runIntegrationTool('pro_fetch_api_mock_respond', input);
  },
});
