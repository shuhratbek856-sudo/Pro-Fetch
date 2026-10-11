import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_get_title — Return the current page title
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_get_title',
  description: 'Return the current page title',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: { session_id: { type: 'string', description: 'Sessiya (default)' } },
    required: [],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'get_title' });
  },
});
