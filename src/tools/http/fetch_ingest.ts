import { defineTool } from '../../core/tool.js';
import { result, fail } from '../../core/format.js';
import { bool, num, strOrEmpty, view } from '../../core/input.js';
import { fetchSource, runParallel } from '../../core/composite.js';
import { detailMode, renderBudgeted } from '../../core/composite-budget.js';

/**
 * pro_fetch_ingest — Turn any URL into clean, structured, citable data
 * Pack: smart-composite (pro-fetch)
 *
 * The most common real-world chain: download something (page, PDF, CSV, feed), convert it to text,
 * extract the interesting parts and archive it. Each format has a different converter, and
 * guessing which one applies is exactly the friction this removes.
 */
export default defineTool({
  name: 'pro_fetch_ingest',
  description:
    'Fetch any URL and return clean structured data in one call: pages become readable text with ' +
    'metadata and headings, PDFs and Office files become text, CSV/JSON become summarised tables, ' +
    'feeds become markdown, and everything is optionally archived for later citation. Handles ' +
    'format detection so you do not have to choose a converter.',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      detail: { type: 'string', enum: ['summary', 'full'], description: 'Natija hajmi: summary yoki full' },
      url: { type: 'string', description: 'Manba URL (sahifa, PDF, CSV, JSON, RSS, office fayl)' },
      extract: { type: 'boolean', description: 'Qo‘shimcha ma’lumot ajratish (sahifalar uchun)' },
      archive: { type: 'boolean', description: 'Natijani arxivga saqlash (keyinroq citation uchun)' },
      max_bytes: { type: 'number', description: 'Yuklab olish limiti, bayt' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const url = strOrEmpty(p, 'url').trim();
    if (!url) return fail('url talab qilinadi.');
    const maxBytes = num(p, 'max_bytes', 5_000_000, 1, 100_000_000);

    // One real request for the source document, then everything downstream reads it from memory.
    //
    // This must be the raw body: `pro_fetch_fetch_url` renders markdown, which has already removed
    // the `<script>`, `<img>` and `<head>` markup that the extractors and converters need. Handing a
    // rendering to a parser is how a page ends up reported as having no structured data when it has
    // a full JSON-LD block.
    const source = await fetchSource(url, maxBytes);
    if (!source.ok) return fail(source.error);

    const steps: Array<[string, string, Record<string, unknown>]> = [];
    const wantsExtract = bool(p, 'extract', true);

    // Markup- and text-based tools receive the content already in hand instead of fetching again.
    //
    // Format converters stay on the URL. They need the original bytes: a PDF is not readable text,
    // and a CSV with embedded newlines would not survive a round trip through markdown.
    const asText = { url, text: source.html };

    // Fan out across every converter; the ones that do not apply report a clean skip.
    steps.push(
      ['HTML → text', 'pro_fetch_html_to_text', asText],
      ['HTML → markdown', 'pro_fetch_html_to_markdown', asText],
      ['PDF → text', 'pro_fetch_pdf_to_text', { url }],
      ['CSV → JSON', 'pro_fetch_csv_to_json', { url }],
      ['JSON → YAML', 'pro_fetch_json_to_yaml', asText],
      ['XML → JSON', 'pro_fetch_xml_to_json', asText],
      ['Feed → markdown', 'pro_fetch_rss_to_markdown', asText],
    );

    if (wantsExtract) {
      steps.push(
        ['Metadata', 'pro_fetch_meta_og_extract', asText],
        ['Headings', 'pro_fetch_heading_outline', asText],
        ['Structured data', 'pro_fetch_json_ld_extract', asText],
        ['Links', 'pro_fetch_link_classify', asText],
        ['Emails', 'pro_fetch_email_extract', asText],
        ['Phones', 'pro_fetch_phone_extract', asText],
        ['Prices', 'pro_fetch_price_extract', asText],
      );
    }

    if (bool(p, 'archive', false)) {
      // Archiving must fetch the original so it stores the real bytes, not our text rendering.
      steps.push(['Archive', 'pro_fetch_archive_org_save', { url }]);
    }

    // The source fetch is not itself a reported step: it produced the content every other step
    // analyses, so listing it would count the same bytes twice in the transcript.
    const outcomes = await runParallel(steps);
    return result(renderBudgeted(`Ingest: ${url}`, outcomes, detailMode(p.detail)));
  },
});
