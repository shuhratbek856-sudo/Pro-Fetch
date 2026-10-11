import { defineTool } from '../../core/tool.js';
import { runBrowserAction } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_action — Consolidated advanced browser control
 * Pack: browser (pro-fetch)
 *
 * One clean dispatcher instead of many tiny tools: navigation history, page state
 * extraction, tabs, cookies, dialogs, keyboard/mouse, and session management.
 */
export default defineTool({
  name: 'pro_browser_browser_action',
  description:
    'Advanced browser actions: back, forward, get_state, get_html, get_text, get_url, get_title, hover, select, press, new_tab, list_tabs, switch_tab, close_tab, cookies_get, cookies_set, handle_dialog, list_sessions, close_session, close_all',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [
          'back',
          'forward',
          'get_state',
          'get_html',
          'get_text',
          'get_url',
          'get_title',
          'hover',
          'select',
          'press',
          'new_tab',
          'list_tabs',
          'switch_tab',
          'close_tab',
          'cookies_get',
          'cookies_set',
          'handle_dialog',
          'list_sessions',
          'close_session',
          'close_all',
        ],
        description: 'Bajariladigan amal',
      },
      session_id: { type: 'string', description: 'Sessiya identifikatori (standart: default)' },
      url: { type: 'string', description: 'new_tab uchun ochiladigan manzil' },
      selector: { type: 'string', description: 'CSS selektor (hover/select uchun)' },
      value: { type: 'string', description: 'select qiymati, press tugmasi yoki dialog amali (accept/dismiss)' },
      key: { type: 'string', description: 'press uchun klaviatura tugmasi' },
      index: { type: 'number', description: 'switch_tab/close_tab uchun tab indeksi' },
      cookies: {
        type: 'array',
        items: { type: 'object' },
        description: "cookies_set uchun cookie obyektlari ro'yxati",
      },
      prompt_text: { type: 'string', description: 'handle_dialog accept uchun prompt matni' },
      max_chars: { type: 'number', description: 'get_html/get_text/get_state uchun maksimal belgi' },
      timeout_ms: { type: 'number', description: 'Amal taymauti millisekundda' },
    },
    required: ['action'],
    additionalProperties: false,
  },
  async handler(input) {
    return runBrowserAction(input);
  },
});
