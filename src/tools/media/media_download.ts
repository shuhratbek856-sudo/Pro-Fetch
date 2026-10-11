import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_media_download — Download a media file into the local cache
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_media_download',
  description: 'Download a media file into the local cache',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_media_download', input);
  },
});
