import { afterEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import '../src/loader.js';
import { allTools, dispatch } from '../src/core/tool.js';
import { cache } from '../src/core/cache.js';
import { PDFDocument, StandardFonts } from 'pdf-lib';

describe('implemented tool behavior', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it('converts quoted CSV rows to objects', async () => {
    const response = await dispatch('pro_fetch_csv_to_json', { text: 'name,note\nAda,"hello, world"' });
    expect(response.isError).toBeFalsy();
    expect(JSON.parse(response.content[0].text)).toEqual([{ name: 'Ada', note: 'hello, world' }]);
  });

  it('handles multiline quoted CSV, duplicate headers, headerless TSV, and malformed quoted input', async () => {
    const csv = await dispatch('pro_fetch_csv_to_json', {
      text: 'name,name,note\r\nAda,Ada,"first line\r\nsecond line"',
    });
    expect(JSON.parse(csv.content[0].text)).toEqual([
      { name: 'Ada', name_2: 'Ada', note: 'first line\r\nsecond line' },
    ]);
    const tsv = await dispatch('pro_fetch_tsv_to_json', { text: 'Ada\t"hello\tworld"', has_header: false });
    expect(JSON.parse(tsv.content[0].text)).toEqual([{ column_1: 'Ada', column_2: 'hello\tworld' }]);
    const malformed = await dispatch('pro_fetch_csv_to_json', { text: 'name,note\nAda,"not closed' });
    expect(malformed.isError).toBe(true);
  });

  it('converts JSON rows to escaped CSV', async () => {
    const response = await dispatch('pro_fetch_json_to_csv', {
      text: '[{"name":"Ada","note":"hello, world"},{"name":"Grace","active":true}]',
    });
    expect(response.content[0].text).toBe('name,note,active\nAda,"hello, world",\nGrace,,true');
  });

  it('parses YAML and XML into JSON', async () => {
    const yaml = await dispatch('pro_fetch_yaml_to_json', {
      text: 'title: Example\ncount: 3\ntags:\n  - one\n  - two',
    });
    expect(JSON.parse(yaml.content[0].text)).toEqual({ title: 'Example', count: 3, tags: ['one', 'two'] });
    const xml = await dispatch('pro_fetch_xml_to_json', { text: '<root><item>one</item><item>two</item></root>' });
    expect(JSON.parse(xml.content[0].text)).toEqual({ root: { item: ['one', 'two'] } });
    const attributedXml = await dispatch('pro_fetch_xml_to_json', {
      text: '<root id="7"><item>A</item><item>B</item></root>',
    });
    expect(JSON.parse(attributedXml.content[0].text)).toEqual({
      root: { '@attributes': { id: '7' }, item: ['A', 'B'] },
    });
    expect((await dispatch('pro_fetch_xml_to_json', { text: '<root><item></root>' })).isError).toBe(true);
    expect((await dispatch('pro_fetch_yaml_to_json', { text: 'items: [one, two' })).isError).toBe(true);
  });

  it('converts HTML, RSS, and Atom with their file-level handlers', async () => {
    const plain = await dispatch('pro_fetch_html_to_text', {
      text: '<html><script>ignore()</script><h1>Title</h1><p>Body &amp; text</p></html>',
    });
    expect(plain.content[0].text).toContain('Body & text');
    expect(plain.content[0].text).not.toContain('ignore');
    const markdown = await dispatch('pro_fetch_html_to_markdown', {
      text: '<article><h1>Title</h1><p><strong>Body</strong></p></article>',
    });
    expect(markdown.content[0].text).toContain('# Title');
    expect(markdown.content[0].text).toContain('**Body**');
    const readable = await dispatch('pro_fetch_readability_extract', {
      text:
        '<html><title>Article</title><main><article><h1>Story</h1><p>' +
        'Useful story sentence. '.repeat(20) +
        '</p></article></main></html>',
    });
    expect(JSON.parse(readable.content[0].text)).toMatchObject({ title: 'Article' });
    const rss = await dispatch('pro_fetch_rss_to_markdown', {
      text: '<rss><channel><title>Feed</title><item><title>Story</title><link>https://example.org/story</link><description>Summary</description></item></channel></rss>',
    });
    expect(rss.content[0].text).toContain('[Open item](https://example.org/story)');
    const atom = await dispatch('pro_fetch_atom_to_markdown', {
      text: '<feed><title>Atom feed</title><entry><title>Entry</title><link href="https://example.org/entry" rel="alternate"/><updated>2026-10-08</updated></entry></feed>',
    });
    expect(atom.content[0].text).toContain('[Open entry](https://example.org/entry)');
  });

  it('parses iCalendar, vCard, RTF, mbox, and notebooks directly', async () => {
    const calendar = await dispatch('pro_fetch_ical_to_json', {
      text: 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Team meeting\r\nDTSTART;TZID=UTC:20261008T100000\r\nDESCRIPTION:First line\\nSecond line\r\nEND:VEVENT\r\nEND:VCALENDAR',
    });
    expect(JSON.parse(calendar.content[0].text)[0]).toMatchObject({
      SUMMARY: 'Team meeting',
      DTSTART_TZID: 'UTC',
      DESCRIPTION: 'First line\nSecond line',
    });
    const contact = await dispatch('pro_fetch_vcard_to_json', {
      text: 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada Lovelace\r\nEMAIL;TYPE=work:ada@example.org\r\nEMAIL;TYPE=home:ada@home.org\r\nEND:VCARD',
    });
    expect(JSON.parse(contact.content[0].text)[0]).toMatchObject({
      FN: 'Ada Lovelace',
      EMAIL: ['ada@example.org', 'ada@home.org'],
    });
    const rtf = await dispatch('pro_fetch_rtf_to_text', { text: '{\\rtf1 Hello\\par World \\' + "'e9" + '}' });
    expect(rtf.content[0].text).toContain('Hello\nWorld');
    expect(rtf.content[0].text).toContain('é');
    const mbox = await dispatch('pro_fetch_mbox_to_text', {
      text: 'From sender@example.org Thu Oct  8 10:00:00 2026\nSubject: Hello\nFrom: sender@example.org\n\nMessage body',
    });
    expect(JSON.parse(mbox.content[0].text)[0]).toMatchObject({
      headers: { subject: 'Hello', from: 'sender@example.org' },
      body: 'Message body',
    });
    const notebook = await dispatch('pro_fetch_ipynb_to_markdown', {
      text: JSON.stringify({
        nbformat: 4,
        cells: [
          { cell_type: 'markdown', source: ['# Notes'] },
          { cell_type: 'code', source: ['print(1)'], outputs: [{ data: { 'text/plain': ['1'] } }] },
        ],
      }),
    });
    expect(notebook.content[0].text).toContain('# Notes');
    expect(notebook.content[0].text).toContain('```python');
    expect(notebook.content[0].text).toContain('1');
  });

  it('reads DOCX, ODT, PPTX, EPUB, and PDF package data directly', async () => {
    const docxZip = new JSZip();
    docxZip.file(
      'word/document.xml',
      '<w:document xmlns:w="urn:w"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Report</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold text</w:t></w:r></w:p></w:body></w:document>',
    );
    const docx = await dispatch('pro_fetch_docx_to_markdown', {
      base64: await docxZip.generateAsync({ type: 'base64' }),
    });
    expect(docx.content[0].text).toContain('# Report');
    expect(docx.content[0].text).toContain('**Bold text**');

    const odtZip = new JSZip();
    odtZip.file(
      'content.xml',
      '<office:document-content xmlns:office="urn:o" xmlns:text="urn:t"><office:body><text:h text:outline-level="1">Title</text:h><text:p>Paragraph</text:p><text:list-item>Point</text:list-item></office:body></office:document-content>',
    );
    const odt = await dispatch('pro_fetch_odt_to_text', { base64: await odtZip.generateAsync({ type: 'base64' }) });
    expect(odt.content[0].text).toContain('# Title');
    expect(odt.content[0].text).toContain('- Point');

    const pptxZip = new JSZip();
    pptxZip.file(
      'ppt/presentation.xml',
      '<p:presentation xmlns:p="urn:p" xmlns:r="urn:r"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>',
    );
    pptxZip.file(
      'ppt/_rels/presentation.xml.rels',
      '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>',
    );
    pptxZip.file(
      'ppt/slides/slide1.xml',
      '<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:p><a:r><a:t>Slide title</a:t></a:r></a:p></p:sld>',
    );
    const pptx = await dispatch('pro_fetch_pptx_to_text', { base64: await pptxZip.generateAsync({ type: 'base64' }) });
    expect(pptx.content[0].text).toContain('## Slide 1');
    expect(pptx.content[0].text).toContain('Slide title');

    const epubZip = new JSZip();
    epubZip.file(
      'META-INF/container.xml',
      '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    );
    epubZip.file(
      'OPS/book.opf',
      '<package><manifest><item id="chapter" href="chapter.xhtml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
    );
    epubZip.file('OPS/chapter.xhtml', '<html><body><h1>Chapter</h1><p>Text</p></body></html>');
    const epub = await dispatch('pro_fetch_epub_to_text', { base64: await epubZip.generateAsync({ type: 'base64' }) });
    expect(epub.content[0].text).toContain('Chapter');

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf.addPage().drawText('PDF page one', { font });
    pdf.addPage().drawText('PDF page two', { font });
    const base64 = Buffer.from(await pdf.save()).toString('base64');
    const extracted = await dispatch('pro_fetch_pdf_to_text', { base64 });
    expect(extracted.content[0].text).toContain('PDF page one');
    expect(extracted.content[0].text).toContain('## Page 2');
    const split = await dispatch('pro_fetch_pdf_split_pages', { base64, start_page: 2, end_page: 2 });
    expect(JSON.parse(split.content[0].text)).toMatchObject({ totalPages: 2, startPage: 2, endPage: 2 });
  });

  it('reads shared strings and cells from an XLSX workbook', async () => {
    const zip = new JSZip();
    zip.file(
      'xl/workbook.xml',
      '<workbook xmlns:r="urn:r"><sheets><sheet name="People" sheetId="1" r:id="rId1"/></sheets></workbook>',
    );
    zip.file(
      'xl/_rels/workbook.xml.rels',
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    );
    zip.file('xl/sharedStrings.xml', '<sst><si><t>Name</t></si><si><t>Ada</t></si>');
    zip.file(
      'xl/worksheets/sheet1.xml',
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c></row></sheetData></worksheet>',
    );
    const base64 = await zip.generateAsync({ type: 'base64' });
    const response = await dispatch('pro_fetch_xlsx_to_json', { base64 });
    expect(JSON.parse(response.content[0].text)).toEqual({ People: [{ Name: 'Ada' }] });
    const csv = await dispatch('pro_fetch_xlsx_to_csv', { base64, sheet_name: 'People' });
    expect(csv.content[0].text).toBe('Name\nAda');
    expect((await dispatch('pro_fetch_xlsx_to_csv', { base64, sheet_name: 'Missing' })).isError).toBe(true);
  });

  it('provides local i18n and API mock behavior', async () => {
    const transliterated = await dispatch('pro_fetch_script_convert', { text: 'salom', to_script: 'cyrillic' });
    expect(transliterated.content[0].text.toLowerCase()).toBe('салом');
    const mock = await dispatch('pro_fetch_api_mock_respond', { status: 201, body: '{"ok":true}' });
    expect(JSON.parse(mock.content[0].text)).toMatchObject({ mock: true, status: 201, body: { ok: true } });
  });

  it('never returns the stored API secret and exposes browser action inputs', async () => {
    const secret = 'test-secret-never-return-this';
    const response = await dispatch('pro_fetch_api_key_set', { key_name: 'template-test', api_key: secret });
    expect(response.content[0].text).not.toContain(secret);
    const clickTool = allTools().find((tool) => tool.name === 'pro_browser_browser_click');
    expect(clickTool?.inputSchema.required).toEqual(['selector']);
    expect(clickTool?.inputSchema.properties).toHaveProperty('session_id');
  });

  it('publishes narrow schemas with valid source alternatives', () => {
    const csvTool = allTools().find((tool) => tool.name === 'pro_fetch_csv_to_json');
    expect(csvTool?.inputSchema.required).toBeUndefined();
    expect(csvTool?.inputSchema.anyOf).toEqual(
      ['url', 'text', 'content', 'data', 'base64'].map((key) => ({ required: [key] })),
    );
    expect(csvTool?.inputSchema.properties).toHaveProperty('text');
    expect(csvTool?.inputSchema.properties).not.toHaveProperty('selector');
    expect(csvTool?.inputSchema.properties).not.toHaveProperty('password');
    expect(csvTool?.inputSchema.additionalProperties).toBe(false);
  });

  it('assesses a claim against supplied sources with explicit limitations', async () => {
    const response = await dispatch('pro_research_verify_claim', {
      claim: 'The planet is not round',
      sources: [
        { title: 'Source A', text: 'The planet is round.' },
        { title: 'Source B', text: 'The planet is not round.' },
      ],
    });
    expect(response.isError).toBeFalsy();
    const assessment = JSON.parse(response.content[0].text);
    expect(assessment.assessment).toBe('mixed_evidence');
    expect(assessment.evidence).toHaveLength(2);
    expect(assessment.caveat).toContain('not a semantic fact-check or proof');
  });

  it('persists crawl settings and exposes pause, resume, and stop job state', async () => {
    const url = 'https://docs.example.org/start';
    const depth = await dispatch('pro_fetch_crawl_depth_control', { url, max_depth: 4, max_pages: 32 });
    const scope = await dispatch('pro_fetch_crawl_domain_scope', {
      url,
      scope: 'same-domain',
      include_subdomains: true,
    });
    const speed = await dispatch('pro_fetch_crawl_speed', { url, delay_ms: 75, concurrency: 3 });
    expect(JSON.parse(depth.content[0].text).config).toMatchObject({ maxDepth: 4, maxPages: 32 });
    expect(JSON.parse(scope.content[0].text).config).toMatchObject({ scope: 'same-domain', includeSubdomains: true });
    expect(JSON.parse(speed.content[0].text).config).toMatchObject({ delayMs: 75, concurrency: 3 });

    const paused = await dispatch('pro_fetch_crawl_pause_resume', { job_id: 'crawl-test', action: 'pause' });
    expect(JSON.parse(paused.content[0].text)).toMatchObject({ jobId: 'crawl-test', state: 'paused' });
    const resumed = await dispatch('pro_fetch_crawl_pause_resume', { job_id: 'crawl-test', action: 'resume' });
    expect(JSON.parse(resumed.content[0].text).state).toBe('running');
    const stopped = await dispatch('pro_fetch_crawl_pause_resume', { job_id: 'crawl-test', action: 'stop' });
    expect(JSON.parse(stopped.content[0].text).state).toBe('stopped');
  });

  it('browses a cached URL and searches/list pages entirely offline', async () => {
    const offlineTool = allTools().find((tool) => tool.name === 'pro_fetch_offline_browse');
    expect(offlineTool?.inputSchema.required).toBeUndefined();
    expect(offlineTool?.inputSchema.properties).toHaveProperty('query');
    const url = 'https://offline.example.org/article';
    cache.put(
      'fetch:' + url,
      JSON.stringify({
        url,
        status: 200,
        contentType: 'text/html',
        markdown: '# Offline article\n\nLocal cached content',
        tokens: 7,
        cached: false,
        truncated: false,
      }),
    );
    const page = await dispatch('pro_fetch_offline_browse', { url });
    expect(JSON.parse(page.content[0].text)).toMatchObject({
      url,
      cached: true,
      content: '# Offline article\n\nLocal cached content',
    });
    const search = await dispatch('pro_fetch_offline_browse', { query: 'Local cached' });
    expect(JSON.parse(search.content[0].text)).toMatchObject({ offline: true, count: 1, pages: [{ url }] });
    const list = await dispatch('pro_fetch_offline_browse', { limit: 1 });
    expect(JSON.parse(list.content[0].text)).toMatchObject({ offline: true, count: 1, pages: [{ url }] });
  });

  it('calls Wayback and Google cache providers directly with source metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) => {
        const url = new URL(String(request));
        if (
          url.hostname === 'web.archive.org' &&
          url.pathname === '/save/' + encodeURIComponent('http://93.184.216.34/article')
        ) {
          return new Response('', {
            status: 200,
            headers: { 'content-location': 'https://web.archive.org/web/20261008120000/http://93.184.216.34/article' },
          });
        }
        return new Response(
          '<html><title>Archived</title><body><main><h1>Archived article</h1><p>Saved content.</p></main></body></html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }),
    );
    const sourceUrl = 'http://93.184.216.34/article';
    const saved = await dispatch('pro_fetch_archive_org_save', { url: sourceUrl });
    expect(JSON.parse(saved.content[0].text)).toMatchObject({
      source: sourceUrl,
      status: 200,
      archiveUrl: expect.stringContaining('web.archive.org/web/'),
    });
    const archived = await dispatch('pro_fetch_archive_org_fetch', { url: sourceUrl });
    expect(JSON.parse(archived.content[0].text)).toMatchObject({
      source: sourceUrl,
      status: 200,
      markdown: expect.stringContaining('Archived article'),
    });
    const googleCache = await dispatch('pro_fetch_google_cache_fetch', { url: sourceUrl });
    expect(JSON.parse(googleCache.content[0].text)).toMatchObject({ provider: 'Google Web Cache', source: sourceUrl });
  });

  it('refreshes RSS snapshots, reports added items, and lists monitor status without an URL', async () => {
    cache.clear();
    let feed =
      '<rss><channel><item><guid>one</guid><title>First</title><link>https://feed.example/one</link></item></channel></rss>';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(feed, { status: 200, headers: { 'content-type': 'application/rss+xml' } })),
    );
    const url = 'http://93.184.216.34/feed.xml';
    const initial = await dispatch('pro_fetch_feed_subscribe', { url });
    expect(JSON.parse(initial.content[0].text)).toMatchObject({
      initialized: true,
      itemCount: 1,
      added: [{ id: 'one' }],
    });
    feed =
      '<rss><channel><item><guid>one</guid><title>First</title><link>https://feed.example/one</link></item><item><guid>two</guid><title>Second</title><link>https://feed.example/two</link></item></channel></rss>';
    const refreshed = await dispatch('pro_fetch_feed_subscribe', { url });
    expect(JSON.parse(refreshed.content[0].text)).toMatchObject({
      initialized: false,
      itemCount: 2,
      added: [{ id: 'two' }],
    });
    const list = await dispatch('pro_fetch_watch_list', {});
    expect(JSON.parse(list.content[0].text)).toMatchObject({ count: 1, watches: [{ type: 'feed_subscribe', url }] });
  });

  it('runs digest, jobs, keyword, price, and GitHub release monitoring directly', async () => {
    cache.clear();
    let jobsHtml = '<article class="job"><h2>Engineer</h2><a href="/jobs/1">Open</a></article>';
    let productHtml = '<span class="price">$19.99</span>';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) => {
        const url = new URL(String(request));
        if (url.hostname === 'api.github.com')
          return new Response(
            JSON.stringify({
              tag_name: 'v2.0.0',
              name: 'Release two',
              html_url: 'https://github.com/acme/app/releases/tag/v2.0.0',
              published_at: '2026-10-08T00:00:00Z',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          );
        if (url.pathname.includes('jobs'))
          return new Response(jobsHtml, { status: 200, headers: { 'content-type': 'text/html' } });
        if (url.pathname.includes('product'))
          return new Response(productHtml, { status: 200, headers: { 'content-type': 'text/html' } });
        return new Response('<html><body>launch keyword: Orion</body></html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      }),
    );

    const digest = await dispatch('pro_fetch_digest_build', {
      title: 'Test digest',
      items: ['event one', 'event two'],
    });
    expect(JSON.parse(digest.content[0].text)).toMatchObject({
      title: 'Test digest',
      count: 2,
      entries: ['event one', 'event two'],
    });

    const jobsUrl = 'http://93.184.216.34/jobs';
    const firstJobs = await dispatch('pro_fetch_jobs_watch', { url: jobsUrl, id: 'jobs-test' });
    expect(JSON.parse(firstJobs.content[0].text)).toMatchObject({ initialized: true, added: [{ title: 'Engineer' }] });
    jobsHtml += '<article class="job"><h2>Designer</h2><a href="/jobs/2">Open</a></article>';
    const nextJobs = await dispatch('pro_fetch_jobs_watch', { url: jobsUrl, id: 'jobs-test' });
    expect(JSON.parse(nextJobs.content[0].text).added).toEqual([expect.objectContaining({ title: 'Designer' })]);

    const keywordUrl = 'http://93.184.216.34/keywords';
    const firstKeywords = await dispatch('pro_fetch_keyword_alert', {
      url: keywordUrl,
      id: 'keyword-test',
      keywords: ['Orion', 'Phoenix'],
    });
    expect(JSON.parse(firstKeywords.content[0].text)).toMatchObject({
      initialized: true,
      matched: ['Orion'],
      newlyMatched: ['Orion'],
    });
    const nextKeywords = await dispatch('pro_fetch_keyword_alert', {
      url: keywordUrl,
      id: 'keyword-test',
      keywords: ['Orion', 'Phoenix'],
    });
    expect(JSON.parse(nextKeywords.content[0].text)).toMatchObject({
      initialized: false,
      matched: ['Orion'],
      newlyMatched: [],
    });

    const priceUrl = 'http://93.184.216.34/product';
    const firstPrice = await dispatch('pro_fetch_price_watch', { url: priceUrl, id: 'price-test', selector: '.price' });
    expect(JSON.parse(firstPrice.content[0].text)).toMatchObject({ amount: 19.99, currency: 'USD', initialized: true });
    productHtml = '<span class="price">$24.99</span>';
    const nextPrice = await dispatch('pro_fetch_price_watch', { url: priceUrl, id: 'price-test', selector: '.price' });
    expect(JSON.parse(nextPrice.content[0].text)).toMatchObject({ amount: 24.99, changed: true, delta: 5 });

    const firstRelease = await dispatch('pro_fetch_release_watch', { repository: 'acme/app' });
    expect(JSON.parse(firstRelease.content[0].text)).toMatchObject({
      repository: 'acme/app',
      tag_name: 'v2.0.0',
      initialized: true,
    });
    const nextRelease = await dispatch('pro_fetch_release_watch', { repository: 'acme/app' });
    expect(JSON.parse(nextRelease.content[0].text)).toMatchObject({ changed: false, previous: 'v2.0.0' });
  });

  it('selects XPath values and reads paginated tables without crossing hosts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) => {
        const url = new URL(String(request));
        if (url.pathname === '/one')
          return new Response(
            '<html><h1>Heading</h1><a rel="next" href="/two">Next</a><table><tr><th>Name</th></tr><tr><td>Ada</td></tr></table></html>',
            { status: 200, headers: { 'content-type': 'text/html' } },
          );
        if (url.pathname === '/two')
          return new Response('<html><table><tr><td>Grace</td></tr></table></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          });
        return new Response(
          '<html><a rel="next" href="https://attacker.example/steal">Next</a><table><tr><td>Blocked</td></tr></table></html>',
          { status: 200, headers: { 'content-type': 'text/html' } },
        );
      }),
    );
    const xpath = await dispatch('pro_fetch_xpath_select', { url: 'http://93.184.216.34/one', xpath: '//h1/text()' });
    expect(JSON.parse(xpath.content[0].text)).toMatchObject({ count: 1, results: ['Heading'] });
    const table = await dispatch('pro_fetch_paginated_table_read', {
      url: 'http://93.184.216.34/one',
      selector: 'table',
    });
    expect(JSON.parse(table.content[0].text)).toMatchObject({ pagesRead: 2, rows: [['Name'], ['Ada'], ['Grace']] });
    const hostile = await dispatch('pro_fetch_paginated_table_read', {
      url: 'http://93.184.216.34/other',
      selector: 'table',
    });
    expect(hostile.isError).toBe(true);
    expect(hostile.content[0].text).toContain('same-host');
  });

  it('builds directed edges from crawl page links', async () => {
    const response = await dispatch('pro_fetch_link_graph', {
      pages: [
        { url: 'https://docs.example.org/start', title: 'Start', links: ['https://docs.example.org/next'] },
        { url: 'https://docs.example.org/next', title: 'Next', links: [] },
      ],
    });
    expect(response.content[0].text).toContain('-->');
    expect(response.content[0].text).toContain('Start');
    expect(response.content[0].text).toContain('Next');
  });

  it('builds a topic-specific research plan with executable search queries', async () => {
    const response = await dispatch('pro_research_research_plan', {
      query: 'How urban tree cover affects summer heat',
    });
    const plan = JSON.parse(response.content[0].text);
    expect(plan.concepts).toContain('urban');
    expect(plan.subquestions).toHaveLength(6);
    expect(plan.searchQueries[0]).toBe('How urban tree cover affects summer heat');
    expect(plan.extractionFields).toContain('limitations');
  });

  it('requires defined variables before generating research hypotheses', async () => {
    const missing = await dispatch('pro_research_hypothesis_generate', { query: 'urban tree cover and heat' });
    expect(JSON.parse(missing.content[0].text)).toMatchObject({
      status: 'needs_variables',
      missing: ['independent_variable', 'dependent_variable'],
    });
    const generated = await dispatch('pro_research_hypothesis_generate', {
      query: 'urban tree cover and heat',
      independent_variable: 'tree canopy cover',
      dependent_variable: 'surface temperature',
      population: 'urban neighborhoods',
    });
    expect(JSON.parse(generated.content[0].text).hypotheses[0].statement).toContain('tree canopy cover');
  });

  it('reports research metadata gaps and derives the next iteration queries', async () => {
    const gaps = await dispatch('pro_research_gap_analysis', {
      sources: [{ title: 'Study', text: 'A survey method and sample dataset examined urban heat.' }],
    });
    const gapReport = JSON.parse(gaps.content[0].text);
    expect(gapReport.metadataCoverage).toMatchObject({ dated: 0, authored: 0, linked: 0 });
    expect(gapReport.gaps.map((item: { gap: string }) => item.gap)).toContain('Publication dates are missing');
    const iteration = await dispatch('pro_research_research_iterate', {
      query: 'urban heat health outcomes',
      sources: [{ title: 'Study', text: 'Urban temperature survey methods' }],
    });
    expect(JSON.parse(iteration.content[0].text).nextSearchQueries).toContain(
      'urban heat health outcomes primary source methodology',
    );
  });

  it('keeps knowledge, entity, and citation graph semantics distinct', async () => {
    const knowledge = await dispatch('pro_research_build_knowledge_graph', {
      sources: [
        {
          title: 'Ada Lovelace and Charles Babbage',
          url: 'https://example.org/history',
          text: 'Ada Lovelace collaborated with Charles Babbage.',
        },
      ],
    });
    const knowledgeGraph = JSON.parse(knowledge.content[0].text);
    expect(knowledgeGraph.edges[0].relation).toBe('co-mentioned');

    const resolved = await dispatch('pro_research_entity_resolve', {
      sources: [
        { title: 'Ada Lovelace', text: 'Ada Lovelace wrote notes.' },
        { title: 'Ada Lovelace', text: 'Ada Lovelace is cited.' },
      ],
    });
    expect(JSON.parse(resolved.content[0].text).resolutionMethod).toContain('Exact Unicode-normalized');

    const citations = await dispatch('pro_research_citation_graph', {
      sources: [
        { title: 'Paper A', url: 'https://example.org/a', references: ['https://example.org/b'] },
        { title: 'Paper B', url: 'https://example.org/b' },
      ],
    });
    expect(JSON.parse(citations.content[0].text).edges).toEqual([
      { source: 'https://example.org/a', target: 'https://example.org/b' },
    ]);
  });

  it('runs source-specific research operations with provenance and explicit heuristics', async () => {
    const sources = [
      {
        title: 'Treatment study',
        author: 'A. Researcher',
        year: '2024',
        url: 'https://journal.example/study',
        text: 'The treatment reduced fever in adults. Researchers measured outcomes using a controlled survey.',
      },
      {
        title: 'Independent study',
        year: '2022',
        url: 'https://university.example/replication',
        text: 'The treatment did not reduce fever in adults. Researchers used a separate controlled survey.',
      },
    ];
    const citations = await dispatch('pro_research_citation_format', { sources, style: 'MLA' });
    expect(citations.content[0].text).toContain('A. Researcher. "Treatment study." 2024');
    const deduped = await dispatch('pro_research_dedupe_sources', { sources: [sources[0], sources[0], sources[1]] });
    expect(JSON.parse(deduped.content[0].text)).toMatchObject({ inputCount: 3, uniqueCount: 2, removedCount: 1 });
    const ranked = await dispatch('pro_research_rank_sources', { sources });
    expect(JSON.parse(ranked.content[0].text).ranked).toHaveLength(2);
    const strength = await dispatch('pro_research_evidence_strength', { sources });
    expect(JSON.parse(strength.content[0].text).methodology).toContain('does not validate claims');
    const questions = await dispatch('pro_research_followup_questions', { query: 'treatment and fever', sources });
    expect(JSON.parse(questions.content[0].text).questions).toContain(
      'What methods, data, and uncertainty estimates underlie the evidence for treatment and fever?',
    );
    const facts = await dispatch('pro_research_extract_facts', { sources });
    expect(JSON.parse(facts.content[0].text).facts.length).toBeGreaterThan(0);
    const ledger = await dispatch('pro_research_fact_ledger', { sources });
    expect(JSON.parse(ledger.content[0].text).rows[0].source).toBe(sources[0].url);
    const comparison = await dispatch('pro_research_compare_sources', { sources });
    expect(JSON.parse(comparison.content[0].text).sources).toHaveLength(2);
    const contradictions = await dispatch('pro_research_contradiction_detect', { sources });
    expect(JSON.parse(contradictions.content[0].text).possibleContradictions).toHaveLength(1);
    const crossCheck = await dispatch('pro_research_cross_check', { sources });
    expect(JSON.parse(crossCheck.content[0].text).possibleContradictions).toHaveLength(1);
    const report = await dispatch('pro_research_research_report', { query: 'treatment and fever', sources });
    expect(JSON.parse(report.content[0].text)).toMatchObject({ title: 'Research report', sourceCount: 2 });
    const bias = await dispatch('pro_research_source_bias_detect', {
      text: 'This is a shocking and undeniable result.',
    });
    expect(JSON.parse(bias.content[0].text).loadedLanguageCues).toContain('shocking');
    const timeline = await dispatch('pro_research_timeline_build', { sources });
    expect(JSON.parse(timeline.content[0].text).events[0].date).toBe('2022');
  });

  it('parses and returns structured SSE events over the guarded fetch path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('id: 7\nevent: update\ndata: first\ndata: second\n\n', {
            headers: { 'content-type': 'text/event-stream' },
          }),
      ),
    );
    const response = await dispatch('pro_fetch_sse_subscribe', {
      url: 'http://93.184.216.34/events',
      max_events: 5,
      timeout_ms: 1000,
    });
    expect(response.isError).toBeFalsy();
    expect(JSON.parse(response.content[0].text).events).toEqual([{ event: 'update', id: '7', data: 'first\nsecond' }]);
  });

  it('uses dedicated public data providers for academic, book, dataset, news, image, and patent search', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'test-github-token');
    vi.stubEnv('YOUTUBE_API_KEY', 'test-youtube-key');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) => {
        const url = new URL(String(request));
        let payload: unknown;
        if (url.hostname === 'api.crossref.org')
          payload = {
            message: {
              items: [
                {
                  title: ['Research paper'],
                  DOI: '10.1234/example',
                  author: [{ given: 'Ada', family: 'Lovelace' }],
                  published: { 'date-parts': [[2024]] },
                },
              ],
            },
          };
        else if (url.hostname === 'openlibrary.org')
          payload = { docs: [{ title: 'A Book', author_name: ['Ada'], key: '/works/OL1W' }] };
        else if (url.hostname === 'huggingface.co') payload = [{ id: 'org/dataset', downloads: 12, tags: ['text'] }];
        else if (url.hostname === 'api.gdeltproject.org')
          payload = {
            articles: [
              {
                title: 'News',
                url: 'https://news.example/article',
                domain: 'news.example',
                seendate: '20260101T000000Z',
              },
            ],
          };
        else if (url.hostname === 'commons.wikimedia.org')
          payload = {
            query: {
              pages: {
                '1': {
                  title: 'File:Tree.jpg',
                  imageinfo: [
                    {
                      url: 'https://upload.wikimedia.org/tree.jpg',
                      thumburl: 'https://upload.wikimedia.org/thumb.jpg',
                      extmetadata: { LicenseShortName: { value: 'CC BY-SA' } },
                    },
                  ],
                },
              },
            },
          };
        else if (url.hostname === 'api.github.com')
          payload = {
            items: [
              {
                name: 'example.ts',
                path: 'src/example.ts',
                html_url: 'https://github.com/org/repo/blob/main/src/example.ts',
                repository: { full_name: 'org/repo' },
              },
            ],
          };
        else if (url.hostname === 'api.stackexchange.com')
          payload = {
            items: [
              {
                title: '<b>Question</b>',
                link: 'https://stackoverflow.com/q/1',
                score: 4,
                answer_count: 2,
                is_answered: true,
                body: '<p>Example answer</p>',
              },
            ],
          };
        else if (url.hostname === 'dev.to')
          payload = [
            {
              title: 'Engineering blog',
              url: 'https://dev.to/example',
              tag_list: ['typescript'],
              user: { name: 'Author' },
            },
          ];
        else if (url.hostname === 'remoteok.com')
          payload = [
            { legal: 'Remote OK jobs API' },
            {
              id: 'job-1',
              position: 'Engineer',
              company: 'Example Co',
              url: 'https://remoteok.com/remote-jobs/job-1',
              tags: ['typescript'],
            },
          ];
        else if (url.hostname === 'www.googleapis.com')
          payload = {
            items: [{ id: { videoId: 'video-1' }, snippet: { title: 'Example video', channelTitle: 'Channel' } }],
          };
        else if (url.hostname === 'serpapi.com')
          payload = {
            visual_matches: [
              {
                title: 'Matching photo',
                link: 'https://photos.example/match',
                source: 'Photo archive',
                thumbnail: 'https://photos.example/thumb.jpg',
              },
            ],
          };
        else
          payload = {
            results: { cluster: [{ result: [{ patent: { title: 'Example invention', number: 'US1234567A' } }] }] },
          };
        return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
      }),
    );
    const cases = [
      ['pro_fetch_academic_search', 'Crossref', 'Research paper'],
      ['pro_fetch_books_search', 'Open Library', 'A Book'],
      ['pro_fetch_dataset_search', 'Hugging Face Hub', 'org/dataset'],
      ['pro_fetch_news_search', 'GDELT DOC API', 'News'],
      ['pro_fetch_image_search', 'Wikimedia Commons', 'File:Tree.jpg'],
      ['pro_fetch_patent_search', 'Google Patents', 'Example invention'],
      ['pro_fetch_code_search', 'GitHub Code Search', 'src/example.ts'],
      ['pro_fetch_forum_search', 'Stack Exchange', 'Question'],
      ['pro_fetch_blog_search', 'DEV Community', 'Engineering blog'],
      ['pro_fetch_jobs_search', 'Remote OK', 'Engineer'],
      ['pro_fetch_video_search', 'YouTube Data API', 'Example video'],
    ] as const;
    for (const [tool, provider, expected] of cases) {
      const response = await dispatch(tool, { query: 'urban tree cover' });
      expect(response.isError, tool).toBeFalsy();
      const payload = JSON.parse(response.content[0].text);
      expect(payload.provider, tool).toBe(provider);
      expect(JSON.stringify(payload.results), tool).toContain(expected);
    }
    const reverse = await dispatch('pro_fetch_reverse_image_search', { image_url: 'https://example.org/image.jpg' });
    expect(reverse.isError).toBe(true);
    expect(reverse.content[0].text).toContain('SERPAPI_API_KEY');
    vi.stubEnv('SERPAPI_API_KEY', 'test-provider-key');
    const configuredReverse = await dispatch('pro_fetch_reverse_image_search', {
      image_url: 'https://example.org/image.jpg',
    });
    expect(JSON.parse(configuredReverse.content[0].text).results[0].title).toBe('Matching photo');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              shopping_results: [
                { title: 'Garden tool', price: '$19.99', source: 'Shop', link: 'https://shop.example/item' },
              ],
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const shopping = await dispatch('pro_fetch_market_search', { query: 'garden tool' });
    expect(JSON.parse(shopping.content[0].text)).toMatchObject({
      provider: 'SerpApi Google Shopping',
      results: [{ title: 'Garden tool' }],
    });
  });

  it('runs cache, web, site, date, autocomplete, related-query, and Wikipedia handlers directly', async () => {
    cache.clear();
    cache.put('fetch:example', 'urban tree cover content');
    const cached = await dispatch('pro_fetch_cached_search', { query: 'urban', limit: 1 });
    expect(JSON.parse(cached.content[0].text)).toMatchObject({ provider: 'local cache', count: 1 });

    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: RequestInfo | URL) => {
        const url = new URL(String(request));
        if (url.hostname === 'duckduckgo.com' && url.pathname === '/ac/') {
          return new Response(JSON.stringify([{ phrase: 'urban canopy' }, { phrase: 'urban heat' }]), {
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.hostname === 'google.serper.dev') {
          return new Response(JSON.stringify({ suggestions: [{ value: 'urban canopy' }, { value: 'urban heat' }] }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.hostname === 'suggestqueries.google.com') {
          return new Response(JSON.stringify(['urban', ['urban forest', 'urban climate']]), {
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.hostname === 'en.wikipedia.org') {
          return new Response(
            JSON.stringify({
              query: { search: [{ title: 'Urban forest', snippet: '<span>Tree cover</span> in cities.' }] },
            }),
            { headers: { 'content-type': 'application/json' } },
          );
        }
        return new Response(
          '<div class="result"><a class="result__a" href="https://docs.example.org/page">A result</a><a class="result__snippet">A useful snippet</a></div>',
          { headers: { 'content-type': 'text/html' } },
        );
      }),
    );
    const web = await dispatch('pro_fetch_web_search', { query: 'urban trees', limit: 2 });
    expect(JSON.parse(web.content[0].text)).toMatchObject({ provider: 'DuckDuckGo', count: 1 });
    const site = await dispatch('pro_fetch_site_search', {
      query: 'API reference',
      site: 'docs.example.org',
      limit: 2,
    });
    expect(JSON.parse(site.content[0].text)).toMatchObject({ site: 'docs.example.org', count: 1 });
    const date = await dispatch('pro_fetch_date_filter_search', {
      query: 'urban trees',
      after: '2025-01-01',
      before: '2025-12-31',
    });
    expect(JSON.parse(date.content[0].text).dateRange).toEqual({ after: '2025-01-01', before: '2025-12-31' });
    const invalidDate = await dispatch('pro_fetch_date_filter_search', { query: 'urban trees', after: 'yesterday' });
    expect(invalidDate.isError).toBe(true);
    vi.stubEnv('SERPER_API_KEY', 'test-serper');
    const suggestions = await dispatch('pro_fetch_search_suggest', { query: 'urban' });
    expect(JSON.parse(suggestions.content[0].text).results).toEqual(['urban canopy', 'urban heat']);
    const related = await dispatch('pro_fetch_related_queries', { query: 'urban' });
    expect(JSON.parse(related.content[0].text).results).toEqual(['urban forest', 'urban climate']);
    const wiki = await dispatch('pro_fetch_wiki_search', { query: 'urban forest', limit: 1 });
    expect(JSON.parse(wiki.content[0].text).results[0]).toMatchObject({
      title: 'Urban forest',
      snippet: 'Tree cover in cities.',
    });
  });

  it('tests stored credentials without returning secrets and audits scopes accurately', async () => {
    const secret = 'auth-test-secret';
    await dispatch('pro_fetch_api_key_set', { key_name: 'credential-test-key', api_key: secret });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('ok', { status: 200 })),
    );
    const tested = await dispatch('pro_fetch_credential_test', {
      url: 'http://93.184.216.34/protected',
      key_name: 'credential-test-key',
    });
    expect(tested.isError).toBeFalsy();
    expect(tested.content[0].text).not.toContain(secret);
    expect(JSON.parse(tested.content[0].text)).toMatchObject({
      tested: 1,
      authenticated: true,
      secretsReturned: false,
    });
    const unsafeMethod = await dispatch('pro_fetch_credential_test', {
      url: 'http://93.184.216.34/protected',
      key_name: 'credential-test-key',
      method: 'DELETE',
    });
    expect(unsafeMethod.isError).toBe(true);
    const audited = await dispatch('pro_fetch_scopes_audit', {
      granted_scopes: ['repo', 'read:user'],
      required_scopes: ['repo', 'workflow'],
    });
    expect(JSON.parse(audited.content[0].text)).toMatchObject({ missing: ['workflow'], sufficient: false });
  });

  it('uses direct auth handlers for sessions, cookies, Basic Auth, and Bearer Auth', async () => {
    cache.clear();
    const saved = await dispatch('pro_fetch_session_save', {
      session_id: 'direct-session',
      session: { user: 'Ada', roles: ['reader'] },
    });
    expect(JSON.parse(saved.content[0].text)).toMatchObject({ session_id: 'direct-session', stored: true });
    const restored = await dispatch('pro_fetch_session_restore', { session_id: 'direct-session' });
    expect(JSON.parse(restored.content[0].text).session).toEqual({ user: 'Ada', roles: ['reader'] });
    const listed = await dispatch('pro_fetch_session_list', {});
    expect(JSON.parse(listed.content[0].text).sessions).toContainEqual(
      expect.objectContaining({ session_id: 'direct-session' }),
    );
    expect(
      JSON.parse((await dispatch('pro_fetch_session_revoke', { session_id: 'direct-session' })).content[0].text)
        .revoked,
    ).toBe(true);

    const cookieSecret = 'cookie-value-private';
    const setCookie = await dispatch('pro_fetch_cookie_jar_manage', {
      session_id: 'jar-test',
      action: 'set',
      cookie_name: 'sid',
      value: cookieSecret,
    });
    expect(setCookie.content[0].text).not.toContain(cookieSecret);
    expect(
      JSON.parse(
        (await dispatch('pro_fetch_cookie_jar_manage', { session_id: 'jar-test', action: 'list' })).content[0].text,
      ),
    ).toMatchObject({ cookie_names: ['sid'], secretsReturned: false });

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_request: RequestInfo | URL, init?: RequestInit) =>
          new Response(JSON.stringify({ authorization: new Headers(init?.headers).get('authorization') }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const url = 'http://93.184.216.34/protected';
    const basic = await dispatch('pro_fetch_basic_auth_fetch', { url, username: 'ada', password: 'basic-private' });
    expect(JSON.parse(basic.content[0].text)).toMatchObject({ status: 200, credentialReturned: false });
    expect(basic.content[0].text).not.toContain('basic-private');
    const bearer = await dispatch('pro_fetch_bearer_fetch', { url, token: 'bearer-private' });
    expect(JSON.parse(JSON.parse(bearer.content[0].text).body).authorization).toBe('Bearer [REDACTED]');
    expect(bearer.content[0].text).not.toContain('bearer-private');
  });
});
