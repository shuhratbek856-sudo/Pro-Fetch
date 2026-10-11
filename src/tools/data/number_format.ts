import { jsonBlock, fail } from '../../core/format.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_number_format — Format a number as decimal, currency or percent with locale
 * Pack: data (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_number_format',
  description: 'Format a number as decimal, currency or percent with locale',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      value: { type: 'string', description: 'Son' },
      style: { type: 'string', description: 'decimal|currency|percent' },
      currency: { type: 'string', description: 'Valyuta kodi (USD)' },
      locale: { type: 'string', description: 'Locale (en-US)' },
      decimals: { type: 'number', description: 'Kasr raqamlari soni' },
    },
    required: ['value'],
  },
  async handler(input) {
    const p = view(input);
    const v = Number(p.value);
    if (!Number.isFinite(v)) return fail('value son bo‘lishi kerak.');
    const style = String(p.style || 'decimal');
    const locale = String(p.locale || 'en-US');
    const opts: Intl.NumberFormatOptions = { style: style as Intl.NumberFormatOptions['style'] };
    if (style === 'currency') opts.currency = String(p.currency || 'USD');
    if (typeof p.decimals === 'number') {
      opts.minimumFractionDigits = Number(p.decimals);
      opts.maximumFractionDigits = Number(p.decimals);
    }
    return jsonBlock('# Number format', { formatted: new Intl.NumberFormat(locale, opts).format(v) });
  },
});
