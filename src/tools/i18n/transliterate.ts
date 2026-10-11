import { defineTool } from '../../core/tool.js';
import { runIntegrationTool } from '../../core/integration-tools.js';

/**
 * pro_fetch_transliterate — Transliterate text between scripts
 * Pack: i18n (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_transliterate',
  description: 'Transliterate text between scripts',
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
    return runIntegrationTool('pro_fetch_transliterate', input);
  },
});
