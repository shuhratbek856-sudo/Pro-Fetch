import { defineTool } from '../../core/tool.js';
import { result, fail } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { renderPipeline, runParallel, runStep } from '../../core/composite.js';
import { detailMode, renderBudgeted } from '../../core/composite-budget.js';

/**
 * pro_audit_page — Full audit of a single web page
 * Pack: smart-composite (pro-fetch)
 *
 * Fetches a URL once and runs every applicable extractor over the same content, instead of the
 * model paying a separate round trip for metadata, headings, links, schema.org, Open Graph,
 * structured data, readability, price/phone/email extraction and broken-link detection.
 */
export default defineTool({
  name: 'pro_audit_page',
  description:
    'Audit a web page in one call: fetch it, then extract metadata, Open Graph and Twitter cards, ' +
    'JSON-LD and schema.org data, headings, all links (internal/external/social), emails, phones, ' +
    'prices, a readability score and a main-content extract. Use this before manually chaining ' +
    'individual extraction tools.',
  category: 'extract',
  inputSchema: {
    type: 'object',
    properties: {
      detail: { type: 'string', enum: ['summary', 'full'], description: 'Natija hajmi: summary yoki full' },
      url: { type: 'string', description: 'Tahlil qilinadigan sahifa URL' },
      check_links: { type: 'boolean', description: 'Hammani kirish chiqish linklarini tekshirish (sekinroq)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const url = strOrEmpty(p, 'url').trim();
    if (!url) return fail('url talab qilinadi.');

    // Fetch once; every extractor accepts `text`, so the network cost is a single request.
    const fetched = await runStep('Fetch page', 'pro_fetch_html_to_text', { url, max_bytes: 2_000_000 });
    if (!fetched.ok) return fail(fetched.error || fetched.output || 'Sahifani yuklab bo‘lmadi.');
    const html = fetched.output;

    // Every step below only reads `url` or the already-fetched `html`, so none depends on another
    // and the whole audit can fan out. Concurrency stays bounded by the execution engine's
    // per-category semaphore, so this does not widen the configured limits.
    const steps: Array<[string, string, Record<string, unknown>]> = [
      ['Readable text', 'pro_fetch_html_to_text', { url }],
      ['Headings outline', 'pro_fetch_heading_outline', { url }],
      ['Meta and Open Graph', 'pro_fetch_meta_og_extract', { url }],
      ['JSON-LD structured data', 'pro_fetch_json_ld_extract', { url }],
      ['schema.org blocks', 'pro_fetch_schema_org_extract', { url }],
      ['Links classified', 'pro_fetch_link_classify', { url }],
      ['Link domains', 'pro_fetch_link_domains', { url }],
      ['Emails', 'pro_fetch_email_extract', { url }],
      ['Phone numbers', 'pro_fetch_phone_extract', { url }],
      ['Prices', 'pro_fetch_price_extract', { url }],
      ['Image alt coverage', 'pro_fetch_image_alt_extract', { url }],
      ['Hreflang tags', 'pro_fetch_hreflang_extract', { url }],
      ['Date signals', 'pro_fetch_date_extract', { url }],
      ['Comments stripped', 'pro_fetch_comment_strip', { text: html }],
      ['Readability score', 'pro_fetch_readability_score', { text: html }],
      ['Main content', 'pro_fetch_main_content_detect', { url }],
    ];

    if (p.check_links === true) {
      steps.push(['Broken link check', 'pro_fetch_broken_links', { url, limit: 30 }]);
    }

    const outcomes = [fetched, ...(await runParallel(steps))];
    return result(renderBudgeted(`Page audit: ${url}`, outcomes, detailMode(p.detail)));
  },
});
