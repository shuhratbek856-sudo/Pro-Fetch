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

/**
 * Named functions in a module, keyed by name, bodies brace-matched.
 *
 * The body brace is found by scanning rather than by pattern, because a return type can contain
 * braces of its own. `bytesFromInput(input: Input): Promise<{ bytes: Buffer; contentType: string;
 * source: string }>` in `media-tools.ts`: a pattern anchored on `[^{]*` stopped at the `{` of the
 * type literal and took *that* as the function body, so the `str(input, 'base64')` read inside the
 * real body was invisible and all 15 media tools looked as though they ignored the `base64` they
 * advertise and accept.
 *
 * Prettier puts a multi-line function body's `{` at the end of its line, which is what tells a type
 * brace from a body brace. When no such brace exists - a one-line body - the first brace after the
 * parameter list is used, which is what this did before.
 */
function functionsIn(text: string): Map<string, string> {
  const found = new Map<string, string>();
  const signature = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;

  for (const match of text.matchAll(signature)) {
    const afterParams = text.indexOf(')', match.index + match[0].length - 1);
    if (afterParams < 0) continue;

    let brace = text.indexOf('{', afterParams);
    let lineEnd = text.indexOf('\n', afterParams);
    while (brace >= 0) {
      lineEnd = text.indexOf('\n', brace);
      if (lineEnd < 0 || text.slice(brace + 1, lineEnd).trim() === '') break;
      brace = text.indexOf('{', brace + 1);
    }
    if (brace < 0) continue;

    let depth = 1;
    let i = brace + 1;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      i++;
    }
    found.set(match[1], text.slice(brace + 1, i - 1));
  }
  return found;
}

const coreIndex = new Map<string, Map<string, string>>();
for (const [file, text] of coreModules) coreIndex.set(file, functionsIn(text));

/**
 * Every core function, by name, keeping only names that are unambiguous across modules.
 *
 * A tool handler that is not a one-line delegation still calls core helpers inline - `css_select` does
 * `const fr = await sourceFrom(p)` in the middle of its body - and those reads decide what the tool
 * accepts. Without this index the fourteen `sourceFrom` tools looked as though they never read `url`,
 * even though that helper fetches it.
 *
 * A name defined in two modules is dropped rather than guessed: pulling in the wrong body would
 * invent reads that do not happen.
 */
const allCoreFunctions = new Map<string, string[]>();
for (const functions of coreIndex.values()) {
  for (const [name, body] of functions) {
    const bucket = allCoreFunctions.get(name);
    if (bucket) bucket.push(body);
    else allCoreFunctions.set(name, [body]);
  }
}
const uniqueCoreFunctions = new Map<string, string>();
for (const [name, bodies] of allCoreFunctions) {
  if (bodies.length === 1) uniqueCoreFunctions.set(name, bodies[0]);
}

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
 * Two shapes matter. `const selector = string(input, 'selector')` names the property directly. But a
 * dispatcher may also resolve its input once, before branching, through a helper - `runMediaTool`
 * does `const media = await readMediaSource(input)`, and `readMediaSource` is where `base64` is read.
 * Without following that call every one of the 15 media tools looked as though it ignored `base64`,
 * which their schemas advertise as an alternative and which they accept: verified by calling
 * `pro_fetch_image_info` with a base64 PNG, which answers `{"source": "input base64", ...}`.
 *
 * Only declarations outside any branch count, so a declaration belonging to one action's body cannot
 * leak into the next action.
 */
