import { defineTool } from '../../core/tool.js';
import { runMediaTool } from '../../core/media-tools.js';

/**
 * pro_fetch_video_metadata — Get duration codec and stream info of a video
 * Pack: media (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_video_metadata',
  description: 'Get duration codec and stream info of a video',
  category: 'media',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runMediaTool('pro_fetch_video_metadata', input);
  },
});
