import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_extract_links — Extract all links from a page with anchor text
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_extract_links',
  description: 'Extract all links from a page with anchor text',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_extract_links', input);
  },
});
