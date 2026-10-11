import { defineTool } from '../../core/tool.js';
import { runBrowserTool } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_device_emulate — Emulate a device such as mobile tablet or desktop
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_device_emulate',
  description: 'Emulate a device such as mobile tablet or desktop',
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
    return runBrowserTool('pro_browser_browser_device_emulate', input);
  },
});
