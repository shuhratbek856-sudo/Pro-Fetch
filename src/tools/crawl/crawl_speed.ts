import { defineTool } from '../../core/tool.js';
import { setCrawlSpeed } from '../../core/crawl-tools.js';

/**
 * pro_fetch_crawl_speed — Set crawl rate and politeness delay
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_crawl_speed',
  description: 'Set crawl rate and politeness delay',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return setCrawlSpeed(input);
  },
});
