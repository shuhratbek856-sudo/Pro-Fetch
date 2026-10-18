/**
 * Infer tool arguments from a natural-language task description.
 *
 * ## Why this exists
 *
 * `capability_map` ranks tools by relevance, but its `suggested_call` used to return empty
 * argument objects (`arguments: {}`). The model then had to figure out the arguments itself —
 * and a wrong argument is the most common reason a correctly discovered tool then fails. A task
 * like "research climate change" contains everything needed to fill `pro_research_deep`'s `topic`
 * field; leaving it empty just moves the work back to the model.
 *
 * ## What this does
 *
 * Extracts the argument shapes a task description actually contains:
 *
 * - **URLs** — `https?://...` and bare `www.` hosts, so "look at https://example.com" fills `url`.
 * - **Queries** — the topic phrase after "about", "on", "for", "regarding", so "papers on retrieval"
 *   fills `query` with "retrieval" rather than the whole sentence.
 * - **File paths** — tokens that look like paths (`/x`, `./x`, `~/x`, `C:\x`) for filesystem tools.
 * - **Emails** — `user@host.tld` for contact-related tools.
 * - **Numbers** — quantities for `limit`/`count` style fields, bounded to sane defaults.
 *
 * ## What it deliberately does not do
 *
 * It does not guess. Every extraction is a pattern the task text must actually match — a task with
 * no URL yields no `url`, so a tool that requires one fails with MISSING_INPUT rather than being
 * called with a fabricated value. The map ranks; the inference fills only what is present.
 */

