import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_crawl_result_merge — Merge multi-page crawl results into one dataset
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_crawl_result_merge',
  description: 'Merge multi-page crawl results into one dataset',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_crawl_result_merge', input);
  },
});
