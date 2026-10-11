import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_press_key — Press a keyboard key (optionally on a specific element)
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_press_key',
  description: 'Press a keyboard key (optionally on a specific element)',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Sessiya (default)' },
      key: { type: 'string', description: 'Tugma, masalan Enter' },
      selector: { type: 'string', description: 'CSS selektor (ixtiyoriy)' },
    },
    required: ['key'],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'press' });
  },
});
