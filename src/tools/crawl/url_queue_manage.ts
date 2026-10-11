import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_url_queue_manage — Inspect add or pause the crawl URL queue
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_url_queue_manage',
  description: 'Inspect add or pause the crawl URL queue',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_url_queue_manage', input);
  },
});
