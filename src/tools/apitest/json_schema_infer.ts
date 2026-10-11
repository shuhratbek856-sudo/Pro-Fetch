import { defineTool } from '../../core/tool.js';
import { runIntegrationTool } from '../../core/integration-tools.js';

/**
 * pro_fetch_json_schema_infer — Infer a JSON schema from sample responses
 * Pack: apitest (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_json_schema_infer',
  description: 'Infer a JSON schema from sample responses',
  category: 'apitest',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runIntegrationTool('pro_fetch_json_schema_infer', input);
  },
});
