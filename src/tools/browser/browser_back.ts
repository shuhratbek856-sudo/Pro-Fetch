import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_back — Go back in the browser session history
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_back',
  description: 'Go back in the browser session history',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: { session_id: { type: 'string', description: 'Sessiya (default)' } },
    required: [],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'back' });
  },
});
