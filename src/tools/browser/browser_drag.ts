import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_drag — Drag an element and drop it onto a target selector
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_drag',
  description: 'Drag an element and drop it onto a target selector',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Sessiya (default)' },
      selector: { type: 'string', description: 'Manba CSS selektor' },
      target_selector: { type: 'string', description: 'Maqsad CSS selektor' },
      timeout_ms: { type: 'number', description: 'Taymaut ms' },
    },
    required: ['selector', 'target_selector'],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'drag' });
  },
});
