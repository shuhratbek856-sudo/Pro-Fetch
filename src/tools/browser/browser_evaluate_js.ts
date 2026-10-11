import { defineTool } from '../../core/tool.js';
import { runBrowserTool } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_evaluate_js — Evaluate JS in the page and requires PRO_FETCH_ALLOW_JS
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_evaluate_js',
  description: 'Evaluate JS in the page and requires PRO_FETCH_ALLOW_JS',
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
    return runBrowserTool('pro_browser_browser_evaluate_js', input);
  },
});
