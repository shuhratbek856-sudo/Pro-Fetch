import { getCredential } from './credentials.js';
import { result } from './format.js';
import type { ToolResult } from './types.js';
import { dispatch } from './tool.js';
import { load } from 'cheerio';
import { fetchWithOptions } from './http-client.js';
import { htmlToText } from './parser.js';
import { assertSafeUrl } from './ssrf-guard.js';

type Input = Record<string, unknown>;
type Source = {
  title?: string;
  url?: string;
  text?: string;
  snippet?: string;
  author?: string;
  year?: string | number;
  published?: string;
  domain?: string;
  citation?: string;
  [key: string]: unknown;
};

function value(input: Input, ...keys: string[]): string {
  for (const key of keys)
    if (typeof input[key] === 'string' && String(input[key]).trim()) return String(input[key]).trim();
  return '';
}

function list(input: Input, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const item = input[key];
    if (Array.isArray(item)) return item;
    if (typeof item === 'string' && item.trim()) {
      try {
        const parsed = JSON.parse(item) as unknown;
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return item.split(/\r?\n/).filter(Boolean);
      }
    }
  }
  return [];
}

function asSource(item: unknown): Source {
  if (typeof item === 'string') return { title: item, text: item };
  return item && typeof item === 'object' ? (item as Source) : { text: String(item) };
}

function sourceText(source: Source): string {
  return [source.title, source.text, source.snippet, source.citation]
    .filter((part) => typeof part === 'string')
    .join(' ');
}

function sentences(text: string): string[] {
  return (
    text
      .replace(/\s+/g, ' ')
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 25) ?? []
  );
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = key(item)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function sourceScore(source: Source): number {
  const url = String(source.url ?? '');
  const domain = String(
    source.domain ??
      (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return '';
        }
      })(),
  );
  let score = 40;
  if (/\.gov$|\.edu$|\.ac\.[a-z]{2}$/.test(domain)) score += 30;
  if (/doi\.org|pubmed|arxiv|nature\.com|science\.org/.test(domain)) score += 25;
  if (source.author) score += 8;
  if (source.published || source.year) score += 7;
  if (source.url) score += 5;
  return Math.min(score, 100);
}

function citation(source: Source, style: string): string {
  const author = String(source.author ?? 'Unknown author');
  const title = String(source.title ?? 'Untitled');
  const year = String(source.year ?? source.published ?? 'n.d.').slice(0, 4);
  const url = String(source.url ?? '');
  if (style.toLowerCase() === 'bibtex') {
    const key = (author.split(/\s+/).at(-1) ?? 'source').replace(/[^a-z0-9]/gi, '') + year;
    return `@misc{${key},\n  author = {${author}},\n  title = {${title}},\n  year = {${year}},\n  url = {${url}}\n}`;
  }
  if (style.toLowerCase() === 'mla') return `${author}. "${title}." ${year}${url ? ', ' + url : ''}.`;
  return `${author} (${year}). ${title}.${url ? ' ' + url : ''}`;
}

function entities(text: string): string[] {
  const found = text.match(/\b(?:[A-Z][\p{L}\p{N}&.-]*)(?:\s+[A-Z][\p{L}\p{N}&.-]*){0,2}\b/gu) ?? [];
  return unique(
    found.filter((item) => !/^(The|This|That|These|Those|When|What|Where|After|Before|However|According)$/i.test(item)),
    (item) => item,
  ).slice(0, 80);
}

type SearchSource = Source & { snippet?: string; fetchStatus?: number; fetchError?: string };

