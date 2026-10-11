import { defineTool } from '../../core/tool.js';
import { testCredentials } from '../../core/integration-tools.js';

/**
 * pro_fetch_credential_test — Test selected or stored credentials against a protected endpoint
 * Pack: auth (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_credential_test',
  description: 'Test all configured credentials',
  category: 'auth',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(input) {
    return testCredentials(input);
  },
});
