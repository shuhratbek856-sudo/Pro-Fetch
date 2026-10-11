import { defineTool } from '../../core/tool.js';
import { runIntegrationTool } from '../../core/integration-tools.js';

/**
 * pro_fetch_api_rate_limit_probe — Probe API rate limits safely
 * Pack: apitest (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_api_rate_limit_probe',
  description: 'Probe API rate limits safely',
  category: 'apitest',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runIntegrationTool('pro_fetch_api_rate_limit_probe', input);
  },
});
