import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_switch_tab — Switch the active tab by index
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_switch_tab',
  description: 'Switch the active tab by index',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Sessiya (default)' },
      index: { type: 'number', description: 'Tab indeksi' },
    },
    required: ['index'],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'switch_tab' });
  },
});
