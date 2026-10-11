import { defineTool } from '../../core/tool.js';
import { runBrowserTool } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_login_session — Perform a login flow and persist cookies
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_login_session',
  description: 'Perform a login flow and persist cookies',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Ochiladigan manzil (URL)' },
      selector: { type: 'string', description: "CSS selektor (kerak bo'lsa)" },
    },
    required: ['url'],
  },
  async handler(input) {
    return runBrowserTool('pro_browser_browser_login_session', input);
  },
});
