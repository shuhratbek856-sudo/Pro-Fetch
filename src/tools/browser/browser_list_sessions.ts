import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_list_sessions — List all open browser session ids
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_list_sessions',
  description: 'List all open browser session ids',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'list_sessions' });
  },
});
