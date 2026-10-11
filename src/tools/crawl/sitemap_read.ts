import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_sitemap_read — Parse sitemap.xml or robots sitemaps into a URL list
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_sitemap_read',
  description: 'Parse sitemap.xml or robots sitemaps into a URL list',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_sitemap_read', input);
  },
});
