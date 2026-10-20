/**
 * Intent matching for tool discovery.
 *
 * ## Why keyword overlap is not enough
 *
 * `capability_map` originally ranked tools by substring overlap between the task text and the tool
 * name, category and description. Measured failure: "arxiv" matched, but "papers about retrieval
 * augmented generation" did not surface `pro_fetch_arxiv_paper_read`, because none of those words
 * appear in that tool's description. A model asking a natural question would get a useless map.
 *
 * ## What this does instead
 *
 * Three signals, blended:
 *
 * 1. **BM25-style lexical scoring** over name, category, description and schema. IDF weighting
 *    means a word that appears in half the registry ("get", "fetch") contributes almost nothing,
 *    while a word that appears in one tool ("schema.org") dominates. This is what fixes the case
 *    above: "retrieval" is rare and the arxiv tool ranks on it.
 * 2. **Morphological expansion** so "extract", "extracting" and "extraction" are the same term, and
 *    a singular/plural mismatch does not lose a match.
 * 3. **A curated synonym table** for the domain vocabulary a user actually uses — "paper" →
 *    academic, "crawl" → site scan, "repo" → GitHub, "pdf" → convert. This is the part keyword
 *    matching cannot do at all, and it is kept small and inspectable on purpose rather than
 *    pretending to be a language model.
 *
 * No embeddings and no network: discovery has to work in the same call as execution, including
 * offline, and it must not add a dependency or a per-query round trip.
 */

import { SMART_TOOL_NAMES } from './profile.js';

/** The composites are broad by design, so ranking needs to know about them specifically. */
const COMPOSITE_NAMES: ReadonlySet<string> = SMART_TOOL_NAMES;

/** Domain vocabulary: what users say → what the tools call it. Bidirectional and additive. */
const SYNONYMS: Record<string, string[]> = {
  paper: ['arxiv', 'academic', 'scholar', 'pubmed', 'research', 'citation'],
  article: ['paper', 'academic', 'blog'],
  books: ['book', 'library', 'isbn'],
  dataset: ['data', 'csv', 'json', 'kaggle', 'huggingface'],
  patent: ['patent', 'invention'],
  repo: ['github', 'repository', 'gitlab'],
  repository: ['repo', 'github'],
  pr: ['pull', 'merge', 'review', 'github'],
  pull_request: ['pr', 'review', 'diff'],
  commit: ['git', 'history', 'blame'],
  issue: ['bug', 'github', 'ticket'],
  release: ['version', 'tag', 'changelog'],
  crawl: ['site', 'spider', 'scan', 'walk'],
  scrape: ['extract', 'fetch', 'crawl'],
  website: ['page', 'url', 'html', 'fetch'],
  page: ['html', 'url', 'web'],
  pdf: ['document', 'convert', 'text'],
  docx: ['word', 'office', 'document'],
  spreadsheet: ['xlsx', 'csv', 'excel'],
  screenshot: ['image', 'png', 'capture'],
  image: ['picture', 'photo', 'exif', 'ocr'],
  translate: ['language', 'i18n', 'locale'],
  price: ['cost', 'product', 'commerce'],
  phone: ['telephone', 'contact'],
  email: ['mail', 'contact', 'address'],
  news: ['article', 'headline', 'current'],
  video: ['youtube', 'watch'],
  security: ['vulnerability', 'cve', 'secret', 'audit'],
  secret: ['credential', 'token', 'leak'],
  leaked: ['secret', 'credential', 'exposed'],
  credential: ['secret', 'token', 'password'],
  dependency: ['package', 'npm', 'supply'],
  code: ['source', 'file', 'workspace', 'repository'],
  source: ['code', 'file'],
  db: ['database', 'sql', 'query'],
  auth: ['login', 'token', 'oauth', 'session'],
  test: ['check', 'verify', 'validate'],
  chart: ['graph', 'plot', 'dataframe'],
  keyword: ['seo', 'search', 'ranking'],
  author: ['blame', 'contributor', 'authorship'],
  blame: ['author', 'contributor', 'history'],
  contributor: ['author', 'blame'],
  split: ['divide', 'separate', 'chunk'],
  column: ['field', 'table', 'stats'],
  csv: ['data', 'table', 'stats'],
  version: ['release', 'tag', 'history'],
  blog: ['article', 'rss', 'feed'],
  feed: ['rss', 'atom', 'blog'],
  rss: ['feed', 'atom'],
  atom: ['feed', 'rss'],
  product: ['price', 'item'],
  company: ['business', 'organisation'],
  who: ['author', 'contributor'],
  split_column: ['field', 'table'],
};

/**
 * The reverse edges of the synonym table.
 *
 * The table above is documented as bidirectional, and the code only walked it in one direction: a
 * query saying "scholar" reached nothing, because the entry is `paper: [..., 'scholar', ...]` and
 * the lookup asked for the key. The user-facing vocabulary and the tool-facing vocabulary are the
 * same vocabulary, so a term that appears on either side of an edge has to reach the other side of
 * it. Measured: "scholar" returned no tool at all before this, and returns the arxiv tool after.
 */
const REVERSE_SYNONYMS: Record<string, string[]> = (() => {
  const reverse: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(SYNONYMS)) {
    for (const value of values) {
      const list = reverse[value] ?? [];
      if (!list.includes(key)) list.push(key);
      reverse[value] = list;
    }
  }
  return reverse;
})();

