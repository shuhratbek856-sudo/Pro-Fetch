import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_pdf_ocr — Run OCR on scanned PDF pages
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_pdf_ocr',
  description: 'Run OCR on scanned PDF pages',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_pdf_ocr', input);
  },
});
