import { defineTool } from '../../core/tool.js';
import { setCrawlDepth } from '../../core/crawl-tools.js';

/**
 * pro_fetch_crawl_depth_control — Set crawl depth and budget for the current session
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_crawl_depth_control',
  description: 'Set crawl depth and budget for the current session',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return setCrawlDepth(input);
  },
});
