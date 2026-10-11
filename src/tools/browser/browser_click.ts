import { defineTool } from '../../core/tool.js';
import { runBrowserTool } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_click — Click an element by selector in the open session
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_click',
  description: 'Click an element by selector in the open session',
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
    return runBrowserTool('pro_browser_browser_click', input);
  },
});
