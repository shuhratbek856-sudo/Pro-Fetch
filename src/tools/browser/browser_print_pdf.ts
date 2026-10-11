import { defineTool } from '../../core/tool.js';
import { runBrowserTool } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_print_pdf — Print the current page to PDF
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_print_pdf',
  description: 'Print the current page to PDF',
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
    return runBrowserTool('pro_browser_browser_print_pdf', input);
  },
});
