import { defineTool } from '../../core/tool.js';
import { setCrawlDomainScope } from '../../core/crawl-tools.js';

/**
 * pro_fetch_crawl_domain_scope — Restrict the crawl to a domain or subdomain scope
 * Pack: crawl (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_crawl_domain_scope',
  description: 'Restrict the crawl to a domain or subdomain scope',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return setCrawlDomainScope(input);
  },
});
