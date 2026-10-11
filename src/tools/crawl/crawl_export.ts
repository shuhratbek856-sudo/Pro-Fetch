import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_crawl_export — Export crawl results as JSON CSV or Markdown
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_crawl_export',
  description: 'Export crawl results as JSON CSV or Markdown',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_crawl_export', input);
  },
});
