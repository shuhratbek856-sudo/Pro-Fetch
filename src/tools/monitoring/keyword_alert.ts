import { defineTool } from '../../core/tool.js';
import { createHash } from 'node:crypto';
import { fetchWithOptions } from '../../core/http-client.js';
import { assertSafeUrl } from '../../core/ssrf-guard.js';
import { cache } from '../../core/cache.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_keyword_alert — Alert when a keyword appears on watched pages
 * Pack: monitoring (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_keyword_alert',
  description: 'Fetch a page and report matching keywords and newly matched keywords',
  category: 'monitoring',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "Tekshiriladigan sahifa URL'i" },
      keywords: { type: 'array', description: 'Kuzatiladigan so‘zlar', items: { type: 'string' } },
      terms: { type: 'array', description: 'keywords aliasi', items: { type: 'string' } },
      id: { type: 'string', description: 'Watch ID; default URL' },
      ttl_ms: { type: 'number', description: 'Snapshot saqlash muddati' },
    },
    required: ['url'],
  },
  async handler(input) {
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    if (!rawUrl) throw new Error('url parametri kerak.');
    const rawKeywords = Array.isArray(input.keywords) ? input.keywords : Array.isArray(input.terms) ? input.terms : [];
    const keywords = [
      ...new Set(
        rawKeywords
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    if (!keywords.length) throw new Error('keywords array bo‘sh bo‘lmasligi kerak.');
    const url = await assertSafeUrl(rawUrl);
    const response = await fetchWithOptions(url.toString(), { cache: false, timeoutMs: 20_000, maxBytes: 2_000_000 });
    if (response.status < 200 || response.status >= 300) throw new Error('Keyword page HTTP ' + response.status);
    const lower = response.text.toLocaleLowerCase();
    const matched = keywords.filter((keyword) => lower.includes(keyword.toLocaleLowerCase()));
    const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : url.toString();
    const key = 'monitor:keyword_alert:' + createHash('sha256').update(id).digest('hex').slice(0, 24);
    const previousEntry = cache.get(key);
    let previous: string[] = [];
    try {
      previous = JSON.parse(previousEntry?.value ?? '[]') as string[];
    } catch {
      previous = [];
    }
    const oldMatches = new Set(previous);
    const newlyMatched = matched.filter((keyword) => !oldMatches.has(keyword));
    const ttlValue = Number(input.ttl_ms ?? 7 * 86_400_000);
    const ttl = Number.isFinite(ttlValue)
      ? Math.max(60_000, Math.min(90 * 86_400_000, Math.floor(ttlValue)))
      : 7 * 86_400_000;
    cache.put(key, JSON.stringify(matched), ttl, { url: url.toString(), status: response.status });
    return result(
      JSON.stringify(
        { id, url: url.toString(), keywords, matched, newlyMatched, initialized: !previousEntry },
        null,
        2,
      ),
    );
  },
});
