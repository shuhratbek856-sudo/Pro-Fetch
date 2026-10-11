import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_get_state — Return an accessibility-style state snapshot (links, buttons, inputs)
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_get_state',
  description: 'Return an accessibility-style state snapshot (links, buttons, inputs)',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Sessiya (default)' },
      max_chars: { type: 'number', description: 'Maksimal belgi' },
    },
    required: [],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'get_state' });
  },
});
