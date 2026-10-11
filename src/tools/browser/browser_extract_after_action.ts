import { defineTool } from '../../core/tool.js';
import { runBrowserTool } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_extract_after_action — Extract content after an interaction step
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_extract_after_action',
  description: 'Extract content after an interaction step',
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
    return runBrowserTool('pro_browser_browser_extract_after_action', input);
  },
});
