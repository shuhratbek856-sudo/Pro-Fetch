// Resolve, for each tool, the source text that decides which inputs it reads.
//
// Two shapes need handling:
//
//   - A tool whose handler is `return controlCrawlJob(input)` says almost nothing itself; the reads
//     happen in the callee. Following the delegation is the difference between measuring a tool and
//     measuring its stub.
//   - A dispatcher that chains branches declares shared values *between* them. `runBrowserTool` reads
//     `const selector = string(input, 'selector')` on the line immediately before
//     `if (name === 'browser_click')`, and that branch then uses the bare `selector`. Missing that
//     declaration is how an earlier version of this resolver concluded that `browser_click` does not
//     read `selector` - and would have stripped a property the tool cannot work without.
//
// Both mistakes produced false findings in `npm run audit:schema` before they were found, so both
// are handled explicitly here rather than left to a reader's judgement.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const SRC = path.resolve('src');

const fileByToolName = new Map<string, string>();
const coreModules = new Map<string, string>();

async function walk(dir: string, sink: (file: string, text: string) => void): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, sink);
    else if (full.endsWith('.ts')) sink(full, await readFile(full, 'utf8'));
  }
}

/** The `defineTool({ ... })` block owning the `name:` literal at `at`. */
function defineToolBlock(text: string, at: number): string {
  const before = text.lastIndexOf('defineTool(', at);
  const braceStart = text.indexOf('{', before < 0 ? at : before);
  if (braceStart < 0) return text;
  let depth = 0;
  for (let i = braceStart; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(braceStart, i + 1);
    }
  }
  return text.slice(braceStart);
}

await walk(path.join(SRC, 'tools'), (_file, text) => {
  for (const match of text.matchAll(/\bname:\s*'([a-z0-9_]+)'/gi)) {
    fileByToolName.set(match[1], defineToolBlock(text, match.index));
  }
});

await walk(path.join(SRC, 'core'), (file, text) => {
  coreModules.set(path.basename(file), text);
});

