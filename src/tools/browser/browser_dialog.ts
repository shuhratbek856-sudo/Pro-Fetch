import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_dialog — Arm handling of the next alert/confirm/prompt dialog (accept/dismiss)
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_dialog',
  description: 'Arm handling of the next alert/confirm/prompt dialog (accept/dismiss)',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Sessiya (default)' },
      value: { type: 'string', description: 'accept yoki dismiss' },
      prompt_text: { type: 'string', description: 'Prompt uchun matn' },
    },
    required: [],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: 'handle_dialog' });
  },
});
