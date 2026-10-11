import { defineTool } from '../../core/tool.js';
import { runIntegrationTool } from '../../core/integration-tools.js';

/**
 * pro_fetch_wsdl_parse — Parse a WSDL SOAP definition
 * Pack: apitest (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_wsdl_parse',
  description: 'Parse a WSDL SOAP definition',
  category: 'apitest',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runIntegrationTool('pro_fetch_wsdl_parse', input);
  },
});
