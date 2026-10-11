import { defineTool } from '../../core/tool.js';
import { runIntegrationTool } from '../../core/integration-tools.js';

/**
 * pro_fetch_mixed_lang_split — Split mixed-language text into language segments
 * Pack: i18n (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_mixed_lang_split',
  description: 'Split mixed-language text into language segments',
  category: 'i18n',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Tarjima uchun matn' },
      target_lang: { type: 'string', description: 'Maqsad til (ISO kodi)' },
    },
    required: ['text', 'target_lang'],
  },
  async handler(input) {
    return runIntegrationTool('pro_fetch_mixed_lang_split', input);
  },
});
