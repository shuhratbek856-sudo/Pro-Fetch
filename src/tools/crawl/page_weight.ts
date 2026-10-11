import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_page_weight — Measure page size and asset weight
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_page_weight',
  description: 'Measure page size and asset weight',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_page_weight', input);
  },
});