function gapReads(source: string, consumed: Array<[number, number]>, siblings?: Map<string, string>): string[] {
  const inside = (index: number) => consumed.some(([from, to]) => index >= from && index <= to);
  const found: string[] = [];

  // Any reader called with a literal key after `input` counts, not just the shared input helpers.
  //
  // `bytesFromInput` - which every media tool resolves through - reads `str(input, 'base64',
  // 'data_base64')`, and `str` is a function local to `media-tools.ts` rather than one of the shared
  // helpers. Listing only `string|num|bool|objectInput` missed it, so all 15 media tools looked as
  // though they ignored the `base64` their schemas advertise and accept.
  for (const m of source.matchAll(
    /^\s*const\s+[A-Za-z0-9_]+\s*=\s*(?:await\s+)?[A-Za-z0-9_]+\s*\(\s*input\s*,\s*'([a-z_0-9]+)'/gm,
  )) {
    if (!inside(m.index)) found.push(m[1]);
  }
  for (const m of source.matchAll(/^\s*const\s+[A-Za-z0-9_]+\s*=\s*sessionId\s*\(\s*input\s*\)/gm)) {
    if (!inside(m.index)) found.push('session_id');
  }
  for (const m of source.matchAll(/^\s*const\s+[A-Za-z0-9_]+\s*=\s*Number\s*\(\s*input\.([a-z_0-9]+)/gm)) {
    if (!inside(m.index)) found.push(m[1]);
  }

  if (siblings) {
    for (const m of source.matchAll(
      /^\s*const\s+[A-Za-z0-9_]+\s*=\s*(?:await\s+)?([A-Za-z0-9_]+)\s*\(\s*input\s*(?:,|\))/gm,
    )) {
      if (inside(m.index)) continue;
      const body = siblings.get(m[1]) ?? uniqueCoreFunctions.get(m[1]);
      if (!body) continue;
      for (const nested of gapReads(body, [], siblings)) if (!found.includes(nested)) found.push(nested);
    }
  }
  return found;
}

/** Follow local helpers a function calls, so a read hidden one hop down still counts. */
function withHelpers(body: string, siblings: Map<string, string>, depth = 2, extra?: Map<string, string>): string {
  if (depth <= 0) return body;
  let grown = body;
  const pool = new Map([...siblings, ...(extra ?? [])]);
  for (const [name, definition] of pool) {
    if (!new RegExp(`(?<![.\\w])${name}\\s*\\(`).test(body)) continue;
    if (new RegExp(`(?:const|let|var|function)\\s+${name}\\b`).test(body)) continue;
    if (grown.includes(definition)) continue;
    grown += `\n${withHelpers(definition, siblings, depth - 1, extra)}`;
  }
  return grown;
}

/** Branch bodies of an `if (x === 'label') { ... }` chain, plus the declarations between them. */
function ifChain(source: string, label: string, siblings?: Map<string, string>): Map<string, string> {
  const found = new Map<string, string>();
  const consumed: Array<[number, number]> = [];

  // The condition is read as balanced parentheses rather than a fixed pattern, because a dispatcher
  // groups several tools into one branch. `runMediaTool` has
  //   if (name === 'image_info' || name === 'exif_read' || name === 'image_convert' || ...) {
  // and a pattern anchored on `name === 'x')` matched none of the group, leaving 11 of the 15 media
  // tools resolved to the whole runner - and therefore advertising the union of all fifteen.
  const opener = /\b(?:else\s+)?if\s*\(/g;
  const test = new RegExp(`\\b${label}\\s*===\\s*'([a-z_]+)'`, 'g');

  const record = (labels: string[], from: number, to: number, chunk: string): void => {
    consumed.push([from, to]);
    for (const name of labels) found.set(name, (found.get(name) ?? '') + chunk);
  };

  for (let m = opener.exec(source); m; m = opener.exec(source)) {
    const open = source.indexOf('(', m.index);
    let depth = 0;
    let i = open;
    for (; i < source.length; i++) {
      if (source[i] === '(') depth++;
      else if (source[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    const labels = [...source.slice(open + 1, i).matchAll(test)].map((x) => x[1]);
    if (!labels.length) continue;

    let j = i + 1;
    while (j < source.length && /\s/.test(source[j])) j++;

    if (source[j] === '{') {
      let d = 0;
      let end = j;
      for (let k = j; k < source.length; k++) {
        if (source[k] === '{') d++;
        else if (source[k] === '}') {
          d--;
          if (d === 0) {
            end = k + 1;
            break;
          }
        }
      }
      record(labels, m.index, end, source.slice(j, end));
    } else if (source.startsWith('return', j)) {
      // A single-statement branch: `if (name === 'svg_to_png') assertSvg(media.bytes);`
      const semi = source.indexOf(';', j);
      if (semi > 0) record(labels, m.index, semi, source.slice(j, semi + 1));
    }
  }

  const shared = gapReads(source, consumed, siblings);
  if (shared.length) {
    const header = `/* reads: ${shared.join(', ')} */`;
    for (const [key, body] of found) found.set(key, `${header}\n${body}`);
  }
  return found;
}

/** Branch bodies of a `switch (label) { case 'a': { ... } }`, which `runBrowserAction` uses. */
function switchChain(source: string, label: string, siblings?: Map<string, string>): Map<string, string> {
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

  const shared = gapReads(body, consumed, siblings);
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

/**
 * Index a `run<X>Tool(name, input)` dispatcher so each tool resolves to its own branch.
 *
 * Both `runBrowserTool` and `runMediaTool` dispatch on the tool name with an `if` chain, which makes
 * a tool's branch knowable from the code rather than guessable from the schema. Without this, all 15
 * media tools resolved to the whole of `runMediaTool` and every one of them advertised the union of
 * all fifteen - `runMediaTool` reads `selector` somewhere, so `pro_fetch_favicon_fetch` claimed it
 * too.
 */
function nameDispatcher(moduleFile: string, functionName: string, toolPrefix: string): Map<string, string> {
  const index = new Map<string, string>();
  const source = coreModules.get(moduleFile);
  if (!source?.includes(functionName)) return index;

  const region = source.slice(source.indexOf(`export async function ${functionName}`));
  const shared = preamble(region);
  const siblings = functionsIn(source);
  for (const [name, body] of ifChain(region, 'name', siblings)) {
    index.set(`${toolPrefix}${name}`, withHelpers(shared + '\n' + body, siblings, 2, uniqueCoreFunctions));
  }
  return index;
}

const browserByName = nameDispatcher('browser-tools.ts', 'runBrowserTool', 'pro_browser_');
const mediaByName = nameDispatcher('media-tools.ts', 'runMediaTool', 'pro_fetch_');

/** Per-action source for `runBrowserAction`, keyed by action value. */
const browserByAction = new Map<string, string>();
const browserToolAt = coreModules.get('browser-tools.ts') ?? '';
if (browserToolAt.includes('runBrowserAction')) {
  const region = browserToolAt.slice(browserToolAt.indexOf('export async function runBrowserAction'));
  const shared = preamble(region);
  const siblings = functionsIn(browserToolAt);
  for (const [action, body] of switchChain(region, 'action', siblings)) {
    browserByAction.set(action, withHelpers(shared + '\n' + body, siblings, 2, uniqueCoreFunctions));
  }
}

/** Which action value a tool injects, read from `runBrowserAction({ ...input, action: 'x' })`. */
const actionByTool = new Map<string, string>();
for (const [name, source] of fileByToolName) {
  const injected = /runBrowserAction\(\s*\{[\s\S]*?action:\s*'([a-z_]+)'/.exec(source);
  if (injected) actionByTool.set(name, injected[1]);
}

/** The index of the `)` that closes the `(` at `openParen`, or the end of the text if unbalanced. */
function matchingParen(text: string, openParen: number): number {
  let depth = 1;
  let quote: string | undefined;
  for (let index = openParen + 1; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === '\\') {
        index += 1;
        continue;
      }
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

/**
 * Whether `input` appears as an argument of the call whose `(` sits at `openParen`.
 *
 * Walks the argument list tracking bracket depth, ignoring brackets inside string and template
 * literals, and reports whether the bare word `input` was found at depth 1 - that is, directly inside
 * the call rather than inside an object literal or an array passed to it.
 */
function hasTopLevelInputArgument(text: string, openParen: number): boolean {
  let depth = 1;
  let quote: string | undefined;
  for (let index = openParen + 1; index < text.length && depth > 0; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === '\\') {
        index += 1;
        continue;
      }
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') {
      depth += 1;
      continue;
    }
    if (character === ')' || character === ']' || character === '}') {
      depth -= 1;
      continue;
    }
    if (depth === 1 && /[A-Za-z0-9_]/.test(character ?? '')) {
      // Read the whole identifier so `inputRef` or `inputUrl` cannot be mistaken for `input`.
      let end = index;
      while (end < text.length && /[A-Za-z0-9_$]/.test(text[end] ?? '')) end += 1;
      if (text.slice(index, end) === 'input') return true;
      index = end - 1;
    }
  }
  return false;
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
    if (branch) return branch;
  }

  // Dispatchers that switch on the tool name answer before the tool file is consulted: their branch
  // is what the tool actually runs, while the file only says which dispatcher to call.
  const dispatched = browserByName.get(toolName) ?? mediaByName.get(toolName);
  if (dispatched) return dispatched;

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

    // A handler that is nothing but a delegation: `return helper(input, ...)` and nothing else.
    //
    // Three conditions, and each one was added because its absence was measured:
    //
    //   1. `input` must be an *argument*, not a key. Matching the bare word inside the parentheses read
    //      `return jsonBlock('X', { input: q })` as a delegation to `jsonBlock` and handed the audit the
    //      shared formatter's body instead of the tool's code. Bracket depth separates `f(input, x)` from
    //      `f(title, { input: x })`.
    //   2. The `return` must be the *only* statement. A handler that does work and then returns a block
    //      is not a delegation, and replacing its source with the helper's hides its own reads. Without
    //      this, 60 tools that legitimately compute something before formatting lost their source.
    //   3. The call may span lines, because a real delegation with object arguments does. The original
    //      pattern could not match those at all, because `[^)]*` cannot cross a closing parenthesis.
    const call = /^\s*return\s+(?:await\s+)?([A-Za-z0-9_]+)\s*\(/m.exec(body);
    if (!call) return withHelpers(body, local, 2, uniqueCoreFunctions);

    const openParen = call.index + call[0].length - 1;
    const closeParen = matchingParen(body, openParen);
    const onlyStatement = body.slice(0, call.index).trim() === '' && body.slice(closeParen + 1).trim() === '';

    if (onlyStatement && hasTopLevelInputArgument(body, openParen)) {
      for (const [file, functions] of coreIndex) {
        const target = functions.get(call[1]);
        if (target) return withHelpers(target, functions, 2, uniqueCoreFunctions);
      }
    }
    return withHelpers(body, local, 2, uniqueCoreFunctions);
  }

  const runner = SPEC_RUNNERS[category];
  if (runner) {
    const body = maxPlatform.get(runner);
    if (body) return withHelpers(body, maxPlatform);
  }
  return undefined;
}

export const resolvedToolCount = fileByToolName.size;
