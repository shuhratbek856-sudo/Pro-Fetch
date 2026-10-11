import { defineTool } from '../../core/tool.js';
import { runIntegrationTool } from '../../core/integration-tools.js';

/**
 * pro_fetch_api_diff — Diff two versions of an API spec
 * Pack: apitest (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_api_diff',
  description: 'Diff two versions of an API spec',
  category: 'apitest',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runIntegrationTool('pro_fetch_api_diff', input);
  },
});
