import { defineTool } from '../../core/tool.js';
import { controlCrawlJob } from '../../core/crawl-tools.js';

/**
 * pro_fetch_crawl_pause_resume — Pause or resume a running crawl
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_crawl_pause_resume',
  description: 'Pause or resume a running crawl',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return controlCrawlJob(input);
  },
});
