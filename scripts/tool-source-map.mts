// Resolves, for each tool, the source that actually decides which inputs it reads.
//
// The first version of `audit-schema.mts` used `String(tool.handler)` - the compiled function - and
// skipped every category-padded tool because that text says nothing. The second tried a source-file
// lookup that no registry exposed. This module does the honest thing: it reads the tool's own file,
// notices when the handler is a one-line delegation, and follows it to the function that does the
// work.
//
// That resolution is what makes the crawl/media family measurable. `pro_fetch_crawl_pause_resume`
// declares `required: ['url']` while its handler is `return controlCrawlJob(input)`, and
// `controlCrawlJob` reads `job_id` and `action`. Judged by the tool file alone, `url` looks used.
//
// Only one level of delegation is followed. Deeper chains would need a call graph, and no tool in
// this repository chains more than one hop: the second-level functions all live inside the same
// module and take the same input object.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const SRC = path.resolve('src');

/** Tool name -> the file that declares it. */
const byToolName = new Map<string, string>();
/** Every core module's text, for resolving a delegation target. */
const coreModules = new Map<string, string>();

async function walk(dir: string, sink: (file: string, text: string) => void): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, sink);
    else if (full.endsWith('.ts')) sink(full, await readFile(full, 'utf8'));
  }
}

/**
 * A file can define more than one tool: `src/tools/github/repo_audit.ts` exports both
 * `pro_gh_repo_audit` and `pro_pr_review`, and `pr_review_tool.ts` is a registration shim for the
 * second. Indexing the whole file per name resolved both names to the *first* `defineTool`, so
 * `pro_pr_review` was measured against `pro_gh_repo_audit`'s code and reported as not reading
 * `pr_number` - which it reads, twice.
 *
 * So each name is mapped to its own `defineTool({...})` block rather than to the file.
 */
function defineToolBlock(text: string, at: number): string {
  // Walk back to the enclosing `defineTool(`.
  const before = text.lastIndexOf('defineTool(', at);
  const braceStart = text.indexOf('{', before < 0 ? at : before);
  if (braceStart < 0) return text;

  let depth = 0;
  let i = braceStart;
  while (i < text.length) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(braceStart, i + 1);
    }
    i++;
  }
  return text.slice(braceStart);
}

await walk(path.join(SRC, 'tools'), (file, text) => {
  for (const match of text.matchAll(/\bname:\s*'([a-z0-9_]+)'/gi)) {
    byToolName.set(match[1], defineToolBlock(text, match.index));
  }
});

await walk(path.join(SRC, 'core'), (file, text) => {
  coreModules.set(path.basename(file), text);
});

function functionsIn(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of text.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\([^)]*\)[^{]*\{/gm)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    found.set(match[1], text.slice(start, i - 1));
  }
  return found;
}

const coreFunctionIndex = new Map<string, Map<string, string>>();
for (const [file, text] of coreModules) coreFunctionIndex.set(file, functionsIn(text));

/**
 * The nine packs registered from `SPECS` in `max-platform-tools.ts` get their names built at runtime
 * (`pro_fetch_security_${action}`), so no `name: '...'` literal exists for them and the file walk
 * cannot find them. Their handler is a closure over `executeSpec`, which switches on category and
 * calls one `run<Category>` per pack, so that runner is the code that decides what is read.
 *
 * Without this, every one of those 200 tools fell back to its compiled closure - which mentions no
 * property at all - and all 130 "required but unread" findings were artefacts of that.
 */
const SPEC_RUNNERS: Record<string, string> = {
  git: 'runGit',
  codehost: 'runCodehost',
  devops: 'runDevops',
  database: 'runDatabase',
  security: 'runSecurity',
  knowledge: 'runKnowledge',
  collaboration: 'runCollaboration',
  storage: 'runStorage',
  productivity: 'runProductivity',
};

const maxPlatformFunctions = coreFunctionIndex.get('max-platform-tools.ts') ?? new Map<string, string>();

function specSourceFor(toolName: string, category: string): string | undefined {
  const runner = SPEC_RUNNERS[category];
  if (!runner) return undefined;
  const body = maxPlatformFunctions.get(runner);
  return body ? expand(body, maxPlatformFunctions) : undefined;
}

/**
 * Widen a function body to include the local helpers it calls.
 *
 * Without this the audit reported 31 false findings. `runGit` does not read `confirm` itself - it
 * calls `requireConfirmation(i)` - so a `required: ['confirm']` on a git tool looked like a property
 * nobody read, when in fact `runGit` verifies it before every mutation. Verified by calling
 * `pro_fetch_git_branch_create` with a branch and no confirm: it correctly refuses.
 *
 * A call is only followed when the callee is a top-level function in the same module, and only when
 * the body contains no nested `const fn = () =>` of that name, so this cannot pull in an unrelated
 * shadowed binding. Depth is bounded because two hops cover every helper in these modules; three was
 * not needed by any tool and a deeper walk starts costing more than it explains.
 */
function expand(body: string, siblings: Map<string, string>, depth = 2): string {
  if (depth <= 0) return body;

  let grown = body;
  for (const [name, definition] of siblings) {
    // Only follow an actual call: `foo(` and not a property access like `this.foo(`.
    const called = new RegExp(`(?<![.\\w])${name}\\s*\\(`).test(body);
    if (!called) continue;
    if (new RegExp(`(?:const|let|var|function)\\s+${name}\\b`).test(body)) continue;
    if (grown.includes(definition)) continue;
    grown += `\n${expand(definition, siblings, depth - 1)}`;
  }
  return grown;
}

/** What a tool's real code reads, or undefined when it cannot be resolved. */
export function sourceFor(toolName: string, category?: string): string | undefined {
  const own = byToolName.get(toolName);
  if (!own) {
    // Runtime-named SPECS pack tool: resolve to the runner for its category.
    return category ? specSourceFor(toolName, category) : undefined;
  }

  const handler = /async\s+handler\s*\([^)]*\)\s*\{/.exec(own);
  if (!handler) return own;

  const body = own.slice(handler.index + handler[0].length);
  // One-line delegation whose argument list contains `input`. The argument need not be the only one:
  // `return runCrawlTool('pro_fetch_extract_links', input)` passes the tool name first, and a
  // pattern anchored on `\(input\)` missed it - which is how 14 crawl tools were wrongly reported as
  // requiring a `url` their code never reads.
  const delegate = /^\s*return\s+(?:await\s+)?([A-Za-z0-9_]+)\s*\([^)]*\binput\b[^)]*\)\s*;/m.exec(body);
  if (!delegate) return expand(handlerBody(own, handler), localFunctions(own));

  for (const [, functions] of coreFunctionIndex) {
    const target = functions.get(delegate[1]);
    if (target) return expand(target, functions);
  }
  return own;
}

/** The handler's body, closing at the matching brace rather than running to end of file. */
function handlerBody(text: string, match: RegExpExecArray): string {
  const start = match.index + match[0].length;
  let depth = 1;
  let i = start;
  while (i < text.length && depth > 0) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    i++;
  }
  return text.slice(start, i - 1);
}

/** Top-level and nested named functions in a tool file, so a handler's own helpers are visible. */
function localFunctions(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of text.matchAll(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\([^)]*\)[^{]*\{/g)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    found.set(match[1], text.slice(start, i - 1));
  }
  return found;
}

export const auditedToolCount = byToolName.size;