/** Named functions in a module, keyed by name, bodies brace-matched. */
function functionsIn(text: string): Map<string, string> {
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

const coreIndex = new Map<string, Map<string, string>>();
for (const [file, text] of coreModules) coreIndex.set(file, functionsIn(text));

/** Runner per SPECS pack, whose tool names are built at runtime and so have no file. */
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
const maxPlatform = coreIndex.get('max-platform-tools.ts') ?? new Map<string, string>();

/**
 * Declarations between branches, which the branches after them read.
 *
 * Only `const x = <reader>(input, 'y')` counts, and only outside any branch, so a declaration that
 * belongs to one action's body cannot leak into the next action.
 */
function gapReads(source: string, consumed: Array<[number, number]>): string[] {
  const inside = (index: number) => consumed.some(([from, to]) => index >= from && index <= to);
  const found: string[] = [];

  for (const m of source.matchAll(
    /^\s*const\s+[A-Za-z0-9_]+\s*=\s*(?:string|num|bool|objectInput)\s*\(\s*input\s*,\s*'([a-z_0-9]+)'/gm,
  )) {
    if (!inside(m.index)) found.push(m[1]);
  }
  for (const m of source.matchAll(/^\s*const\s+[A-Za-z0-9_]+\s*=\s*sessionId\s*\(\s*input\s*\)/gm)) {
    if (!inside(m.index)) found.push('session_id');
  }
  for (const m of source.matchAll(/^\s*const\s+[A-Za-z0-9_]+\s*=\s*Number\s*\(\s*input\.([a-z_0-9]+)/gm)) {
    if (!inside(m.index)) found.push(m[1]);
  }
  return found;
}

/** Follow local helpers a function calls, so a read hidden one hop down still counts. */
function withHelpers(body: string, siblings: Map<string, string>, depth = 2): string {
  if (depth <= 0) return body;
  let grown = body;
  for (const [name, definition] of siblings) {
    if (!new RegExp(`(?<![.\\w])${name}\\s*\\(`).test(body)) continue;
    if (new RegExp(`(?:const|let|var|function)\\s+${name}\\b`).test(body)) continue;
    if (grown.includes(definition)) continue;
    grown += `\n${withHelpers(definition, siblings, depth - 1)}`;
  }
  return grown;
}

/** Branch bodies of an `if (x === 'label') { ... }` chain, plus the declarations between them. */
function ifChain(source: string, label: string): Map<string, string> {
  const found = new Map<string, string>();
  const consumed: Array<[number, number]> = [];
  const marker = new RegExp(
    `(?:if|else\\s+if)\\s*\\(\\s*${label}\\s*===\\s*'([a-z_]+)'\\s*\\)\\s*(?:return\\s+[^{]*?)?\\{`,
    'g',
  );

  for (let m = marker.exec(source); m; m = marker.exec(source)) {
    const braceStart = source.indexOf('{', m.index + m[0].length - 1);
    let depth = 0;
    let i = braceStart;
    while (i < source.length) {
      if (source[i] === '{') depth++;
      else if (source[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
      i++;
    }
    consumed.push([m.index, i]);
    found.set(m[1], source.slice(braceStart, i + 1));
  }

  const shared = gapReads(source, consumed);
  if (shared.length) {
    const header = `/* reads: ${shared.join(', ')} */`;
    for (const [key, body] of found) found.set(key, `${header}\n${body}`);
  }
  return found;
}

/** Branch bodies of a `switch (label) { case 'a': { ... } }`, which `runBrowserAction` uses. */
function switchChain(source: string, label: string): Map<string, string> {
  const found = new Map<string, string>();
  const at = source.indexOf(`switch (${label})`);
  if (at < 0) return found;

  const open = source.indexOf('{', at);
  let depth = 0;
  let close = open;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  const body = source.slice(open, close);

  const consumed: Array<[number, number]> = [];
  const blockMarker = /(?:case\s+'([a-z_]+)'\s*:\s*)+[^{]*\{/g;
  for (let m = blockMarker.exec(body); m; m = blockMarker.exec(body)) {
    const labels = [...m[0].matchAll(/case\s+'([a-z_]+)'/g)].map((x) => x[1]);
    const braceStart = body.indexOf('{', m.index + m[0].length - 1);
    let d = 0;
    let end = braceStart;
    for (let i = braceStart; i < body.length; i++) {
      if (body[i] === '{') d++;
      else if (body[i] === '}') {
        d--;
        if (d === 0) {
          end = i + 1;
          break;
        }
      }
    }
    consumed.push([m.index, end]);
    const chunk = body.slice(braceStart, end);
    for (const name of labels) found.set(name, (found.get(name) ?? '') + chunk);
  }

  const shared = gapReads(body, consumed);
  if (shared.length) {
    const header = `/* reads: ${shared.join(', ')} */`;
    for (const [key, chunk] of found) found.set(key, `${header}\n${chunk}`);
  }
  return found;
}

/** Reads performed before any branch, which apply to every tool the dispatcher serves. */
function preamble(region: string): string {
  const boundaries = [...region.matchAll(/\n\s*(?:switch\s*\(|if\s*\(\s*(?:name|action)\s*===)/g)];
  return region.slice(0, boundaries.length ? boundaries[0].index : 600);
}

/** Per-branch source for `runBrowserTool`, keyed by full tool name. */
const browserByName = new Map<string, string>();
const browserToolAt = coreModules.get('browser-tools.ts') ?? '';
if (browserToolAt.includes('runBrowserTool')) {
  const region = browserToolAt.slice(browserToolAt.indexOf('export async function runBrowserTool'));
  const shared = preamble(region);
  for (const [name, body] of ifChain(region, 'name')) {
    browserByName.set(`pro_browser_${name}`, shared + '\n' + body);
  }
}

/** Per-action source for `runBrowserAction`, keyed by action value. */
const browserByAction = new Map<string, string>();
if (browserToolAt.includes('runBrowserAction')) {
  const region = browserToolAt.slice(browserToolAt.indexOf('export async function runBrowserAction'));
  const shared = preamble(region);
  for (const [action, body] of switchChain(region, 'action')) {
    browserByAction.set(action, shared + '\n' + body);
  }
}

/** Which action value a tool injects, read from `runBrowserAction({ ...input, action: 'x' })`. */
const actionByTool = new Map<string, string>();
for (const [name, source] of fileByToolName) {
  const injected = /runBrowserAction\(\s*\{[\s\S]*?action:\s*'([a-z_]+)'/.exec(source);
  if (injected) actionByTool.set(name, injected[1]);
}

/**
 * The source for a tool, or undefined when it cannot be resolved.
 *
 * Undefined is the signal to leave a tool alone. A too-wide schema misleads; a too-narrow one breaks.
 */
export function resolveToolSource(toolName: string, category = ''): string | undefined {
  const action = actionByTool.get(toolName);
  if (action) {
    const branch = browserByAction.get(action);
    if (branch) return withHelpers(branch, coreIndex.get('browser-tools.ts') ?? new Map());
  }

  const browserBranch = browserByName.get(toolName);
  if (browserBranch) {
    return withHelpers(browserBranch, coreIndex.get('browser-tools.ts') ?? new Map());
  }

  const own = fileByToolName.get(toolName);
  if (own) {
    const handler = /async\s+handler\s*\([^)]*\)\s*\{/.exec(own);
    if (!handler) return own;
    const start = handler.index + handler[0].length;
    let depth = 1;
    let i = start;
    while (i < own.length && depth > 0) {
      if (own[i] === '{') depth++;
      else if (own[i] === '}') depth--;
      i++;
    }
    const body = own.slice(start, i - 1);
    const local = functionsIn(own);

    // A one-line delegation whose arguments include `input`.
    const delegate = /^\s*return\s+(?:await\s+)?([A-Za-z0-9_]+)\s*\([^)]*\binput\b[^)]*\)\s*;/m.exec(body);
    if (!delegate) return withHelpers(body, local);

    for (const [file, functions] of coreIndex) {
      const target = functions.get(delegate[1]);
      if (target) return withHelpers(target, functions);
    }
    return own;
  }

  const runner = SPEC_RUNNERS[category];
  if (runner) {
    const body = maxPlatform.get(runner);
    if (body) return withHelpers(body, maxPlatform);
  }
  return undefined;
}

export const resolvedToolCount = fileByToolName.size;
