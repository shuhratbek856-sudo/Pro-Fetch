import { defineTool } from '../../core/tool.js';
import { result, fail } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { fetchSource, runParallel, type StepOutcome } from '../../core/composite.js';
import { detailMode, renderBudgeted } from '../../core/composite-budget.js';
import { CONDITIONS, contextFor, gate, type Condition } from '../../core/composite-gates.js';

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

    // Fetch the document itself, once. This must be the raw page, not a rendering of it: the steps
    // below look for markup that a renderer removes — `application/ld+json` blocks, `<img alt>`,
    // `itemscope`, `hreflang` links — and a converter would take exactly the evidence with it.
    const source = await fetchSource(url);
    if (!source.ok) return fail(source.error);
    const html = source.html;

    // Fetch once, analyse many. Every step receives the HTML it needs alongside the URL, so
    // `sourceFrom()` takes the inline path and never issues a second request — the audit drops from
    // eleven HTTP GETs to one. The URL is still passed so each tool reports the page it describes.
    //
    // Steps that need markup the page may not have carry a precondition. A page with no schema.org
    // block is never asked for one, and the transcript records why instead of implying it was absent.
    const withSource = { url, text: html };
    const context = contextFor(html, url);

    const candidates: Array<[string, string, Record<string, unknown>, Condition?]> = [
      ['Readable text', 'pro_fetch_html_to_text', withSource],
      ['Headings outline', 'pro_fetch_heading_outline', withSource, CONDITIONS.headings()],
      ['Meta and Open Graph', 'pro_fetch_meta_og_extract', withSource],
      ['JSON-LD structured data', 'pro_fetch_json_ld_extract', withSource, CONDITIONS.jsonLd()],
      ['schema.org blocks', 'pro_fetch_schema_org_extract', withSource, CONDITIONS.schemaOrg()],
      ['Links classified', 'pro_fetch_link_classify', withSource, CONDITIONS.links()],
      ['Link domains', 'pro_fetch_link_domains', withSource, CONDITIONS.links()],
      ['Emails', 'pro_fetch_email_extract', withSource],
      ['Phone numbers', 'pro_fetch_phone_extract', withSource, CONDITIONS.phones()],
      ['Prices', 'pro_fetch_price_extract', withSource, CONDITIONS.prices()],
      ['Image alt coverage', 'pro_fetch_image_alt_extract', withSource, CONDITIONS.images()],
      ['Hreflang tags', 'pro_fetch_hreflang_extract', withSource, CONDITIONS.hreflang()],
      ['Date signals', 'pro_fetch_date_extract', withSource],
      ['Comments stripped', 'pro_fetch_comment_strip', { text: html }, CONDITIONS.comments()],
      ['Readability score', 'pro_fetch_readability_score', { text: html }],
      ['Main content', 'pro_fetch_main_content_detect', withSource],
    ];

    if (p.check_links === true) {
      // Link checking must hit the network: it is checking whether each link resolves.
      candidates.push(['Broken link check', 'pro_fetch_broken_links', { url, limit: 30 }]);
    }

    // Gate first, then fan out only the steps that can actually produce something.
    const steps: Array<[string, string, Record<string, unknown>]> = [];
    const skipped: StepOutcome[] = [];
    for (const [step, tool, args, condition] of candidates) {
      const verdict = gate(context, condition);
      if (verdict.run) {
        steps.push([step, tool, args]);
      } else {
        skipped.push({
          step,
          tool,
          ok: true,
          output: `(o‘tkazildi: ${verdict.reason ?? 'shart bajarilmadi'})`,
          ms: 0,
        });
      }
    }

    // The readable-text step is the only one that produces the page body, so it is reported as its
    // own outcome rather than being lost inside the fan-out.
    const outcomes = [...(await runParallel(steps)), ...skipped];
    return result(renderBudgeted(`Page audit: ${url}`, outcomes, detailMode(p.detail), skipped.length));
  },
});
