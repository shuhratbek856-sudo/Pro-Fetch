import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_hover — Hover over an element matched by CSS selector
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_hover',
  description: 'Hover over an element matched by CSS selector',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Sessiya (default)' },
      selector: { type: 'string', description: 'CSS selektor' },
      timeout_ms: { type: 'number', description: 'Taymaut ms' },
    },
    required: ['selector'],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'hover' });
  },
});