async function searchSources(query: string, limit: number): Promise<SearchSource[]> {
  const serperKey = getCredential('SERPER_API_KEY');
  if (serperKey) {
    const response = await fetchWithOptions('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'x-api-key': serperKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ q: query, num: limit }),
      timeoutMs: 12_000,
      maxBytes: 2_000_000,
      cache: false,
    });
    if (response.status >= 400) throw new Error('Serper Search HTTP ' + response.status);
    const payload = JSON.parse(response.text) as {
      organic?: Array<{ title?: string; link?: string; snippet?: string; date?: string }>;
    };
    return (payload.organic ?? [])
      .flatMap((item) =>
        item.link
          ? [
              {
                title: item.title ?? item.link,
                url: item.link,
                snippet: item.snippet ?? '',
                published: item.date ?? '',
                domain: new URL(item.link).hostname,
              },
            ]
          : [],
      )
      .slice(0, limit);
  }
  const apiKey = getCredential('SEARCH_API_KEY');
  if (apiKey) {
    const endpoint = new URL('https://api.search.brave.com/res/v1/web/search');
    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('count', String(limit));
    const response = await fetchWithOptions(endpoint.toString(), {
      headers: { 'x-subscription-token': apiKey, accept: 'application/json' },
      timeoutMs: 12_000,
      maxBytes: 2_000_000,
    });
    if (response.status >= 400) throw new Error('Brave Search HTTP ' + response.status);
    const payload = JSON.parse(response.text) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string; age?: string }> };
    };
    return (payload.web?.results ?? [])
      .flatMap((item) =>
        item.url
          ? [
              {
                title: item.title ?? item.url,
                url: item.url,
                snippet: item.description ?? '',
                published: item.age ?? '',
                domain: new URL(item.url).hostname,
              },
            ]
          : [],
      )
      .slice(0, limit);
  }

  const endpoint = new URL('https://html.duckduckgo.com/html/');
  endpoint.searchParams.set('q', query);
  const response = await fetchWithOptions(endpoint.toString(), {
    headers: { accept: 'text/html' },
    timeoutMs: 12_000,
    maxBytes: 2_000_000,
  });
  if (response.status >= 400) throw new Error('DuckDuckGo search HTTP ' + response.status);
  const $ = load(response.text);
  return $('.result')
    .toArray()
    .flatMap((element) => {
      const item = $(element);
      const rawUrl = item.find('.result__a').first().attr('href') ?? '';
      let url = rawUrl;
      try {
        const parsed = new URL(rawUrl, 'https://duckduckgo.com');
        url = parsed.searchParams.get('uddg') ?? parsed.toString();
        const target = new URL(url);
        if (!['http:', 'https:'].includes(target.protocol)) return [];
      } catch {
        return [];
      }
      if (!url) return [];
      return [
        {
          title: item.find('.result__a').first().text().trim() || url,
          url,
          snippet: item.find('.result__snippet').first().text().trim(),
          domain: new URL(url).hostname,
        },
      ];
    })
    .slice(0, limit);
}

async function enrichSources(sources: SearchSource[], concurrency: number): Promise<SearchSource[]> {
  const output = sources.slice();
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, sources.length) }, async () => {
    while (nextIndex < sources.length) {
      const index = nextIndex++;
      const source = sources[index];
      if (source.text) continue;
      try {
        const safeUrl = await assertSafeUrl(String(source.url ?? ''));
        const response = await fetchWithOptions(safeUrl.toString(), {
          timeoutMs: 10_000,
          maxBytes: 1_000_000,
          retries: 1,
        });
        output[index] = { ...source, url: safeUrl.toString(), fetchStatus: response.status };
        if (response.status < 400 && /html|text\//i.test(response.contentType)) {
          const $ = load(response.text);
          const title =
            $('meta[property="og:title"]').attr('content') || $('title').first().text().trim() || source.title;
          const description =
            $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
          $('script,style,noscript,nav,footer,header,aside').remove();
          const text = htmlToText($.html()).slice(0, 12_000);
          output[index] = { ...output[index], title, text, snippet: source.snippet || description };
        }
      } catch (error) {
        output[index] = { ...source, fetchError: error instanceof Error ? error.message : String(error) };
      }
    }
  });
  await Promise.all(workers);
  return output;
}

