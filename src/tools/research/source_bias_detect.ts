import { defineTool } from '../../core/tool.js';
import { detectSourceBias } from '../../core/research-tools.js';

/**
 * pro_research_source_bias_detect — Detect bias indicators in a source
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_source_bias_detect',
  description: 'Detect bias indicators in a source',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return detectSourceBias(input);
  },
});
