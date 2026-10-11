import { DOMParser } from '@xmldom/xmldom';
import { select } from 'xpath';
import { load } from 'cheerio';
import { fetchWithOptions } from './http-client.js';
import { assertSafeUrl } from './ssrf-guard.js';
import { result } from './format.js';
import type { ToolResult } from './types.js';

type Input = Record<string, unknown>;

function str(input: Input, ...keys: string[]): string {
  for (const key of keys)
    if (typeof input[key] === 'string' && String(input[key]).trim()) return String(input[key]).trim();
  return '';
}

async function fetchPage(url: string): Promise<{ url: string; text: string }> {
  const safe = await assertSafeUrl(url);
  const response = await fetchWithOptions(safe.toString());
  if (response.status >= 400) throw new Error('HTTP ' + response.status);
  return { url: safe.toString(), text: response.text };
}

export async function runExtractTool(toolName: string, input: Input): Promise<ToolResult> {
  const name = toolName.replace(/^pro_fetch_/, '');
  const url = str(input, 'url');
  if (!url) return result('url parametri kerak.');
  if (name === 'xpath_select') {
    const expression = str(input, 'xpath', 'selector');
    if (!expression) return result('xpath expression kerak (masalan: //title/text()).');
    const fetched = await fetchPage(url);
    const document = new DOMParser({ onError: () => {} }).parseFromString(fetched.text, 'text/html');
    const matches = select(expression, document as unknown as Parameters<typeof select>[1]) as Array<unknown>;
    return result(
      matches
        .slice(0, Number(input.limit ?? 100))
        .map((match) => {
          if (typeof match === 'string' || typeof match === 'number' || typeof match === 'boolean')
            return String(match);
          const node = match as { nodeValue?: string | null; textContent?: string | null; toString?: () => string };
          return node.nodeValue ?? node.textContent ?? node.toString?.() ?? '';
        })
        .join('\n') || 'XPath natijasi topilmadi.',
    );
  }
  if (name === 'paginated_table_read') {
    const selector = str(input, 'selector') || 'table';
    const maxPages = Math.max(1, Math.min(Number(input.max_pages ?? 5), 10));
    let currentUrl = url;
    const seen = new Set<string>();
    const allRows: string[][] = [];
    for (let pageIndex = 0; pageIndex < maxPages && currentUrl && !seen.has(currentUrl); pageIndex++) {
      seen.add(currentUrl);
      const fetched = await fetchPage(currentUrl);
      const $ = load(fetched.text);
      const table = $(selector).first();
      if (!table.length) break;
      for (const row of table.find('tr').toArray()) {
        const values = $(row)
          .find('th,td')
          .toArray()
          .map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
        if (values.length) allRows.push(values);
      }
      const nextHref = $('a[rel="next"],a.next,[aria-label="Next"]').first().attr('href');
      try {
        currentUrl = nextHref ? new URL(nextHref, fetched.url).toString() : '';
      } catch {
        currentUrl = '';
      }
    }
    return result(JSON.stringify({ pagesRead: seen.size, rows: allRows }, null, 2));
  }
  return result('Extract operation not recognized: ' + toolName);
}
