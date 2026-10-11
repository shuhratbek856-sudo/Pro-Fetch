import { fetchWithOptions } from '../../core/http-client.js';
import { jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_phone_extract — Extract phone numbers from HTML or text
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_phone_extract',
  description: 'Extract phone numbers from HTML or text',
  category: 'extract',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
      text: { type: 'string', description: 'Inline HTML/matn' },
      content: { type: 'string', description: 'Inline HTML (text alternativi)' },
    },
    required: [],
  },
  async handler(input) {
    const p = view(input);
    let html = String(p.text ?? p.content ?? '');
    if (!html && p.url) {
      const fr = await fetchWithOptions(String(p.url));
      html = fr.text;
    }
    if (!html) return fail('text, content yoki url kerak.');
    const $ = (await import('cheerio')).load(html);
    const t = $('body').text() || html;
    const found = [
      ...new Set(
        (t.match(/\+?\d[\d\s().-]{7,}\d/g) || []).map((x) => x.trim()).filter((x) => x.replace(/\D/g, '').length >= 8),
      ),
    ];
    return jsonBlock('# Phone numbers', { count: found.length, phones: found.slice(0, 100) });
  },
});
