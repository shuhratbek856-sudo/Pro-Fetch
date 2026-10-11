import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_barcode_qr_read — Read a barcode or QR code from an image
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_barcode_qr_read',
  description: 'Read a barcode or QR code from an image',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_barcode_qr_read', input);
  },
});