function assessClaim(
  claim: string,
  sources: Source[],
): {
  assessment: string;
  confidence: string;
  evidence: Array<{ title: string; url: string; relation: string; overlap: number; excerpt: string }>;
} {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'that',
    'this',
    'with',
    'from',
    'was',
    'were',
    'are',
    'has',
    'have',
    'had',
    'does',
    'did',
    'not',
    'into',
    'than',
    'then',
    'when',
    'where',
    'which',
    'who',
    'what',
    'a',
    'an',
    'of',
    'to',
    'in',
    'on',
    'by',
    'is',
    'it',
  ]);
  const terms = (text: string) => [
    ...new Set(
      (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((term) => term.length > 2 && !stopWords.has(term)),
    ),
  ];
  const claimTerms = terms(claim);
  const evidence = sources
    .map((source) => {
      const text = sourceText(source);
      const sourceTerms = new Set(terms(text));
      const matched = claimTerms.filter((term) => sourceTerms.has(term));
      const overlap = claimTerms.length ? matched.length / claimTerms.length : 0;
      const claimNegated = /\b(not|never|no|false|isn't|aren't|doesn't|didn't|cannot|can't)\b/i.test(claim);
      const sourceNegated = /\b(not|never|no|false|isn't|aren't|doesn't|didn't|cannot|can't)\b/i.test(text);
      const relation = overlap < 0.4 ? 'unclear' : claimNegated === sourceNegated ? 'supports' : 'contradicts';
      return {
        title: String(source.title ?? 'Untitled source'),
        url: String(source.url ?? ''),
        relation,
        overlap: Number(overlap.toFixed(2)),
        excerpt: (source.text || source.snippet || '').slice(0, 700),
      };
    })
    .filter((item) => item.excerpt || item.url);
  const strong = evidence.filter((item) => item.overlap >= 0.4);
  const supports = strong.filter((item) => item.relation === 'supports').length;
  const contradicts = strong.filter((item) => item.relation === 'contradicts').length;
  const assessment = !strong.length
    ? 'insufficient_evidence'
    : supports && contradicts
      ? 'mixed_evidence'
      : contradicts
        ? 'contradicted'
        : 'supported';
  return {
    assessment,
    confidence:
      strong.length >= 3 && (supports === 0 || contradicts === 0) ? 'low_to_moderate_heuristic' : 'low_heuristic',
    evidence,
  };
}

function boundedLimit(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(Math.floor(parsed), maximum)) : fallback;
}

export async function gatherSources(input: Input): Promise<ToolResult> {
  const query = value(input, 'query', 'topic');
  if (!query) throw new Error('query parametri kerak.');
  const candidates = await searchSources(query, boundedLimit(input.limit, 10, 25));
  const sources = await enrichSources(candidates, 4);
  return result(JSON.stringify({ query, count: sources.length, sources }, null, 2));
}

export async function crawlForTopic(input: Input): Promise<ToolResult> {
  const query = value(input, 'query', 'topic');
  if (!query) throw new Error('query parametri kerak.');
  const candidates = await searchSources(query, boundedLimit(input.limit, 5, 10));
  const pages = await enrichSources(candidates, 3);
  return result(
    JSON.stringify(
      {
        topic: query,
        pagesCrawled: pages.filter((source) => typeof source.text === 'string' && source.text.length > 0).length,
        pages,
        limitations: [
          'Search-discovered pages only',
          'Maximum 10 pages; each page is bounded to 1 MB response and 12,000 extracted characters',
        ],
      },
      null,
      2,
    ),
  );
}

export async function verifyClaim(input: Input): Promise<ToolResult> {
  const claim = value(input, 'claim', 'query');
  if (!claim) throw new Error('claim parametri kerak.');
  let sources = list(input, 'sources', 'items', 'documents', 'results').map(asSource);
  if (!sources.length) sources = await searchSources(claim, boundedLimit(input.limit, 8, 15));
  const enriched = await enrichSources(sources.slice(0, 15), 4);
  const assessment = assessClaim(claim, enriched);
  return result(
    JSON.stringify(
      {
        claim,
        assessment: assessment.assessment,
        confidence: assessment.confidence,
        sourceCount: enriched.length,
        evidence: assessment.evidence,
        caveat:
          'Automated lexical evidence triage only; not a semantic fact-check or proof. Review primary sources and context before relying on the assessment.',
      },
      null,
      2,
    ),
  );
}

export function buildResearchPlan(input: Input): ToolResult {
  const question = value(input, 'query', 'topic');
  if (!question) throw new Error('query parametri kerak.');
  const terms = unique(
    (question.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []).filter((term) => term.length > 2),
    (term) => term,
  ).slice(0, 8);
  const concept = terms.join(' ');
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  return result(
    JSON.stringify(
      {
        question,
        concepts: terms,
        subquestions: [
          `How is ${concept} defined and measured in primary sources?`,
          `What evidence directly answers: ${question}?`,
          `Which populations, locations, or time periods are represented?`,
          `What methods and datasets support the main findings about ${concept}?`,
          `What credible sources report conflicting or null findings about ${concept}?`,
          `What limitations or alternative explanations are reported?`,
        ],
        searchQueries: [
          question,
          `"${terms.slice(0, 3).join(' ')}" study OR evidence`,
          `${terms.slice(0, 3).join(' ')} limitations OR contrary evidence`,
        ],
        sourcePriorities: [
          'Primary studies or official datasets',
          'Systematic reviews for context',
          'Independent replication or contrasting evidence',
        ],
        inclusionCriteria: [
          'Direct relevance to the stated question',
          'Identifiable author or responsible organization',
          'Publication date and methods recorded when available',
        ],
        extractionFields: [
          'claim',
          'source URL',
          'author',
          'publication date',
          'population',
          'method',
          'result',
          'limitations',
        ],
        currentSourceCount: sources.length,
      },
      null,
      2,
    ),
  );
}

export function generateHypotheses(input: Input): ToolResult {
  const topic = value(input, 'query', 'topic');
  const independent = value(input, 'independent_variable', 'exposure', 'cause');
  const dependent = value(input, 'dependent_variable', 'outcome', 'effect');
  const missing = [!independent && 'independent_variable', !dependent && 'dependent_variable'].filter(Boolean);
  if (missing.length) {
    return result(
      JSON.stringify(
        {
          status: 'needs_variables',
          topic,
          missing,
          message:
            'Sabab/ta’sir o‘zgaruvchisi va natija o‘zgaruvchisini kiriting; faqat mavzu nomidan test qilinadigan gipoteza chiqarish ishonchli emas.',
        },
        null,
        2,
      ),
    );
  }
  const population = value(input, 'population') || 'the defined study population';
  const context = value(input, 'context') || 'the specified study context';
  const mechanism = value(input, 'mechanism') || 'the proposed mechanism';
  return result(
    JSON.stringify(
      {
        topic,
        variables: { independent, dependent, population, context, mechanism },
        hypotheses: [
          {
            id: 'H1',
            type: 'directional',
            statement: `Higher ${independent} is associated with higher ${dependent} among ${population} in ${context}, through ${mechanism}.`,
            falsification:
              'The estimated association is zero or opposite after controlling for prespecified confounders.',
          },
          {
            id: 'H0',
            type: 'null',
            statement: `${independent} is not associated with ${dependent} among ${population} in ${context}.`,
            falsification: 'A preregistered analysis finds an effect exceeding the minimum meaningful effect size.',
          },
          {
            id: 'H2',
            type: 'alternative',
            statement: `The association between ${independent} and ${dependent} differs across relevant subgroups or exposure levels in ${population}.`,
            falsification: 'Interaction or subgroup effects are negligible under an adequately powered design.',
          },
        ],
        designRequirements: [
          'Define operational measures and a minimum meaningful effect size',
          'Specify temporal ordering and confounders before analysis',
          'Use an appropriate comparison group and report uncertainty intervals',
        ],
        caveat:
          'These are study hypotheses, not findings; the proposed mechanism and direction require independent justification.',
      },
      null,
      2,
    ),
  );
}

export function analyzeResearchGaps(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents', 'results').map(asSource);
  const dated = sources.filter((source) => source.published || source.year).length;
  const authored = sources.filter((source) => source.author).length;
  const linked = sources.filter((source) => source.url).length;
  const domains = new Set(
    sources
      .map((source) => {
        try {
          return new URL(String(source.url)).hostname;
        } catch {
          return '';
        }
      })
      .filter(Boolean),
  );
  const sourceTerms = new Set(termsFrom(sources.map(sourceText).join(' ')));
  const gaps = [];
  if (!sources.length)
    gaps.push({
      gap: 'No source material supplied',
      nextStep: 'Gather primary sources and include URLs, dates, and methods.',
    });
  if (sources.length && linked < sources.length)
    gaps.push({
      gap: 'Some sources have no verifiable URL',
      count: sources.length - linked,
      nextStep: 'Attach stable source URLs or identifiers.',
    });
  if (sources.length && dated < sources.length)
    gaps.push({
      gap: 'Publication dates are missing',
      count: sources.length - dated,
      nextStep: 'Record publication/update dates and check for superseded evidence.',
    });
  if (sources.length && authored < sources.length)
    gaps.push({
      gap: 'Responsible authorship is unclear for some sources',
      count: sources.length - authored,
      nextStep: 'Identify authors, institutions, or issuing organizations.',
    });
  if (domains.size < Math.min(3, sources.length))
    gaps.push({
      gap: 'Evidence comes from few independent domains',
      distinctDomains: domains.size,
      nextStep: 'Seek independent organizations and primary sources.',
    });
  if (sources.length && !/method|sample|dataset|experiment|survey|analysis/i.test([...sourceTerms].join(' ')))
    gaps.push({
      gap: 'Methods or data are not evident in supplied text',
      nextStep: 'Extract study design, population, sample size, and data source.',
    });
  return result(
    JSON.stringify(
      {
        sourceCount: sources.length,
        distinctDomains: domains.size,
        metadataCoverage: { dated, authored, linked },
        gaps,
        scope: 'Automated metadata and keyword audit; it cannot establish that a topic is fully covered.',
      },
      null,
      2,
    ),
  );
}

export function planResearchIteration(input: Input): ToolResult {
  const question = value(input, 'query', 'topic');
  if (!question) throw new Error('query parametri kerak.');
  const sources = list(input, 'sources', 'items', 'documents', 'results').map(asSource);
  const terms = termsFrom(sources.map(sourceText).join(' '));
  const uncovered = (question.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [])
    .filter((term) => term.length > 2 && !terms.includes(term.toLowerCase()))
    .slice(0, 6);
  const queries = sources.length
    ? [
        `${question} primary source methodology`,
        `${question} replication OR independent study`,
        `${question} limitations OR null results`,
        ...(uncovered.length ? [`${question} ${uncovered.join(' ')}`] : []),
      ]
    : [`${question} primary evidence`, `${question} systematic review`, `${question} contrary evidence`];
  return result(
    JSON.stringify(
      {
        question,
        iteration: sources.length ? 'evidence-expansion' : 'initial-source-discovery',
        currentSourceCount: sources.length,
        underrepresentedTerms: uncovered,
        nextSearchQueries: unique(queries, (query) => query),
        recordForEachSource: [
          'claim supported',
          'method and population',
          'publication date',
          'limitations',
          'agreement or conflict with other sources',
        ],
        completionRule:
          'Stop after the key claims have primary evidence, independent corroboration, and documented contrary evidence or an explicit note that none was found.',
      },
      null,
      2,
    ),
  );
}

export function buildKnowledgeGraph(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  const text = value(input, 'text', 'content', 'query');
  const corpus = sources.length ? sources : text ? [{ title: 'Provided text', text }] : [];
  const nodeMap = new Map<string, { id: string; label: string; sources: string[] }>();
  const edgeMap = new Map<string, { source: string; target: string; relation: string; evidence: string[] }>();
  for (const [index, source] of corpus.entries()) {
    const sourceId = String(source.url ?? source.title ?? `source-${index + 1}`);
    const found = entities(sourceText(source));
    const ids = found.map((label) => {
      const id = label.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-');
      const node = nodeMap.get(id) ?? { id, label, sources: [] };
      if (!node.sources.includes(sourceId)) node.sources.push(sourceId);
      nodeMap.set(id, node);
      return id;
    });
    for (let left = 0; left < ids.length; left++)
      for (let right = left + 1; right < ids.length; right++) {
        const [sourceNode, targetNode] = [ids[left], ids[right]].sort();
        const key = sourceNode + '\0' + targetNode;
        const edge = edgeMap.get(key) ?? {
          source: sourceNode,
          target: targetNode,
          relation: 'co-mentioned',
          evidence: [],
        };
        if (!edge.evidence.includes(sourceId)) edge.evidence.push(sourceId);
        edgeMap.set(key, edge);
      }
  }
  return result(
    JSON.stringify(
      {
        methodology:
          'Entities are heuristic name-like phrases; edges mean co-mention in the same supplied source, not a verified semantic relation.',
        nodes: [...nodeMap.values()],
        edges: [...edgeMap.values()],
      },
      null,
      2,
    ),
  );
}

export function resolveEntities(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  const text = value(input, 'text', 'content', 'query');
  const corpus = sources.length ? sources : text ? [{ title: 'Provided text', text }] : [];
  const groups = new Map<
    string,
    { canonical: string; variants: string[]; sourceUrls: string[]; mentionCount: number }
  >();
  for (const [index, source] of corpus.entries()) {
    const sourceId = String(source.url ?? source.title ?? `source-${index + 1}`);
    for (const mention of entities(sourceText(source))) {
      const key = mention
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
      if (!key) continue;
      const group = groups.get(key) ?? { canonical: mention, variants: [], sourceUrls: [], mentionCount: 0 };
      if (!group.variants.includes(mention)) group.variants.push(mention);
      if (!group.sourceUrls.includes(sourceId)) group.sourceUrls.push(sourceId);
      group.mentionCount++;
      groups.set(key, group);
    }
  }
  return result(
    JSON.stringify(
      {
        resolutionMethod: 'Exact Unicode-normalized, case-insensitive matching only; no fuzzy identity inference.',
        entities: [...groups.values()],
      },
      null,
      2,
    ),
  );
}

export function buildCitationGraph(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  const nodes = sources.map((source, index) => ({
    id: String(source.url ?? source.citation ?? `source-${index + 1}`),
    title: String(source.title ?? 'Untitled source'),
    author: String(source.author ?? ''),
    year: String(source.year ?? source.published ?? ''),
  }));
  const byKey = new Map<string, string>();
  for (const node of nodes) {
    byKey.set(node.id.toLowerCase(), node.id);
    byKey.set(node.title.toLowerCase(), node.id);
  }
  const edges: Array<{ source: string; target: string }> = [];
  const unresolved: Array<{ source: string; reference: string }> = [];
  sources.forEach((source, index) => {
    const sourceId = nodes[index].id;
    const references = Array.isArray(source.references)
      ? source.references
      : Array.isArray(source.citations)
        ? source.citations
        : [];
    for (const item of references) {
      const reference =
        typeof item === 'string'
          ? item
          : item && typeof item === 'object'
            ? String((item as Record<string, unknown>).url ?? (item as Record<string, unknown>).title ?? '')
            : '';
      const targetId = byKey.get(reference.toLowerCase());
      if (targetId) edges.push({ source: sourceId, target: targetId });
      else if (reference) unresolved.push({ source: sourceId, reference });
    }
  });
  return result(
    JSON.stringify(
      {
        nodes,
        edges,
        unresolvedReferences: unresolved,
        note: edges.length
          ? 'Edges reflect explicit references supplied in source metadata.'
          : 'No explicit citation links between supplied sources were provided; no edges were inferred.',
      },
      null,
      2,
    ),
  );
}

export function formatCitations(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  const selected = sources.length
    ? sources
    : [
        {
          title: value(input, 'title'),
          author: value(input, 'author'),
          year: value(input, 'year'),
          url: value(input, 'url'),
        },
      ];
  const style = value(input, 'style', 'format') || 'APA';
  return result(selected.map((source, index) => `${index + 1}. ${citation(source, style)}`).join('\n\n'));
}

export function deduplicateSources(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents', 'results').map(asSource);
  const cleaned = unique(sources, (source) =>
    String(source.url ?? source.title ?? source.citation ?? source.text ?? ''),
  );
  return result(
    JSON.stringify(
      {
        inputCount: sources.length,
        uniqueCount: cleaned.length,
        removedCount: sources.length - cleaned.length,
        sources: cleaned,
      },
      null,
      2,
    ),
  );
}

export function rankSources(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents', 'results').map(asSource);
  const ranked = sources
    .map((source) => ({
      ...source,
      score: sourceScore(source),
      scoreBasis: {
        academicOrOfficialDomain: /\.gov$|\.edu$|\.ac\.[a-z]{2}$|doi\.org|pubmed|arxiv|nature\.com|science\.org/i.test(
          String(source.domain ?? source.url ?? ''),
        ),
        identifiedAuthor: Boolean(source.author),
        dated: Boolean(source.published || source.year),
        hasUrl: Boolean(source.url),
      },
    }))
    .sort((left, right) => right.score - left.score);
  return result(
    JSON.stringify({ methodology: 'Heuristic metadata score, not a truth or quality judgment.', ranked }, null, 2),
  );
}

export function scoreEvidence(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  const selected = sources.length
    ? sources
    : [
        {
          url: value(input, 'url'),
          author: value(input, 'author'),
          published: value(input, 'published'),
          text: value(input, 'text'),
        },
      ];
  const scored = selected.map((source) => ({
    title: source.title ?? source.url ?? 'Source',
    score: sourceScore(source),
    factors: {
      authorIdentified: Boolean(source.author),
      publicationDateKnown: Boolean(source.published || source.year),
      urlAvailable: Boolean(source.url),
      domain: String(
        source.domain ??
          (() => {
            try {
              return new URL(String(source.url)).hostname;
            } catch {
              return '';
            }
          })(),
      ),
    },
  }));
  return result(
    JSON.stringify(
      {
        methodology:
          'Metadata completeness and domain heuristic only; this score does not validate claims or study quality.',
        sources: scored,
      },
      null,
      2,
    ),
  );
}

export function generateFollowupQuestions(input: Input): ToolResult {
  const question = value(input, 'query', 'topic', 'claim');
  if (!question) throw new Error('query yoki topic parametri kerak.');
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  const domains = new Set(
    sources
      .map((source) => {
        try {
          return new URL(String(source.url)).hostname;
        } catch {
          return '';
        }
      })
      .filter(Boolean),
  );
  const questions = [
    `Which primary source directly measures or documents: ${question}?`,
    `What independent evidence supports or contradicts the leading claim about ${question}?`,
    `Which population, geography, or time period is not represented in the ${sources.length} supplied sources?`,
    `What methods, data, and uncertainty estimates underlie the evidence for ${question}?`,
    `Could an alternative cause explain the observed relationship in ${question}?`,
  ];
  if (domains.size < 3)
    questions.push(
      `Which credible sources outside the ${domains.size} currently represented domains can independently verify the evidence?`,
    );
  return result(JSON.stringify({ question, basedOnSources: sources.length, questions }, null, 2));
}

export function extractResearchFacts(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  const text = value(input, 'text', 'content', 'document') || sources.map(sourceText).join('\n');
  const facts = unique(sentences(text), (sentence) => sentence).slice(0, 100);
  return result(
    JSON.stringify(
      {
        facts: facts.map((fact, index) => ({ id: index + 1, statement: fact })),
        extractedCount: facts.length,
        method: 'Sentence extraction; extracted statements are not independently verified.',
      },
      null,
      2,
    ),
  );
}

export function buildFactLedger(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  const fallbackSource = value(input, 'source');
  const candidates = sources.length
    ? sources.flatMap((source) =>
        sentences(String(source.text ?? source.snippet ?? '')).map((claim) => ({
          claim,
          source: String((source.url ?? source.title ?? fallbackSource) || 'unspecified'),
        })),
      )
    : sentences(value(input, 'text', 'content', 'document')).map((claim) => ({
        claim,
        source: fallbackSource || 'unspecified',
      }));
  const facts = unique(candidates, (item) => item.claim).slice(0, 100);
  return result(
    JSON.stringify(
      {
        columns: ['id', 'claim', 'source', 'verification_status'],
        rows: facts.map((fact, index) => ({
          id: index + 1,
          ...fact,
          verification_status: 'unverified_extracted_statement',
        })),
      },
      null,
      2,
    ),
  );
}

export function compareResearchSources(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  if (sources.length < 2) throw new Error('Kamida ikkita source kerak.');
  return result(
    JSON.stringify(
      {
        sources: sources.map((source, index) => ({
          index: index + 1,
          title: source.title ?? 'Untitled',
          url: source.url ?? '',
          author: source.author ?? '',
          date: source.published ?? source.year ?? '',
          text: (source.text || source.snippet || '').slice(0, 3000),
          metadataCompleteness: ['author', 'year', 'url'].filter((key) => Boolean(source[key])).length,
        })),
        comparisonLimits:
          'Descriptive side-by-side comparison only; it does not establish agreement, causality, or source independence.',
      },
      null,
      2,
    ),
  );
}

function findContradictionPairs(
  claims: string[],
): Array<{ left: string; right: string; overlap: number; polarityConflict: boolean }> {
  const negation = /\b(no|not|never|false|denies|without|failed|decreased|declined|isn't|aren't|doesn't|didn't)\b/i;
  const pairs: Array<{ left: string; right: string; overlap: number; polarityConflict: boolean }> = [];
  for (let left = 0; left < claims.length; left++)
    for (let right = left + 1; right < claims.length; right++) {
      const a = new Set(termsFrom(claims[left]));
      const b = new Set(termsFrom(claims[right]));
      const overlap = [...a].filter((word) => b.has(word)).length / Math.max(1, Math.min(a.size, b.size));
      const polarityConflict = negation.test(claims[left]) !== negation.test(claims[right]);
      if (overlap >= 0.45 && polarityConflict)
        pairs.push({ left: claims[left], right: claims[right], overlap: Number(overlap.toFixed(2)), polarityConflict });
    }
  return pairs;
}

export function detectContradictions(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  const claims = unique(
    sources.length ? sources.map(sourceText) : sentences(value(input, 'text', 'claims', 'query')),
    (claim) => claim,
  ).slice(0, 100);
  return result(
    JSON.stringify(
      {
        method: 'Lexical overlap and polarity heuristic; negation and semantic equivalence are not fully resolved.',
        claimsScanned: claims.length,
        possibleContradictions: findContradictionPairs(claims),
      },
      null,
      2,
    ),
  );
}

export function crossCheckResearchClaims(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  const claims = unique(
    sources.length ? sources.map(sourceText) : sentences(value(input, 'text', 'claims', 'query')),
    (claim) => claim,
  ).slice(0, 100);
  const pairs = findContradictionPairs(claims);
  return result(
    JSON.stringify(
      {
        sourceCount: sources.length,
        claimsCompared: claims.length,
        consistentPairs: Math.max(0, (claims.length * (claims.length - 1)) / 2 - pairs.length),
        possibleContradictions: pairs,
        limitations:
          'Heuristic comparison only. No detected contradiction is not evidence that claims are true or consistent.',
      },
      null,
      2,
    ),
  );
}

export function summarizeResearch(input: Input, report = false): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  const content = [value(input, 'text', 'content', 'notes'), ...sources.map(sourceText)].filter(Boolean).join('\n\n');
  const extracted = sentences(content).slice(0, report ? 20 : 8);
  return result(
    JSON.stringify(
      {
        title: report ? 'Research report' : 'Research summary',
        question: value(input, 'query', 'topic'),
        sourceCount: sources.length,
        summary: extracted,
        sources: sources.map((source) => ({ title: source.title ?? '', url: source.url ?? '' })),
        limitations: 'Extractive sentence selection; no new evidence or semantic verification was performed.',
      },
      null,
      2,
    ),
  );
}

