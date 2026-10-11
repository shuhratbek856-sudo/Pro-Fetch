import { defineTool } from '../../core/tool.js';
import { result, fail } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { pick, renderPipeline, rowsFrom, runPipeline, runStep, urlsFrom } from '../../core/composite.js';

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
      topic: { type: 'string', description: 'Tadqiqot mavzusi (masalan: "RAG arxitekturalari 2025")' },
      depth: {
        type: 'number',
        description:
          'Chuqurlik: 1=tez (faqat qidiruv), 2=o‘rtacha, 3=to‘liq (sahifalarni o‘qib, da’volarni tekshiradi)',
      },
      max_sources: { type: 'number', description: 'Tahlil qilinadigan manba soni (1-20, standart 6)' },
      languages: { type: 'string', description: 'Til kodi (masalan en, uz). Bo‘sh qoldirilsa standart' },
    },
    required: ['topic'],
  },
  async handler(input) {
    const p = view(input);
    const topic = strOrEmpty(p, 'topic').trim();
    if (!topic) return fail('topic talab qilinadi.');

    const depth = Math.max(1, Math.min(3, num(p, 'depth', 2, 1, 3)));
    const maxSources = Math.max(1, Math.min(20, num(p, 'max_sources', 6, 1, 20)));
    const languages = strOrEmpty(p, 'languages').trim();

    const outcomes = [];

    // 1. Gather. Web search first because it is the broadest provider; the rest enrich coverage.
    const gather = await runPipeline(
      [
        ['Web search', 'pro_fetch_web_search', { query: topic, limit: maxSources * 2 }],
        ['Academic sources', 'pro_fetch_academic_search', { query: topic, limit: maxSources }],
        ['News coverage', 'pro_fetch_news_search', { query: topic, limit: maxSources }],
        ['Deduplicate and rank', 'pro_research_dedupe_sources', { sources: [] }],
      ].filter((step) => step[0] !== 'Deduplicate and rank') as Array<[string, string, Record<string, unknown>]>,
    );
    outcomes.push(...gather);

    // 2. Collect the URLs the searches surfaced.
    const candidateUrls = urlsFrom(outcomes).filter((url) => !/arxiv\.org|doi\.org/.test(url));
    if (candidateUrls.length === 0) {
      return fail(`"${topic}" uchun manba topilmadi. Boshqa kalit so‘zlarni sinab ko‘ring.`);
    }
    const selected = candidateUrls.slice(0, maxSources);

    // 3. Read the strongest pages.
    const pages: Array<{ url: string; text: string }> = [];
    for (const url of selected) {
      const outcome = await runStep(`Read ${shortUrl(url)}`, 'pro_fetch_html_to_text', { url, max_bytes: 400_000 });
      outcomes.push(outcome);
      if (outcome.ok) pages.push({ url, text: outcome.output });
    }

    if (pages.length === 0) {
      return result(
        renderPipeline(`Deep research: ${topic}`, outcomes) +
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
