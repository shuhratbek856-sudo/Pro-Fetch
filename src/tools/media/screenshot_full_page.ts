import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_screenshot_full_page — Take a full-length screenshot of a page
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_screenshot_full_page',
  description: 'Take a full-length screenshot of a page',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_screenshot_full_page', input);
  },
});
