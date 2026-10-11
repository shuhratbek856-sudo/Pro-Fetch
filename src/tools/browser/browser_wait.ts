import { defineTool } from '../../core/tool.js';
import { runBrowserTool } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_wait — Wait for a selector navigation or timeout
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_wait',
  description: 'Wait for a selector navigation or timeout',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Ochiladigan manzil (URL)' },
      selector: { type: 'string', description: "CSS selektor (kerak bo'lsa)" },
    },
    required: ['url'],
  },
  async handler(input) {
    return runBrowserTool('pro_browser_browser_wait', input);
  },
});
