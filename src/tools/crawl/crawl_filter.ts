import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_crawl_filter — Set include and exclude regex filters for the crawl
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_crawl_filter',
  description: 'Set include and exclude regex filters for the crawl',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_crawl_filter', input);
  },
});
