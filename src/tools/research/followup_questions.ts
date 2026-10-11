import { defineTool } from '../../core/tool.js';
import { generateFollowupQuestions } from '../../core/research-tools.js';

/**
 * pro_research_followup_questions — Generate follow-up questions from current findings
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_followup_questions',
  description: 'Generate follow-up questions from current findings',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return generateFollowupQuestions(input);
  },
});
