import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_exif_read — Read EXIF metadata of a photo
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_exif_read',
  description: 'Read EXIF metadata of a photo',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_exif_read', input);
  },
});
