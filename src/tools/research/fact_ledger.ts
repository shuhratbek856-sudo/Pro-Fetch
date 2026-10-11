import { defineTool } from '../../core/tool.js';
import { buildFactLedger } from '../../core/research-tools.js';

/**
 * pro_research_fact_ledger — Read or append the persistent fact ledger for a session
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_fact_ledger',
  description: 'Read or append the persistent fact ledger for a session',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return buildFactLedger(input);
  },
});
