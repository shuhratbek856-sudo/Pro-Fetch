import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_robots_check — Check robots.txt permissions for a path
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_robots_check',
  description: 'Check robots.txt permissions for a path',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_robots_check', input);
  },
});
