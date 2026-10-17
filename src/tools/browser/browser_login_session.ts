import { defineTool } from '../../core/tool.js';
import { runBrowserTool } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_login_session — Perform a login flow and persist cookies
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_login_session',
  description:
    'Login oqimini bajarish va cookie saqlash. username_selector va password_selector orqali ' +
    'kirish ma’lumotlari to‘ldiriladi, submit_selector bosiladi va storage_state_path berilsa ' +
    'sessiya holati faylga yoziladi.',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Ochiladigan manzil (URL)' },
      selector: { type: 'string', description: "CSS selektor (kerak bo'lsa)" },
      username_selector: { type: 'string', description: 'Foydalanuvchi maydoni selektori' },
      password_selector: { type: 'string', description: 'Parol maydoni selektori' },
      username: { type: 'string', description: 'Foydalanuvchi nomi' },
      // Published so it can be sent at all; redacted on the way out by `sanitizeToolError`, which
      // collects values whose key name matches `password` from the input.
      password: { type: 'string', description: 'Parol' },
      fields: {
        type: 'object',
        description: 'Qo‘shimcha maydonlar: CSS selektor -> qiymat',
        additionalProperties: { type: 'string' },
      },
      submit_selector: { type: 'string', description: 'Yuborish tugmasi (ixtiyoriy)' },
      wait_after_submit: { type: 'boolean', description: 'Yuborishdan keyin yuklanishni kutish (standart: ha)' },
      // Already in the policy engine's contained-output list; declared so it is reachable.
      storage_state_path: { type: 'string', description: 'Cookie holati saqlanadigan fayl yo‘li' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runBrowserTool('pro_browser_browser_login_session', input);
  },
});
