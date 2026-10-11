import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_clear_cookies — Clear all cookies in the browser session
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_clear_cookies',
  description: 'Clear all cookies in the browser session',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: { session_id: { type: 'string', description: 'Sessiya (default)' } },
    required: [],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'clear_cookies' });
  },
});
