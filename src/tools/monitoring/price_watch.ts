import { defineTool } from '../../core/tool.js';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { fetchWithOptions } from '../../core/http-client.js';
import { assertSafeUrl } from '../../core/ssrf-guard.js';
import { cache } from '../../core/cache.js';
import { result } from '../../core/format.js';

function parsePrice(raw: string): { amount: number; currency: string; matchedText: string } | undefined {
  const match = raw.match(
    /(?:\b(USD|EUR|GBP|CAD|AUD|JPY|CNY|INR)\b\s*|([$€£¥₹])\s*)(\d{1,3}(?:[,.\s]\d{3})*(?:[,.]\d{1,2})?|\d+(?:[,.]\d{1,2})?)(?:\s*(USD|EUR|GBP|CAD|AUD|JPY|CNY|INR))?/i,
  );
  if (!match) return undefined;
  const numeric = match[3].replace(/[\s,](?=\d{3}(?:\D|$))/g, '').replace(/,(\d{1,2})$/, '.$1');
  const amount = Number(numeric);
  if (!Number.isFinite(amount)) return undefined;
  const symbols: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY', '₹': 'INR' };
  return {
    amount,
    currency: (match[1] ?? match[5] ?? symbols[match[2]] ?? '').toUpperCase(),
    matchedText: match[0].trim(),
  };
}

/**
 * pro_fetch_price_watch — Track the price of a product page
 * Pack: monitoring (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_price_watch',
  description: 'Fetch a product page, extract its price, and compare it with the previous snapshot',
  category: 'monitoring',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "Mahsulot sahifasi URL'i" },
      selector: { type: 'string', description: "Narx elementining CSS selector'i" },
      id: { type: 'string', description: 'Watch ID; default URL' },
      ttl_ms: { type: 'number', description: 'Price snapshot retention' },
    },
    required: ['url'],
  },
  async handler(input) {
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    if (!rawUrl) throw new Error('url parametri kerak.');
    const url = await assertSafeUrl(rawUrl);
    const response = await fetchWithOptions(url.toString(), { cache: false, timeoutMs: 20_000, maxBytes: 2_000_000 });
    if (response.status < 200 || response.status >= 300) throw new Error('Product page HTTP ' + response.status);
    const $ = load(response.text);
    const selector = typeof input.selector === 'string' ? input.selector.trim() : '';
    const selected = selector
      ? $(selector).first()
      : $(
          '[itemprop="price"],meta[property="product:price:amount"],meta[property="og:price:amount"],.price,[class*=price],[id*=price]',
        ).first();
    const rawPrice = selected.length
      ? String(selected.attr('content') ?? selected.text())
          .replace(/\s+/g, ' ')
          .trim()
      : $('body').text().replace(/\s+/g, ' ').trim();
    const parsed = parsePrice(rawPrice);
    if (!parsed)
      throw new Error('Narx topilmadi; selector bering yoki sahifada currency bilan yozilgan narx bo‘lishi kerak.');
    const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : url.toString();
    const key = 'monitor:price_watch:' + createHash('sha256').update(id).digest('hex').slice(0, 24);
    let previous: { amount?: number; currency?: string } | undefined;
    try {
      previous = JSON.parse(cache.get(key)?.value ?? 'null') as typeof previous;
    } catch {
      previous = undefined;
    }
    const compatible = previous?.currency === parsed.currency;
    const delta = compatible && typeof previous?.amount === 'number' ? parsed.amount - previous.amount : null;
    const percentChange = delta !== null && previous?.amount ? (delta / previous.amount) * 100 : null;
    const ttlValue = Number(input.ttl_ms ?? 7 * 86_400_000);
    const ttl = Number.isFinite(ttlValue)
      ? Math.max(60_000, Math.min(90 * 86_400_000, Math.floor(ttlValue)))
      : 7 * 86_400_000;
    cache.put(key, JSON.stringify(parsed), ttl, { url: url.toString(), status: response.status });
    return result(
      JSON.stringify(
        {
          id,
          url: url.toString(),
          ...parsed,
          initialized: !previous,
          changed: previous ? delta !== 0 : false,
          previous: previous ?? null,
          delta,
          percentChange,
          currencyChanged: Boolean(previous && !compatible),
        },
        null,
        2,
      ),
    );
  },
});
