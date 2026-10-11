import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_image_resize — Resize an image to target dimensions
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_image_resize',
  description: 'Resize an image to target dimensions',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_image_resize', input);
  },
});
