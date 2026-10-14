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

await walk(path.join(SRC, 'tools'), (file, text) => {
  for (const match of text.matchAll(/name:\s*'([a-z0-9_]+)'/gi)) byToolName.set(match[1], text);
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
  return maxPlatformFunctions.get(runner);
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
  // One-line delegation: `return <fn>(input)` or `return await <fn>(input)`.
  const delegate = /^\s*return\s+(?:await\s+)?([A-Za-z0-9_]+)\s*\(\s*input\s*\)\s*;/m.exec(body);
  if (!delegate) return own;

  for (const [, functions] of coreFunctionIndex) {
    const target = functions.get(delegate[1]);
    if (target) return target;
  }
  return own;
}

export const auditedToolCount = byToolName.size;
