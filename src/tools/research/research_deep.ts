import { defineTool } from '../../core/tool.js';
import { result, fail } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { pick, renderPipeline, rowsFrom, runParallel, runPipeline, runStep, urlsFrom } from '../../core/composite.js';
import { detailMode, renderBudgeted } from '../../core/composite-budget.js';

/**
 * pro_research_deep — Full multi-source research on a topic
 * Pack: smart-composite (pro-fetch)
 *
 * One call instead of the nine round trips the discovery loop needs: gather sources from several
 * providers, read the strongest ones, extract claims, cross-check them, and report what the
 * evidence actually supports.
 */
export default defineTool({
  name: 'pro_research_deep',
  description:
    'Deep multi-source research on any topic. Runs the whole pipeline in one call: web/academic/news ' +
    'search, dedupe and rank the sources, fetch the best pages, extract facts, cross-check them, ' +
    'score the evidence and produce a cited report. Use this instead of chaining search and ' +
    'extraction tools by hand.',
  category: 'research',
  inputSchema: {
    type: 'object',
    properties: {
      detail: { type: 'string', enum: ['summary', 'full'], description: 'Natija hajmi: summary yoki full' },
      topic: { type: 'string', description: 'Tadqiqot mavzusi (masalan: "RAG arxitekturalari 2025")' },
      // The other 23 research tools take `query`, and `research-tools.ts` already reads this one as
      // `value(input, 'query', 'topic')`. Only the schema insisted on `topic`, so a caller who learned
      // the name from any sibling tool was rejected here with "majburiy argumentlar berilmadi: topic".
      query: { type: 'string', description: 'Tadqiqot mavzusi (topic bilan bir xil)' },
      depth: {
        type: 'number',
        description:
          'Chuqurlik: 1=tez (faqat qidiruv), 2=o‘rtacha, 3=to‘liq (sahifalarni o‘qib, da’volarni tekshiradi)',
      },
      max_sources: { type: 'number', description: 'Tahlil qilinadigan manba soni (1-20, standart 6)' },
      languages: { type: 'string', description: 'Til kodi (masalan en, uz). Bo‘sh qoldirilsa standart' },
    },
    // Either name states the topic, so requiring one would reject the other. `anyOf` says the choice
    // where `required` would demand both.
    anyOf: [{ required: ['topic'] }, { required: ['query'] }],
  },
  async handler(input) {
    const p = view(input);
    const topic = (strOrEmpty(p, 'topic') || strOrEmpty(p, 'query')).trim();
    if (!topic) return fail('topic (yoki query) talab qilinadi.');

    const depth = Math.max(1, Math.min(3, num(p, 'depth', 2, 1, 3)));
    const maxSources = Math.max(1, Math.min(20, num(p, 'max_sources', 6, 1, 20)));
    const languages = strOrEmpty(p, 'languages').trim();

    const outcomes = [];

    // 1. Gather. The three providers are independent, so they run concurrently; this stage used to
    // dominate the wall clock because each provider call is a network round trip.
    const gather = await runParallel([
      ['Web search', 'pro_fetch_web_search', { query: topic, limit: maxSources * 2 }],
      ['Academic sources', 'pro_fetch_academic_search', { query: topic, limit: maxSources }],
      ['News coverage', 'pro_fetch_news_search', { query: topic, limit: maxSources }],
    ]);
    outcomes.push(...gather);

    // 2. Collect the URLs the searches surfaced.
    const candidateUrls = urlsFrom(outcomes).filter((url) => !/arxiv\.org|doi\.org/.test(url));
    if (candidateUrls.length === 0) {
      return fail(`"${topic}" uchun manba topilmadi. Boshqa kalit so‘zlarni sinab ko‘ring.`);
    }
    const selected = candidateUrls.slice(0, maxSources);

    // 3. Read the strongest pages. Independent per URL, so fetched concurrently.
    const readOutcomes = await runParallel(
      selected.map((url): [string, string, Record<string, unknown>] => [
        `Read ${shortUrl(url)}`,
        'pro_fetch_html_to_text',
        { url, max_bytes: 400_000 },
      ]),
    );
    outcomes.push(...readOutcomes);
    const pages = readOutcomes
      .filter((outcome, index) => outcome.ok)
      .map((outcome, index) => ({ url: selected[index]!, text: outcome.output }));

    if (pages.length === 0) {
      return result(
        renderBudgeted(`Deep research: ${topic}`, outcomes, detailMode(p.detail)) +
          '\n\n**Xulosa:** manbalar topildi, lekin hech biri o‘qib chiqilmadi.',
      );
    }

    // 4. Extract claims and cross-check them.
    const combined = pages.map((page) => `## Source: ${page.url}\n\n${page.text}`).join('\n\n');
    outcomes.push(
      await runStep('Extract facts', 'pro_research_extract_facts', { text: combined, source: pages[0]!.url }),
    );
    outcomes.push(
      await runStep('Cross-check claims', 'pro_research_cross_check', { text: combined, limit: maxSources }),
    );
    outcomes.push(
      await runStep('Score evidence strength', 'pro_research_evidence_strength', { text: combined, limit: maxSources }),
    );

    // 5. Report. Depth 1 stops here; deeper runs bias and contradiction checks.
    if (depth >= 2) {
      outcomes.push(await runStep('Detect source bias', 'pro_research_source_bias_detect', { text: combined }));
      outcomes.push(
        await runStep('Follow-up questions', 'pro_research_followup_questions', { query: topic, text: combined }),
      );
    }

    const title = `Deep research: ${topic} (depth ${depth}, ${pages.length} sources read)`;
    const report = await runStep('Synthesis', 'pro_research_research_report', {
      text: combined,
      topic,
      title,
      ...(languages ? { languages } : {}),
    });
    if (report.ok) outcomes.push(report);

    const citation = await runStep('Format citations', 'pro_research_citation_format', {
      sources: pages.map((page) => ({ url: page.url })),
      style: 'apa',
    });
    if (citation.ok) outcomes.push(citation);

    return result(renderPipeline(title, outcomes));
  },
});

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname + (parsed.pathname === '/' ? '' : parsed.pathname.slice(0, 30));
  } catch {
    return url.slice(0, 40);
  }
}

/** Re-exported for the composite test suite. */
export { rowsFrom, pick };
