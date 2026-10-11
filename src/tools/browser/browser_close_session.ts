import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_close_session — Close a specific browser session and persist its state
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_close_session',
  description: 'Close a specific browser session and persist its state',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: { session_id: { type: 'string', description: 'Yopiladigan sessiya' } },
    required: ['session_id'],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'close_session' });
  },
});
