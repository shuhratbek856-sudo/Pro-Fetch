import { fetchWithOptions } from '../../core/http-client.js';
import { jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_price_extract — Extract currency/price amounts from HTML or text
 * Pack: extract (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_price_extract',
  description: 'Extract currency/price amounts from HTML or text',
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
    const re = /[$€£₽₹]\s?\d[\d.,]*|\d[\d.,]*\s?(?:USD|EUR|GBP|JPY|RUB|INR|UZS)/g;
    const found = [...new Set(t.match(re) || [])];
    return jsonBlock('# Prices', { count: found.length, prices: found.slice(0, 100) });
  },
});
