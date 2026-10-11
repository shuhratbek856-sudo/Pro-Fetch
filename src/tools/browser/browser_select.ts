import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_select — Select an option value in a <select> element
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_select',
  description: 'Select an option value in a <select> element',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Sessiya (default)' },
      selector: { type: 'string', description: 'CSS selektor' },
      value: { type: 'string', description: 'Tanlanadigan qiymat' },
    },
    required: ['selector', 'value'],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'select' });
  },
});
