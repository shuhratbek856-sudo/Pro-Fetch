import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_extract_pagination — Discover the pagination URLs of a listing page
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_extract_pagination',
  description: 'Discover the pagination URLs of a listing page',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_extract_pagination', input);
  },
});
