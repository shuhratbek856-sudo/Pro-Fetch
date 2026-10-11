import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_download — Click a selector and capture the resulting download
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_download',
  description: 'Click a selector and capture the resulting download',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Sessiya (default)' },
      selector: { type: 'string', description: 'Bosiladigan CSS selektor' },
      save_path: { type: 'string', description: 'Saqlash yo‘li' },
      timeout_ms: { type: 'number', description: 'Taymaut ms' },
    },
    required: [],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'download' });
  },
});
