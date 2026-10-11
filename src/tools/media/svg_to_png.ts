import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_svg_to_png — Render an SVG to PNG
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_svg_to_png',
  description: 'Render an SVG to PNG',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_svg_to_png', input);
  },
});
