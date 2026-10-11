import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_spa_render — Render a JavaScript heavy page via headless browser
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_spa_render',
  description: 'Render a JavaScript heavy page via headless browser',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_spa_render', input);
  },
});