export function detectSourceBias(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  const text = [value(input, 'text', 'content', 'claim'), ...sources.map(sourceText)].join(' ');
  const cues = [
    'obviously',
    'everyone knows',
    'shocking',
    'disaster',
    'miracle',
    'always',
    'never',
    'undeniable',
    'proven beyond doubt',
  ];
  const found = cues.filter((cue) => text.toLowerCase().includes(cue));
  const affiliations = sources.map((source) => String(source.publisher ?? source.organization ?? '')).filter(Boolean);
  return result(
    JSON.stringify(
      {
        loadedLanguageCues: found,
        sourceCount: sources.length,
        distinctAffiliations: [...new Set(affiliations)],
        missingAuthorCount: sources.filter((source) => !source.author).length,
        missingDateCount: sources.filter((source) => !source.year && !source.published).length,
        checks: [
          'author affiliations and funding',
          'selection and omission of evidence',
          'methods and uncertainty',
          'independent sources and counterevidence',
        ],
        limitation: 'Surface-level screening only; wording or missing metadata alone does not establish bias.',
      },
      null,
      2,
    ),
  );
}

export function buildResearchTimeline(input: Input): ToolResult {
  const sources = list(input, 'sources', 'items', 'documents').map(asSource);
  const events = sources
    .map((source) => ({
      date: String(source.published ?? source.year ?? ''),
      title: String(source.title ?? source.text ?? 'Untitled event'),
      url: String(source.url ?? ''),
    }))
    .filter((event) => event.date);
  events.sort((left, right) => {
    const a = Date.parse(left.date);
    const b = Date.parse(right.date);
    return Number.isFinite(a) && Number.isFinite(b) ? a - b : left.date.localeCompare(right.date);
  });
  return result(
    JSON.stringify(
      {
        events,
        undatedCount: sources.length - events.length,
        note: 'Only dates explicitly supplied with sources are included.',
      },
      null,
      2,
    ),
  );
}

