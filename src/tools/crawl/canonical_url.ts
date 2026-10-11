import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_canonical_url — Resolve the canonical URL of a page
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_canonical_url',
  description: 'Resolve the canonical URL of a page',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_canonical_url', input);
  },
});
