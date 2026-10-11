import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_image_ocr — Run OCR on an image URL and return text
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_image_ocr',
  description: 'Run OCR on an image URL and return text',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_image_ocr', input);
  },
});
