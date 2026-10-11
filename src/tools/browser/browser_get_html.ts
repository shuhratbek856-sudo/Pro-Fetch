import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_get_html — Return the full rendered HTML of the current page
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_get_html',
  description: 'Return the full rendered HTML of the current page',
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
    return runBrowserAction({ ...input, action: 'get_html' });
  },
});
