import { defineTool } from '../../core/tool.js';
import { buildResearchTimeline } from '../../core/research-tools.js';

/**
 * pro_research_timeline_build — Build a chronological timeline from dated facts
 * Pack: research (pro-fetch)
 */
export default defineTool({
  name: 'pro_research_timeline_build',
  description: 'Build a chronological timeline from dated facts',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
    },
    required: ['query'],
  },
  async handler(input) {
    return buildResearchTimeline(input);
  },
});
