import { defineTool } from '../../core/tool.js';
import { runBrowserTool } from '../../core/browser-tools.js';

/**
 * pro_browser_browser_form_fill — Fill and submit a form by field map
 * Pack: browser (pro-fetch)
 */
export default defineTool({
  name: 'pro_browser_browser_form_fill',
  description:
    'Shaklni maydonlar xaritasi orqali to‘ldirish va yuborish. fields - CSS selektor -> qiymat ' +
    'obyekti. submit_selector berilsa, shu tugma bosiladi; berilmasa, shakl yuborilmaydi va ' +
    'faqat qiymatlar to‘ldirilgan holda qoladi.',
  category: 'browser',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Ochiladigan manzil (URL)' },
      selector: { type: 'string', description: "CSS selektor (kerak bo'lsa)" },
      fields: {
        type: 'object',
        description: 'CSS selektor -> kiritiladigan qiymat. JSON satr sifatida ham berilishi mumkin.',
        additionalProperties: { type: 'string' },
      },
      // Declared because the tool is described as "fill and submit" and the submit selector was not
      // reachable through the published schema. A client validating against this schema had no way to
      // send it, so the submit half of the advertised behaviour could not be used.
      submit_selector: { type: 'string', description: 'Yuborish tugmasi (ixtiyoriy)' },
      wait_after_submit: { type: 'boolean', description: 'Yuborishdan keyin yuklanishni kutish (standart: ha)' },
    },
    required: ['url'],
  },
  async handler(input) {
    return runBrowserTool('pro_browser_browser_form_fill', input);
  },
});
