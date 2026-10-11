import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_close_all — Close all browser sessions
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_close_all',
  description: 'Close all browser sessions',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'close_all' });
  },
});