export async function researchAcrossLanguages(input: Input): Promise<ToolResult> {
  const query = value(input, 'query', 'topic');
  if (!query) throw new Error('query parametri kerak.');
  const languages = list(input, 'languages').map(String).filter(Boolean).slice(0, 8);
  const selected = languages.length ? languages : ['en', 'uz'];
  const results = await Promise.all(
    selected.map(async (language) => {
      const response = await dispatch('pro_fetch_web_search', {
        query: `${query} ${language}`,
        limit: boundedLimit(input.limit, 5, 10),
      });
      return {
        language,
        results: response.content.map((part) => part.text).join('\n'),
        error: response.isError ?? false,
      };
    }),
  );
  return result(JSON.stringify({ query, languages: results }, null, 2));
}

function termsFrom(text: string): string[] {
  const stop = new Set([
    'the',
    'and',
    'for',
    'that',
    'this',
    'with',
    'from',
    'was',
    'were',
    'are',
    'has',
    'have',
    'had',
    'does',
    'did',
    'not',
    'into',
    'than',
    'then',
    'when',
    'where',
    'which',
    'who',
    'what',
    'a',
    'an',
    'of',
    'to',
    'in',
    'on',
    'by',
    'is',
    'it',
  ]);
  return [
    ...new Set(
      (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) => word.length > 2 && !stop.has(word)),
    ),
  ];
}

