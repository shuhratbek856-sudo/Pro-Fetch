import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_favicon_fetch — Fetch the favicon of a domain
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_favicon_fetch',
  description: 'Fetch the favicon of a domain',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_favicon_fetch', input);
  },
});
