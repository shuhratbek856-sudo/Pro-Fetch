import { defineTool } from '../../core/tool.js';
import { result, fail } from '../../core/format.js';
import { bool, num, strOrEmpty, view } from '../../core/input.js';
import { renderPipeline, runPipeline, runStep } from '../../core/composite.js';

/**
 * pro_page_diff — Compare two versions of a page
 * Pack: smart-composite (pro-fetch)
 *
 * Useful for "what changed" questions where the model would otherwise fetch two URLs and diff the
 * text itself. Adds heading-level change detection and link diffing on top of the raw text diff.
 */
export const PAGE_DIFF_TOOL = defineTool({
  name: 'pro_page_diff',
  description:
    'Compare two URLs or two texts and report what changed: a text diff, added and removed ' +
    'headings, link changes and a content-size delta. Use it to answer "what changed on this page" ' +
    'without downloading and diffing both pages manually.',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Birinchi (eski) URL' },
      url2: { type: 'string', description: 'Ikkinchi (yangi) URL' },
      text: { type: 'string', description: 'Birinchi matn (URL o‘rniga)' },
      text2: { type: 'string', description: 'Ikkinchi matn (URL o‘rniga)' },
      include_headings: { type: 'boolean', description: 'Sarlavha o‘zgarishlarini ham ko‘rsatish' },
    },
  },
  async handler(input) {
    const p = view(input);
    const url = strOrEmpty(p, 'url').trim();
    const url2 = strOrEmpty(p, 'url2').trim();
    const text = strOrEmpty(p, 'text');
    const text2 = strOrEmpty(p, 'text2');

    if (!url && !text) return fail('url yoki text talab qilinadi.');
    if (!url2 && !text2) return fail('url2 yoki text2 talab qilinadi.');

    const steps: Array<[string, string, Record<string, unknown>]> = [
      ['Text diff', 'pro_fetch_diff_text', text && text2 ? { text, text2 } : { url, url2 }],
    ];

    if (bool(p, 'include_headings', true) && url && url2) {
      steps.push(
        ['Old headings', 'pro_fetch_heading_outline', { url }],
        ['New headings', 'pro_fetch_heading_outline', { url: url2 }],
      );
      steps.push(
        ['Old links', 'pro_fetch_link_domains', { url }],
        ['New links', 'pro_fetch_link_domains', { url: url2 }],
      );
    }

    const outcomes = await runPipeline(steps);
    return result(renderPipeline(`Page diff: ${url || '(text)'} → ${url2 || '(text)'}`, outcomes));
  },
});

/**
 * pro_site_scan — Crawl and summarise a whole site
 * Pack: smart-composite (pro-fetch)
 *
 * Crawling is the other multi-call sequence: start a crawl, respect robots, pull metadata, extract
 * links, then convert what was found. This runs it end to end.
 */
export const SITE_SCAN_TOOL = defineTool({
  name: 'pro_site_scan',
  description:
    'Crawl a site in one call: start a bounded crawl, check robots compliance, collect page ' +
    'metadata, extract the internal link graph, and summarise the pages it reached. Use this for ' +
    'site overviews, sitemaps and structure discovery.',
  category: 'crawl',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "Saytning bosh URL'i" },
      max_pages: { type: 'number', description: 'Ko‘riladigan sahifalar soni (1-100, standart 10)' },
      max_depth: { type: 'number', description: 'Crawl chuqurligi (1-5, standart 2)' },
      include_links: { type: 'boolean', description: 'Link grafigini olish (katta bo‘lishi mumkin)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const url = strOrEmpty(p, 'url').trim();
    if (!url) return fail('url talab qilinadi.');
    const maxPages = Math.max(1, Math.min(100, num(p, 'max_pages', 10, 1, 100)));
    const maxDepth = Math.max(1, Math.min(5, num(p, 'max_depth', 2, 1, 5)));

    const steps: Array<[string, string, Record<string, unknown>]> = [
      ['robots.txt check', 'pro_crawl_robots_check', { url }],
      ['Sitemap', 'pro_crawl_sitemap_read', { url }],
      ['Crawl', 'pro_crawl_crawl_site', { url, max_pages: maxPages, max_depth: maxDepth }],
      ['Page metadata', 'pro_crawl_extract_metadata', { url }],
      ['Tables found', 'pro_crawl_extract_tables', { url, limit: 20 }],
      ['Broken links', 'pro_crawl_broken_links', { url, limit: 20 }],
    ];
    if (bool(p, 'include_links', true)) {
      steps.push(['Link graph', 'pro_crawl_link_graph', { url, limit: 50 }]);
    }

    const outcomes = await runPipeline(steps);
    return result(renderPipeline(`Site scan: ${url}`, outcomes));
  },
});

/**
 * pro_data_pipeline — Load, profile and transform a dataset
 * Pack: smart-composite (pro-fetch)
 *
 * For "analyse this CSV/JSON" work: fetch, parse, profile the columns, then run the usual
 * statistics, all in one call.
 */
export const DATA_PIPELINE_TOOL = defineTool({
  name: 'pro_data_pipeline',
  description:
    'Load and analyse a dataset in one call: fetch a CSV/JSON URL or accept inline data, parse it, ' +
    'profile the columns, compute statistics, run operations like sort/group/dedupe, and render the ' +
    'result as a table. Use for exploratory data analysis without a chain of parser tools.',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "CSV yoki JSON fayl URL'i" },
      text: { type: 'string', description: 'Inline CSV/JSON matn (url o‘rniga)' },
      operation: { type: 'string', description: 'Qo‘shimcha amaliyor: sort | group | dedupe | flatten | diff' },
      operation_arg: { type: 'string', description: 'Amaliyor argumenti (masalan sort uchun ustun nomi)' },
      limit: { type: 'number', description: 'Qaytariladigan qatorlar soni (standart 50)' },
    },
  },
  async handler(input) {
    const p = view(input);
    const url = strOrEmpty(p, 'url').trim();
    const text = strOrEmpty(p, 'text');
    if (!url && !text) return fail('url yoki text talab qilinadi.');

    const source = url ? { url } : { text };
    const steps: Array<[string, string, Record<string, unknown>]> = [
      ['Load as CSV', 'pro_fetch_csv_to_json', source],
      ['Load as JSON', 'pro_fetch_json_to_yaml', source],
      ['Column statistics', 'pro_data_csv_stats', source],
      ['Text statistics', 'pro_data_text_stats', source],
      ['Language', 'pro_data_language_detect', source],
    ];

    const operation = strOrEmpty(p, 'operation').trim().toLowerCase();
    const operationArg = strOrEmpty(p, 'operation_arg').trim();
    const limit = Math.max(1, Math.min(500, num(p, 'limit', 50, 1, 500)));

    if (operation === 'sort') steps.push(['Sort', 'pro_data_json_diff', { ...source, limit }]);
    if (operation === 'group') steps.push(['Group by', 'pro_data_group_by', { ...source, limit }]);
    if (operation === 'dedupe') steps.push(['Deduplicate', 'pro_data_dedupe_text', { ...source, limit }]);
    if (operation === 'flatten') steps.push(['Flatten', 'pro_data_json_flatten', source]);
    if (operation === 'diff') steps.push(['Diff', 'pro_data_diff_json', { ...source, text2: operationArg }]);
    if (operationArg && operation === '') steps.push(['Array ops', 'pro_data_array_ops', { ...source, limit }]);

    const outcomes = await runPipeline(steps);
    return result(renderPipeline(`Data pipeline: ${url || 'inline data'}`, outcomes));
  },
});
