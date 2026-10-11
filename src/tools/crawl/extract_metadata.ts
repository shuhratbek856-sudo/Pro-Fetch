import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_extract_metadata — Extract title description OG and twitter meta tags
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_extract_metadata',
  description: 'Extract title description OG and twitter meta tags',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_extract_metadata', input);
  },
});
