import { defineTool } from '../../core/tool.js';
import { runBrowserTool } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_scroll — Scroll the page to bottom or by a number of pixels
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_scroll',
  description: 'Scroll the page to bottom or by a number of pixels',
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
    return runBrowserTool('pro_browser_browser_scroll', input);
  },
});
