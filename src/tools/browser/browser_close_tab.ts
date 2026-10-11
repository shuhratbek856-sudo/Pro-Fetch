import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_close_tab — Close a tab by index
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_close_tab',
  description: 'Close a tab by index',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Sessiya (default)' },
      index: { type: 'number', description: 'Tab indeksi' },
    },
    required: [],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'close_tab' });
  },
});