/** Split text into normalised, stemmed-ish terms. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9а-яё]+/i)
    .filter((token) => token.length > 1)
    .map(stem);
}

/**
 * Reduce a term to a crude stem.
 *
 * Not a real Porter stemmer: it only collapses the endings that actually vary inside this registry
 * (-ing, -ion, -ed, -s), which keeps unrelated words from merging while making morphological
 * variants match. Deliberately conservative — a wrong merge is worse than a missed one.
 */
function stem(token: string): string {
  if (token.length <= 3) return token;
  for (const suffix of ['ations', 'ation', 'ings', 'ing', 'ions', 'ion', 'ers', 'er', 'ies', 'ied', 'es', 'ed', 's']) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 3) {
      return token.slice(0, token.length - suffix.length);
    }
  }
  return token;
}

/** Expand a term with its synonyms, stemmed the same way. */
function expand(term: string): string[] {
  const direct = SYNONYMS[term] ?? [];
  const back = REVERSE_SYNONYMS[term] ?? [];
  return [...new Set([...direct, ...back])].map(stem);
}

export interface ScoredTool {
  name: string;
  category: string;
  description: string;
  score: number;
}

/**
 * Score every tool against a task description.
 *
 * BM25 parameters are the usual defaults: k1 controls term saturation (so a tool repeating "fetch"
 * twenty times does not dominate) and b controls how much long descriptions are penalised.
 */
export function rankTools(
  tools: Array<{
    name: string;
    category: string;
    description: string;
    inputSchema?: { properties?: Record<string, unknown> };
  }>,
  task: string,
): ScoredTool[] {
  if (tools.length === 0) return [];

  const queryTerms = tokenize(task);
  if (queryTerms.length === 0) return [];

  // Expand the query: user vocabulary -> tool vocabulary.
  const expanded = new Set<string>();
  for (const term of queryTerms) {
    expanded.add(term);
    for (const synonym of expand(term)) expanded.add(synonym);
  }

  // Precompute the searchable text once per tool.
  const docs = tools.map((tool) => ({
    tool,
    name: tokenize(tool.name.replace(/^pro_(fetch|research|gh|sec)_/, '')),
    category: tokenize(tool.category),
    description: tokenize(tool.description),
    schema: tokenize(Object.keys(tool.inputSchema?.properties ?? {}).join(' ')),
  }));

  const k1 = 1.5;
  const b = 0.6;
  const averageLength = docs.reduce((sum, doc) => sum + doc.name.length + doc.description.length, 0) / docs.length || 1;

  // Document frequency, computed over the name, description and schema blend.
  //
  // The schema belongs in this count. It used to be counted over name and description only, which
  // made the schema signal unreachable: a term that only a tool's *input* names - `repo_slug`,
  // `owner`, `mime_type` - had a document count of zero, so the scoring loop skipped it before the
  // schema boost could be applied. The boost existed and could never fire.
  const documentFrequency = new Map<string, number>();
  for (const doc of docs) {
    const unique = new Set([...doc.name, ...doc.description, ...doc.schema]);
    for (const term of unique) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  }

  const total = docs.length;
  const scored = docs.map(({ tool, name, category, description, schema }) => {
    const length = name.length + description.length;
    const frequencies = new Map<string, number>();
    for (const term of [...name, ...description]) frequencies.set(term, (frequencies.get(term) ?? 0) + 1);

    let score = 0;
    for (const term of expanded) {
      const frequency = frequencies.get(term) ?? 0;
      const documentCount = documentFrequency.get(term) ?? 0;
      const inSchema = schema.includes(term);
      // A term the schema names counts even when the name and description do not mention it -
      // otherwise the schema boost below is unreachable for exactly the terms it exists for.
      if (frequency === 0 && documentCount === 0 && !inSchema) continue;

      // IDF. Terms present in most tools carry no information; a term in one tool carries a lot.
      const idf = Math.log(1 + (total - documentCount + 0.5) / (documentCount + 0.5));

      // BM25 saturation plus length normalisation.
      const tf = frequency / (frequency + k1 * (1 - b + b * (length / averageLength)));
      score += idf * tf * (frequency > 0 ? 2.5 : 0.25);

      // Field boosts. The tool name is what the model must type, so it should dominate.
      if (name.includes(term)) score += idf * 3;
      if (category.includes(term)) score += idf * 1.5;
      if (schema.includes(term)) score += idf * 0.8;
    }

    // Composites describe broad tasks, so they score well on almost any query and would crowd out
    // the specific tool the model actually needs: "arxiv paper" must return the arxiv tool, not the
    // generic executor. Penalise rather than exclude — a genuinely broad query is exactly when a
    // composite is the right answer.
    if (COMPOSITE_NAMES.has(tool.name)) score *= 0.35;

    return { name: tool.name, category: tool.category, description: tool.description, score };
  });

  return scored
    .filter((entry) => entry.score > MIN_RELEVANCE)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/**
 * Minimum score for a tool to be offered at all.
 *
 * BM25 gives every query term a positive IDF, so a nonsense string still scored something and used
 * to return five arbitrary tools — worse than returning none, because the model then reasons about
 * irrelevant results. A tool must clear this bar or the map is empty. Calibrated so genuine
 * single-term queries ("arxiv") clear it comfortably while a term absent from the registry cannot.
 */
const MIN_RELEVANCE = 0.9;

/** Escape a string for safe embedding in a RegExp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
