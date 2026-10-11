import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_upload_file — Upload a local file into a file input matched by selector
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_upload_file',
  description: 'Upload a local file into a file input matched by selector',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Sessiya (default)' },
      selector: { type: 'string', description: 'File input CSS selektor' },
      file_path: { type: 'string', description: 'Lokal fayl yo‘li' },
    },
    required: ['selector', 'file_path'],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'upload_file' });
  },
});
