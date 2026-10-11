import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_new_tab — Open a new browser tab (optionally at a URL) and make it active
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_new_tab',
  description: 'Open a new browser tab (optionally at a URL) and make it active',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Sessiya (default)' },
      url: { type: 'string', description: 'Ochiladigan URL' },
      timeout_ms: { type: 'number', description: 'Taymaut ms' },
    },
    required: [],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'new_tab' });
  },
});
