import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_thumbnail_generate — Generate a small thumbnail from an image or video
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_thumbnail_generate',
  description: 'Generate a small thumbnail from an image or video',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_thumbnail_generate', input);
  },
});