/** A URL with its trailing punctuation stripped. */
const URL_PATTERN = /https?:\/\/[^\s"'`<>\)]+/gi;

/** A bare host like www.example.com (no scheme). */
const BARE_HOST_PATTERN = /(?:^|\s)(www\.[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)/gi;

/** An email address. */
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** A filesystem path. */
const PATH_PATTERN = /(?:^|\s)((?:\/|\.\/|\.\.\/|~|[A-Za-z]:\\)[^\s"'`]+)/g;

/** An arXiv-style identifier: YYMM.NNNNN with an optional version suffix. */
const ARXIV_ID_PATTERN = /\b\d{4}\.\d{4,5}(?:v\d+)?\b/;

/** A DOI: 10.NNNN/something. */
const DOI_PATTERN = /\b10\.\d{4,9}\/[^\s"'`]+/i;

/** Topic-introducing prepositions; the text after one is the query. */
const QUERY_PREFIXES = ['about', 'on', 'for', 'regarding', 'concerning', 'related to', 'of'];

/**
 * Normalise a URL: strip trailing punctuation that sentence prose attaches but URLs do not carry.
 */
function cleanUrl(raw: string): string {
  return raw.replace(/[.,;:!?)\]}]+$/, '');
}

/**
 * Extract the first URL mentioned in the task, if any.
 */
export function inferUrl(task: string): string | undefined {
  URL_PATTERN.lastIndex = 0;
  const match = URL_PATTERN.exec(task);
  if (match) return cleanUrl(match[0]);
  BARE_HOST_PATTERN.lastIndex = 0;
  const bare = BARE_HOST_PATTERN.exec(task);
  if (bare) return 'https://' + bare[1];
  return undefined;
}

/**
 * Extract an email address from the task, if any.
 */
export function inferEmail(task: string): string | undefined {
  EMAIL_PATTERN.lastIndex = 0;
  const match = EMAIL_PATTERN.exec(task);
  return match ? match[0] : undefined;
}

/**
 * Extract filesystem paths from the task, if any.
 */
export function inferPaths(task: string): string[] {
  const paths: string[] = [];
  for (const match of task.matchAll(PATH_PATTERN)) {
    const value = match[1]!.trim();
    if (value.length > 1 && !value.includes(' ')) paths.push(value);
  }
  return paths.slice(0, 3);
}

/**
 * Extract a search query from the task.
 *
 * Prefers the phrase after a topic preposition ("papers about X" → "X"), because that is the part
 * a search tool actually needs. Falls back to the whole task minus URLs, which is still better than
 * an empty argument when no preposition is present.
 *
 * Prefixes are matched as whole words, not substrings: "on" must not match the "on" inside
 * "generation", which would otherwise produce an empty candidate that wins by being shortest.
 */
export function inferQuery(task: string): string | undefined {
  let best: string | undefined;
  for (const prefix of QUERY_PREFIXES) {
    const pattern = new RegExp(`\\b${prefix}\\b`, 'i');
    const match = pattern.exec(task);
    if (!match) continue;
    // Drop everything before the preposition: "papers about retrieval" → "retrieval", not
    // "papers about retrieval". The preposition marks where the topic begins.
    const candidate = task.slice(match.index + prefix.length).trim();
    if (!best || candidate.length < best.length) best = candidate;
  }
  if (best) return best.replace(/[.,;:!?]+$/, '').trim();
  // No preposition: strip URLs and use the remainder as a coarse query.
  const stripped = task.replace(URL_PATTERN, '').trim();
  return stripped.length > 3 ? stripped : undefined;
}

/**
 * Extract an arXiv-style identifier from the task, if any.
 */
export function inferId(task: string): string | undefined {
  const arxiv = ARXIV_ID_PATTERN.exec(task);
  if (arxiv) return arxiv[0];
  const doi = DOI_PATTERN.exec(task);
  if (doi) return doi[0];
  return undefined;
}

/**
 * Extract a number suitable for a `limit`/`count` argument.
 *
 * Only extracts when the task states a quantity explicitly ("top 5", "10 results"). A number that
 * appears without a quantity word is more likely a version or an ID, so it is ignored.
 */
export function inferLimit(task: string): number | undefined {
  const match = /(\d{1,3})\s*(?:results?|items?|papers?|articles?|pages?|top)/i.exec(task);
  if (match) return Math.max(1, Math.min(100, parseInt(match[1]!, 10)));
  const top = /top\s+(\d{1,3})/i.exec(task);
  if (top) return Math.max(1, Math.min(100, parseInt(top[1]!, 10)));
  return undefined;
}

/**
 * Infer arguments for a specific tool from the task description.
 *
 * Returns only the fields the tool's `inputSchema` actually declares, and only values the task
 * text actually contains. The caller merges these with any explicit arguments the model already
 * provided, so inference never overwrites a deliberate value.
 */
export function inferArguments(
  task: string,
  inputSchema: { properties?: Record<string, unknown> },
): Record<string, unknown> {
  const properties = inputSchema.properties ?? {};
  const args: Record<string, unknown> = {};
  const url = inferUrl(task);
  const email = inferEmail(task);
  const query = inferQuery(task);
  const paths = inferPaths(task);
  const limit = inferLimit(task);
  const id = inferId(task);

  for (const field of Object.keys(properties)) {
    const schema = properties[field] as { type?: string; description?: string } | undefined;
    const description = (schema?.description ?? '').toLowerCase();
    if (
      id &&
      (field === 'id' ||
        field === 'doi' ||
        description.includes('arxiv') ||
        description.includes('paper id') ||
        description.includes('doi'))
    ) {
      args[field] = id;
    } else if (field === 'task') {
      // `task` is the discovery tool's own verbatim input, not a derived value.
      args[field] = task;
    } else if (
      query &&
      (field === 'query' ||
        field === 'q' ||
        field === 'topic' ||
        field === 'search' ||
        description.includes('search') ||
        description.includes('query') ||
        description.includes('topic'))
    ) {
      args[field] = query;
    } else if (url && (field === 'url' || field === 'link' || field === 'uri' || description.includes('url'))) {
      args[field] = url;
    } else if (email && (field === 'email' || field === 'mail' || description.includes('email'))) {
      args[field] = email;
    } else if (
      paths.length > 0 &&
      (field === 'path' ||
        field === 'file' ||
        field === 'file_path' ||
        field === 'directory' ||
        description.includes('path') ||
        description.includes('file'))
    ) {
      args[field] = paths[0];
    } else if (
      limit !== undefined &&
      (field === 'limit' ||
        field === 'count' ||
        field === 'per_page' ||
        description.includes('limit') ||
        description.includes('count'))
    ) {
      args[field] = limit;
    }
  }

  return args;
}
