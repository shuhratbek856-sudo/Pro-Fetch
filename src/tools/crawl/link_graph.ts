import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_link_graph — Build the internal link graph of crawled pages
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_link_graph',
  description: 'Build the internal link graph of crawled pages',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_link_graph', input);
  },
});
