import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_broken_links — Find broken 40x and 50x links on a page or site
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_broken_links',
  description: 'Find broken 40x and 50x links on a page or site',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_broken_links', input);
  },
});