export async function runResearchTool(toolName: string, input: Input): Promise<ToolResult> {
  const name = toolName.replace(/^pro_research_/, '');
  const query = value(input, 'query', 'topic', 'claim', 'text');
  const sourceItems = list(input, 'sources', 'items', 'documents', 'results').map(asSource);
  if (name === 'gather_sources') return gatherSources(input);
  if (name === 'crawl_for_topic') return crawlForTopic(input);
  if (name === 'verify_claim') return verifyClaim(input);
  if (name === 'multi_lang_research') {
    return researchAcrossLanguages(input);
  }
  if (name === 'citation_format') return formatCitations(input);
  if (name === 'dedupe_sources') return deduplicateSources(input);
  if (name === 'rank_sources') return rankSources(input);
  if (name === 'evidence_strength') return scoreEvidence(input);
  if (name === 'research_plan') {
    return buildResearchPlan(input);
  }
  if (name === 'followup_questions') return generateFollowupQuestions(input);
  if (name === 'hypothesis_generate') {
    return generateHypotheses(input);
  }
  if (name === 'extract_facts') return extractResearchFacts(input);
  if (name === 'fact_ledger') return buildFactLedger(input);
  if (name === 'build_knowledge_graph') return buildKnowledgeGraph(input);
  if (name === 'entity_resolve') return resolveEntities(input);
  if (name === 'citation_graph') return buildCitationGraph(input);
  if (name === 'compare_sources') return compareResearchSources(input);
  if (name === 'contradiction_detect') return detectContradictions(input);
  if (name === 'cross_check') return crossCheckResearchClaims(input);
  if (name === 'gap_analysis') {
    return analyzeResearchGaps(input);
  }
  if (name === 'research_iterate') {
    return planResearchIteration(input);
  }
  if (name === 'research_summarize') return summarizeResearch(input);
  if (name === 'research_report') return summarizeResearch(input, true);
  if (name === 'source_bias_detect') return detectSourceBias(input);
  if (name === 'timeline_build') return buildResearchTimeline(input);
  return result('Research operation not recognized: ' + toolName);
}
