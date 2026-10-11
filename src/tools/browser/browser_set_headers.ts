import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_set_headers — Set extra HTTP headers for all requests in the session
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_set_headers',
  description: 'Set extra HTTP headers for all requests in the session',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Sessiya (default)' },
      headers: { type: 'object', description: 'Header nom -> qiymat' },
    },
    required: ['headers'],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'set_headers' });
  },
});
