import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_get_url — Return the current page URL
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_get_url',
  description: 'Return the current page URL',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: { session_id: { type: 'string', description: 'Sessiya (default)' } },
    required: [],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'get_url' });
  },
});
