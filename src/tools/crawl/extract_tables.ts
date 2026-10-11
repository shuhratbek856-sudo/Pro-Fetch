import { defineTool } from '../../core/tool.js';
import { runCrawlTool } from '../../core/crawl-tools.js';

/**
 * pro_fetch_extract_tables — Extract all HTML tables as dataframes
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_extract_tables',
  description: 'Extract all HTML tables as dataframes',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runCrawlTool('pro_fetch_extract_tables', input);
  },
});
