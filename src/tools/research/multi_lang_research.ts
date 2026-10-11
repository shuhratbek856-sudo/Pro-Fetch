import { defineTool } from '../../core/tool.js';
import { researchAcrossLanguages } from '../../core/research-tools.js';

/**
 * pro_research_multi_lang_research — Search the same question across multiple languages
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_multi_lang_research',
  description: 'Search the same question across multiple languages',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return researchAcrossLanguages(input);
  },
});
