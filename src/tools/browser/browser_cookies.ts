import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_cookies — Get or set browser cookies for the session
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_cookies',
  description: 'Get or set browser cookies for the session',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string', description: 'Sessiya (default)' },
      cookies: {
        type: 'array',
        items: { type: 'object' },
        description: 'Set qilish uchun cookie obyektlari (bo‘shlsa o‘qiladi)',
      },
    },
    required: [],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction({ ...input, action: input.cookies ? 'cookies_set' : 'cookies_get' });
  },
});
