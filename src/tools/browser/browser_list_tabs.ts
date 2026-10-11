import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_list_tabs — List all open tabs in the browser session
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_list_tabs',
  description: 'List all open tabs in the browser session',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: { session_id: { type: 'string', description: 'Sessiya (default)' } },
    required: [],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'list_tabs' });
  },
});
