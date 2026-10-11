import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_image_info — Get dimensions format and metadata of an image
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_image_info',
  description: 'Get dimensions format and metadata of an image',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_image_info', input);
  },
});
