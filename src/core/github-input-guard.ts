import type { ToolDefinition } from './types.js';

/**
 * The github-category handlers build `https://api.github.com/...` paths by string concatenation.
 * The host is fixed, but an unvalidated value such as `repo: "x/../../user"` or `sha: "abc?per_page=1#"`
 * could still steer a request (carrying GITHUB_TOKEN) to a different API endpoint than the tool documents.
 * This guard rejects such values centrally before any github handler runs.
 */

export class GithubInputError extends Error {
  readonly code = 'INVALID_INPUT';
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = 'GithubInputError';
  }
}

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,98}[A-Za-z0-9_])?$/; // user, org, owner
const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const GIST_RE = /^[A-Za-z0-9]{1,64}$/;
// ref-like fields (branch, tag, sha, base, head, ref): git forbids "..", whitespace, "?", "~", "^", ":" is allowed for owner:branch
const REF_RE = /^[^\s?#%\\\u0000-\u001f\u007f~^*[]{1,255}$/;
// repository file paths: forward slashes allowed, no traversal / query / fragment / percent-escapes
const PATH_RE = /^[^?#%\\\u0000-\u001f\u007f]{0,1024}$/;

function str(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw new GithubInputError(`'${key}' matn bo'lishi kerak.`);
  return v;
}

function positiveInt(input: Record<string, unknown>, key: string, max = 2_147_483_647): void {
  const v = input[key];
  if (v === undefined || v === null || v === '') return;
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > max) throw new GithubInputError(`'${key}' musbat butun son bo'lishi kerak.`);
}

/** A "." or ".." path segment (directory traversal). */
function hasDotSegment(value: string): boolean {
  return value.split('/').some((segment) => segment === '.' || segment === '..');
}

/** git ref names can never contain ".." (and the segment check also covers "./").  */
function hasRefTraversal(value: string): boolean {
  return value.includes('..') || hasDotSegment(value);
}

/**
 * Accept both `repo` and `owner/repo`.
 *
 * Every GitHub tool documented `repo` as "Repository nomi" with no format, while the codehost tools
 * — documented with the identical wording — require the combined form. A caller who learned one
 * convention got "'repo' qiymati yaroqsiz repository nomi" from the other 42 tools, with nothing
 * indicating which of the two was wrong.
 *
 * The combined form is validated segment by segment rather than by widening REPO_RE: each side must
 * still be a legal owner or repository name, so allowing the separator cannot admit a traversal, a
 * leading slash, or an over-long path.
 */
function validRepoSpecifier(value: string): boolean {
  if (value === '.' || value === '..') return false;
  if (!value.includes('/')) return REPO_RE.test(value);

  const segments = value.split('/');
  // Exactly one separator: `owner/repo`. A deeper path is a route, not a repository, and accepting
  // it would forward an unvalidated trailing segment into a URL.
  if (segments.length !== 2) return false;
  const [owner, repo] = segments as [string, string];
  if (!owner || !repo) return false;
  return OWNER_RE.test(owner) && REPO_RE.test(repo);
}

export function assertGithubInput(
  tool: Pick<ToolDefinition, 'category' | 'name'> & { inputSchema?: { required?: string[] } },
  input: Record<string, unknown>,
): void {
  if (tool.category !== 'github') return;

  for (const key of ['owner', 'org', 'user']) {
    const v = str(input, key);
    if (v !== undefined && (!OWNER_RE.test(v) || v === '.' || v === '..'))
      throw new GithubInputError(`'${key}' qiymati yaroqsiz GitHub nomi.`);
  }
  const repo = str(input, 'repo');
  if (repo !== undefined && !validRepoSpecifier(repo))
    throw new GithubInputError(
      "'repo' qiymati yaroqsiz. Ikkala shakl ham qabul qilinadi: `node` (owner alohida berilganda) " +
        'yoki `nodejs/node` (birlashtirilgan).',
    );

  // Normalise the combined form so every one of the 42 GitHub tools accepts it.
  //
  // Each handler reads `input.owner` and `input.repo` separately, so rewriting the specifier here —
  // after validating it and before any handler runs — makes the whole category accept both shapes
  // without touching 42 files. `owner` is only filled in when the caller did not supply one: an
  // explicit owner still wins, which is what a caller overriding the prefix intends.
  if (repo?.includes('/')) {
    const [ownerFromRepo, repoName] = repo.split('/') as [string, string];
    if (input.owner === undefined || input.owner === null || input.owner === '') input.owner = ownerFromRepo;
    input.repo = repoName;
  }
  const gist = str(input, 'gist_id');
  if (gist !== undefined && !GIST_RE.test(gist)) throw new GithubInputError("'gist_id' qiymati yaroqsiz.");

  for (const key of ['sha', 'ref', 'base', 'head', 'tag', 'branch']) {
    const v = str(input, key);
    if (v !== undefined && (!REF_RE.test(v) || hasRefTraversal(v)))
      throw new GithubInputError(`'${key}' qiymatida ruxsat etilmagan belgilar bor.`);
  }
  const filePath = str(input, 'path');
  if (filePath !== undefined && (!PATH_RE.test(filePath) || hasDotSegment(filePath)))
    throw new GithubInputError("'path' qiymatida '..', '?', '#', '%' yoki boshqaruv belgilari bo'lishi mumkin emas.");

  for (const key of ['issue_number', 'pr_number', 'release_id']) positiveInt(input, key);
  // Values are interpolated into query strings, so they must be plain integers. Upper bounds are
  // intentionally loose: handlers (or GitHub itself) already clamp per_page / max_pages.
  positiveInt(input, 'page', 100_000);
  positiveInt(input, 'per_page', 10_000);
  positiveInt(input, 'max_pages', 10_000);

  assertRequiredPresent(tool, input);
}

/**
 * Reject a call that omits an argument the tool declares as required.
 *
 * The checks above answer "is this value well formed?". This one answers "was a value supplied at
 * all?", which they cannot: `str()` deliberately maps `''` to `undefined` so format checks skip absent
 * fields, and a caller who omits `owner` produces no malformed value to complain about.
 *
 * That gap was user-visible rather than theoretical. `inputSchema.required` is only advertised to the
 * MCP client - nothing in the dispatcher enforced it - so `pro_gh_repo_readme` called with `{}`
 * assembled `/repos/undefined/undefined` and GitHub answered 404. The caller was told the repository
 * does not exist, which sends them looking for a repository that was never named.
 *
 * Doing this here rather than in each handler keeps it in one place and covers composites such as
 * `pro_pr_review`, which are registered separately from the tool file that would otherwise hold the
 * check. The schema is the single source of truth, so adding a requirement to a tool needs no second
 * edit here.
 */
function assertRequiredPresent(tool: { inputSchema?: { required?: string[] } }, input: Record<string, unknown>): void {
  const required = tool.inputSchema?.required;
  if (!Array.isArray(required) || required.length === 0) return;

  const missing: string[] = [];
  for (const key of required) {
    const value = input[key];
    // Whitespace is present but not usable: `owner: '   '` would otherwise pass presence and reach
    // the API as a blank path segment, producing the same 404 this check exists to prevent.
    if (value === undefined || value === null) missing.push(key);
    else if (typeof value === 'string' && value.trim() === '') missing.push(key);
  }

  if (missing.length) {
    // No tool name here: the policy layer already prefixes the message with `Xato (<tool>):`, and
    // repeating it produced "Xato (pro_gh_repo_readme): pro_gh_repo_readme: ...".
    throw new GithubInputError(`majburiy argumentlar berilmadi: ${missing.join(', ')}.`);
  }
}
