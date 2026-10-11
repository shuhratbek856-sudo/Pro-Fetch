import { defineTool } from '../../core/tool.js';
import { load } from 'cheerio';
import { fetchWithOptions } from '../../core/http-client.js';
import { assertSafeUrl } from '../../core/ssrf-guard.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_paginated_table_read — Read a table spanning multiple paginated pages
 * Pack: extract (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_paginated_table_read',
  description: 'Read a table spanning multiple paginated pages',
  category: 'extract',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
      selector: { type: 'string', description: "Jadval CSS selector'i (default table)" },
      max_pages: { type: 'number', description: 'O‘qiladigan maksimal page (1-20)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    if (!rawUrl) throw new Error('url parametri kerak.');
    const startUrl = await assertSafeUrl(rawUrl);
    const selector = typeof input.selector === 'string' && input.selector.trim() ? input.selector.trim() : 'table';
    const pagesValue = Number(input.max_pages ?? 5);
    const maxPages = Number.isFinite(pagesValue) ? Math.max(1, Math.min(20, Math.floor(pagesValue))) : 5;
    const visited = new Set<string>();
    const rows: string[][] = [];
    let currentUrl = startUrl.toString();
    let pageCount = 0;
    while (currentUrl && pageCount < maxPages && !visited.has(currentUrl)) {
      const safeCurrent = await assertSafeUrl(currentUrl);
      if (safeCurrent.hostname !== startUrl.hostname) throw new Error('Pagination same-host URL doirasidan chiqdi.');
      currentUrl = safeCurrent.toString();
      visited.add(currentUrl);
      const response = await fetchWithOptions(currentUrl, {
        timeoutMs: Number(input.timeout_ms ?? 15_000),
        maxBytes: Number(input.max_bytes ?? 2_000_000),
      });
      if (response.status < 200 || response.status >= 300)
        throw new Error(`Paginated page HTTP ${response.status}: ${currentUrl}`);
      const $ = load(response.text);
      const table = $(selector).first();
      if (!table.length) break;
      for (const row of table.find('tr').toArray()) {
        const values = $(row)
          .find('th,td')
          .toArray()
          .map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
        if (values.some(Boolean)) rows.push(values);
      }
      pageCount++;
      const next = $('a[rel~="next"],a.next,[aria-label="Next"]').first().attr('href');
      if (!next) break;
      const target = new URL(next, currentUrl);
      if (target.hostname !== startUrl.hostname) throw new Error('Pagination next link same-host URL emas.');
      currentUrl = target.toString();
    }
    return result(
      JSON.stringify(
        {
          startUrl: startUrl.toString(),
          selector,
          pagesRead: pageCount,
          rowCount: rows.length,
          rows,
          truncated: pageCount >= maxPages && Boolean(currentUrl),
        },
        null,
        2,
      ),
    );
  },
});
