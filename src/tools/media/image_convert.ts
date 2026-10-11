import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_image_convert — Convert an image between formats such as png webp and jpeg
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_image_convert',
  description: 'Convert an image between formats such as png webp and jpeg',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_image_convert', input);
  },
});
