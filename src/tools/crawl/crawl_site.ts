import { defineTool } from '../../core/tool.js';
import { crawlSite } from '../../core/crawl-tools.js';

/**
 * pro_fetch_crawl_site — Crawl a site page by page within scope and depth limits
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_crawl_site',
  description: 'Crawl a site page by page within scope and depth limits',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return crawlSite(input);
  },
});
