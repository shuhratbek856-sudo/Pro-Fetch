import { defineTool } from '../../core/tool.js';
import { result, fail } from '../../core/format.js';
import { bool, num, strOrEmpty, view } from '../../core/input.js';
import { renderPipeline, runPipeline, runStep } from '../../core/composite.js';

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

    const fetched = await runStep('Fetch', 'pro_fetch_fetch_url', { url, max_bytes: maxBytes });
    if (!fetched.ok) return fail(fetched.error || fetched.output || 'Manbani yuklab bo‘lmadi.');

    const steps: Array<[string, string, Record<string, unknown>]> = [];
    const wantsExtract = bool(p, 'extract', true);

    // Fan out across every converter; the ones that do not apply report a clean skip.
    steps.push(
      ['HTML → text', 'pro_fetch_html_to_text', { url }],
      ['HTML → markdown', 'pro_fetch_html_to_markdown', { url }],
      ['PDF → text', 'pro_fetch_pdf_to_text', { url }],
      ['CSV → JSON', 'pro_fetch_csv_to_json', { url }],
      ['JSON → YAML', 'pro_fetch_json_to_yaml', { url }],
      ['XML → JSON', 'pro_fetch_xml_to_json', { url }],
      ['Feed → markdown', 'pro_fetch_rss_to_markdown', { url }],
    );

    if (wantsExtract) {
      steps.push(
        ['Metadata', 'pro_fetch_meta_og_extract', { url }],
        ['Headings', 'pro_fetch_heading_outline', { url }],
        ['Structured data', 'pro_fetch_json_ld_extract', { url }],
        ['Links', 'pro_fetch_link_classify', { url }],
        ['Emails', 'pro_fetch_email_extract', { url }],
        ['Phones', 'pro_fetch_phone_extract', { url }],
        ['Prices', 'pro_fetch_price_extract', { url }],
      );
    }

    if (bool(p, 'archive', false)) {
      steps.push(['Archive', 'pro_fetch_archive_org_save', { url }]);
    }

    const outcomes = [fetched, ...(await runPipeline(steps))];
    return result(renderPipeline(`Ingest: ${url}`, outcomes));
  },
});
