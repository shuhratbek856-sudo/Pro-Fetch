import { defineTool } from '../../core/tool.js';
import { DOMParser } from '@xmldom/xmldom';
import { load } from 'cheerio';
import { select } from 'xpath';
import { fetchWithOptions } from '../../core/http-client.js';
import { assertSafeUrl } from '../../core/ssrf-guard.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_xpath_select — Select elements from HTML via XPath
 * Pack: extract (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_xpath_select',
  description: 'Select elements from HTML via XPath',
  category: 'extract',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
      xpath: { type: 'string', description: 'XPath ifodasi' },
      limit: { type: 'number', description: 'Eng ko‘p natija (1-500)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    const expression = typeof input.xpath === 'string' ? input.xpath.trim() : '';
    if (!rawUrl || !expression) throw new Error('url va xpath parametrlari kerak.');
    const safeUrl = await assertSafeUrl(rawUrl);
    const response = await fetchWithOptions(safeUrl.toString(), {
      timeoutMs: Number(input.timeout_ms ?? 15_000),
      maxBytes: Number(input.max_bytes ?? 2_000_000),
    });
    if (response.status < 200 || response.status >= 300) throw new Error('XPath manba HTTP ' + response.status);
    const diagnostics: string[] = [];
    const html = load(response.text);
    const document = new DOMParser({ onError: (_level, message) => diagnostics.push(message) }).parseFromString(
      html.xml(),
      'application/xml',
    );
    let matches: unknown[];
    try {
      matches = select(expression, document as unknown as Parameters<typeof select>[1]) as unknown[];
    } catch (error) {
      throw new Error('XPath ifodasi yaroqsiz: ' + (error instanceof Error ? error.message : String(error)));
    }
    const limitValue = Number(input.limit ?? 100);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(500, Math.floor(limitValue))) : 100;
    const values = matches
      .slice(0, limit)
      .map((match) => {
        if (typeof match === 'string' || typeof match === 'number' || typeof match === 'boolean') return String(match);
        const node = match as { nodeValue?: string | null; textContent?: string | null; toString?: () => string };
        return (node.nodeValue ?? node.textContent ?? node.toString?.() ?? '').trim();
      })
      .filter(Boolean);
    return result(
      JSON.stringify(
        {
          url: safeUrl.toString(),
          xpath: expression,
          count: values.length,
          truncated: matches.length > limit,
          results: values,
          parseWarnings: diagnostics.slice(0, 5),
        },
        null,
        2,
      ),
    );
  },
});
