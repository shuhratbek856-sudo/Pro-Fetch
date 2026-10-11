import { defineTool } from '../../core/tool.js';
import { crawlForTopic } from '../../core/research-tools.js';

/**
 * pro_research_crawl_for_topic — Crawl topically relevant pages for a research question
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_crawl_for_topic',
  description: 'Crawl topically relevant pages for a research question',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return crawlForTopic(input);
  },
});
