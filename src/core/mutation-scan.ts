/**
 * Finds the tools whose own handler reaches a write sink.
 *
 * ## Why this exists as its own module
 *
 * `scripts/generate-mutation-sinks.mts` writes `mutation-sinks.generated.ts`, and
 * `tests/mutation-classification.test.ts` has to recompute the same set to notice drift. When each did
 * its own scan they used different sources - the generator read the handler body out of the file, the
 * test went through `resolveToolSource` - and disagreed by 162 tools. One of them was wrong, and the
 * wrong one was in the test, which is the more expensive direction to be wrong in.
 *
 * So the scan lives here, once, and both callers use it.
 *
 * ## Why the *own* body and not `resolveToolSource`
 *
 * `resolveToolSource` returns the tool's handler body **plus the shared core helpers the handler calls**.
 * That is correct for its purpose - the schema audit needs to see `view(input)`'s definition - and wrong
 * for this one. Appending the shared HTTP client to `pro_fetch_fetch_url` made a plain fetcher look like
 * a writer, because the client contains `method: 'POST'`. Measured: 162 such false positives against 13
 * real ones.
 *
 * Over-inclusion would be harmless for a security *rule* and misleading for an MCP `readOnlyHint`, so the
 * narrower source is the one used. What it misses is code reached through a helper, which is why the
 * enforcement does not rely on this at all: `read-only-guard.ts` asks at the sink.
 */

import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';

/** Sinks that change state, with the label recorded in the generated table. */
export const WRITE_SINKS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\bcache\.(?:put|delete|clear|tune)\s*\(/, label: 'cache' },
  {
    pattern:
      /\b(?:writeFileSync|appendFileSync|createWriteStream|mkdirSync|rmSync|unlinkSync|renameSync|copyFileSync)\s*\(/,
    label: 'fs',
  },
  {
    // The `node:fs/promises` sinks, which the pattern above cannot see because it looks for the `Sync`
    // suffix. Measured: with only the synchronous patterns, `pro_zip_extract`, `pro_pdf_split` and
    // `pro_fetch_pdf_split_pages` were all classified read-only while writing files, and under
    // `PRO_FETCH_READ_ONLY=true` `pro_zip_extract` completed with `isError: false` and a file on disk.
    //
    // The lookbehind keeps `writeFileSync` and `appendFileSync` out of this entry rather than relying on
    // the synchronous entry running first, so adding a sync sink cannot be silently double-counted.
    pattern:
      /(?<!writeFileSync)(?<!appendFileSync)(?<!createWriteStreamSync)\b(?:writeFile|appendFile|mkdir|rm|unlink|rename|copyFile|createWriteStream|truncate|chmod|chown)\s*\(/,
    label: 'fs-async',
  },
  { pattern: /\.saveAs\s*\(|\.screenshot\s*\(|\.pdf\s*\(/, label: 'browser-write' },
  { pattern: /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i, label: 'http-write' },
  {
    // A handler that calls the write guard is declaring that it writes.
    //
    // This is the general form of the rule, and it is why the list does not need an entry per
    // filesystem call: a tool that reaches a sink through a module helper cannot be seen by reading its
    // own body, but it can still say so. Measured: `pro_pdf_split` writes through `pdfSplit`'s helper,
    // so the `writeFile` pattern never matched it and it stayed classified read-only - while the guard
    // inside that very handler refused the write. The annotation and the enforcement disagreed about the
    // same function.
    pattern: /\bassertWritable\s*\(/,
    label: 'declared-write',
  },
  {
    // Asking for an output directory is asking to write into it.
    //
    // `outputDir()` is the single funnel every producing tool passes through, and it creates the
    // directory as a side effect. Measured: 17 tools reach it, and all 17 were classified read-only
    // while writing files - including `pro_pdf_merge`, `pro_image_convert` and `pro_image_watermark`,
    // none of which has a sink in its own body because each one reaches `writeFile` through a helper.
    //
    // Reading the handler is not enough for these, which is the point: the classification follows the
    // declaration, and the declaration is now at the funnel where the check lives too.
    pattern: /\boutputDir\s*\(/,
    label: 'output-dir',
  },
  {
    // A wrapper that fills in its own `action` is asking for that action.
    //
    // Measured: 24 browser tools do this - `browser_download` sets `action: 'download'` itself,
    // `browser_press_key` sets `press`, `browser_dialog` sets `handle_dialog`. The central gate reads
    // `input.action`, which these wrappers never supply from outside, so read-only mode could not see
    // which behaviour ran. The annotation has the same blind spot: `pro_browser_browser_download` was
    // read-only, and the file it writes went through a sink the policy engine never inspected.
    //
    // Only the values in `MUTATING_ACTIONS` matter downstream; listing all of them keeps the generated
    // table honest about what the handler does rather than what the caller can reach.
    pattern: /\baction:\s*'[a-z_]+'/,
    label: 'dispatched-action',
  },
];

/**
 * Extract the action value a wrapper injects, if any.
 *
 * Matches `action: 'download'` or `action: "download"` in the handler body. Returns the value or null.
 */
function injectedAction(body: string): string | null {
  const match = /\baction:\s*'([a-z_]+)'/.exec(body) ?? /\baction:\s*"([a-z_]+)"/.exec(body);
  return match ? match[1] : null;
}

/**
 * The text of each tool's own `async handler` body, located by brace matching.
 *
 * Brace matching rather than a regex over the whole file, because a handler can contain any string
 * literal - including one with an unbalanced brace - and a regex would stop at the wrong place.
 *
 * ## Comments are skipped, because not skipping them loses tools silently
 *
 * The first version treated every quote character as a string delimiter, wherever it appeared. A comment
 * containing an apostrophe - "the tool's name" - opened a string that never closed, so the brace depth
 * never returned to zero and the tool was dropped from the map entirely.
 *
 * Measured: `pro_pdf_split` became invisible because of a sentence in a comment about `pdf_split`. It
 * was not reported as a failure, it simply stopped being classified, and the classification table then
 * said it was read-only while the guard inside its own handler refused the write. A scanner that goes
 * quiet on the file it cannot read is worse than one that errors.
 *
 * So `/`, `*`, and the delimiters inside them are skipped, and `missingBodies` reports every tool whose
 * body could not be located so the gap is a number rather than an absence.
 */
export function ownHandlerBodies(root = 'src'): Map<string, string> {
  const bodies = new Map<string, string>();
  for (const file of globSync(path.join(root, '**/*.ts'))) {
    const text = readFileSync(file, 'utf8');
    // Every tool in the file, not the first one. The scan used to take the first `name: 'pro_...'`
    // match per file and stop, which was invisible while categories lived in one tool per file and
    // then silently dropped 40 of 474: sql 11, qr 9, encoding 9, schema 6, llm 5 - every tool in a
    // multi-tool file except the first was never classified, and nothing said so, because the file
    // *had* been read. Missing is not unreadable; it was quiet.
    const names = [...text.matchAll(/name:\s*'(pro_[a-z0-9_]+)'/g)];
    names.forEach((nameMatch, at) => {
      const searchEnd = at + 1 < names.length ? (names[at + 1] as RegExpMatchArray).index! : text.length;
      // A registration that carries a name but no own `async handler(` - the SPECS-style `add(...)`
      // packs - cannot reach a sink through code this scanner subsets, and it is not a body the
      // scanner failed to read. Bounding the search to before the next registration keeps a
      // handler-less entry from borrowing the next tool's handler.
      const within = text.slice(nameMatch.index, searchEnd);
      const handlerOffset = within.indexOf('async handler(');
      if (handlerOffset < 0) return;
      const handlerAt = nameMatch.index + handlerOffset;
      const open = text.indexOf('{', handlerAt);
      if (open < 0 || open >= searchEnd) {
        unreadable.push(nameMatch[1]);
        return;
      }

      let depth = 0;
      let quote: string | undefined;
      let lastSignificant = '';
      let end = -1;
      for (let index = open; index < text.length; index += 1) {
        const character = text[index] as string;
        const next = text[index + 1];

        // Line comment. A newline ends it, and an escaped newline continues it.
        if (quote === undefined && character === '/' && next === '/') {
          while (index < text.length && text[index] !== '\n') index += 1;
          continue;
        }
        // Block comment.
        if (quote === undefined && character === '/' && next === '*') {
          const close = text.indexOf('*/', index + 2);
          if (close < 0) break;
          index = close + 1;
          continue;
        }

        // A regular expression literal, which may contain a quote character.
        //
        // The scanner used to treat every quote as a string delimiter wherever it appeared, and a
        // regex like `/[\r\n"]/` therefore opened a string that never closed. Measured: it cost
        // `pro_fetch_post_multipart` its whole body - a tool that POSTs a multipart body and was
        // consequently absent from the mutation table, so its `readOnlyHint` said read-only while it
        // wrote to a remote server. `pro_encode_html_entity` was lost the same way.
        //
        // A slash is a regex rather than a division when the last significant character cannot end an
        // expression; the character classes below are the usual set.
        if (quote === undefined && character === '/') {
          const startsRegex = lastSignificant === '' || '(,=:[!&|?{};+-*%^~<>'.includes(lastSignificant);
          if (!startsRegex) {
            lastSignificant = '/';
            continue;
          }
          index += 1;
          let inCharacterClass = false;
          while (index < text.length) {
            const inner = text[index] as string;
            if (inner === '\\') {
              index += 2;
              continue;
            }
            if (inner === '[') inCharacterClass = true;
            else if (inner === ']') inCharacterClass = false;
            else if (inner === '/' && !inCharacterClass) break;
            else if (inner === '\n') break;
            index += 1;
          }
          lastSignificant = '/';
          continue;
        }

        if (quote) {
          if (character === '\\') {
            index += 1;
            continue;
          }
          if (character === quote) {
            quote = undefined;
            lastSignificant = character;
          }
          continue;
        }
        if (character === '"' || character === "'" || character === '`') {
          quote = character;
          continue;
        }
        if (!/\s/.test(character)) lastSignificant = character;
        if (character === '{') depth += 1;
        else if (character === '}') {
          depth -= 1;
          if (depth === 0) {
            end = index;
            break;
          }
        }
      }
      if (end > 0 && !bodies.has(nameMatch[1])) {
        bodies.set(nameMatch[1], text.slice(open + 1, end));
      } else if (end <= 0) {
        // Recorded rather than skipped. A tool the scanner cannot read is a tool it cannot classify, and
        // saying nothing about it is how `pro_pdf_split` ended up labelled read-only while refusing to
        // write.
        unreadable.push(nameMatch[1]);
      }
    });
  }
  return bodies;
}

/**
 * Tools whose handler body could not be located.
 *
 * Filled by the last `ownHandlerBodies` call. A module-level value is a compromise - it is only
 * meaningful immediately after a scan - and the alternative, threading it through the return type,
 * changes the signature the generator and the drift test both call. `scanSinkReachingTools` reports it
 * either way, which is the part that matters: the gap is visible.
 */
const unreadable: string[] = [];

export function toolsWithUnreadableBodies(): readonly string[] {
  return unreadable;
}

export interface SinkEntry {
  name: string;
  sinks: string[];
}

/**
 * Every tool that reaches a write sink and is not already classified as a mutation.
 *
 * `alreadyMutating` is passed in rather than imported, because `tool-classification.ts` imports the
 * generated table this produces and importing it back would be a cycle.
 */
export function scanSinkReachingTools(
  alreadyMutating: (name: string) => boolean,
  mutatingActions: ReadonlySet<string>,
): {
  entries: SinkEntry[];
  missingBodies: string[];
} {
  const bodies = ownHandlerBodies();
  const entries: SinkEntry[] = [];
  const missingBodies: string[] = [...unreadable];
  for (const [name, body] of bodies) {
    if (alreadyMutating(name)) continue;
    const sinks = WRITE_SINKS.filter((sink) => sink.pattern.test(body)).map((sink) => sink.label);
    // A wrapper that injects a mutating action is a mutation tool, even if its own body has no sink.
    //
    // `browser_download` writes a file but its handler body only says `action: 'download'` - the write
    // happens inside `runBrowserAction`. So the sink scan cannot see it. But the action it dispatches
    // is in `MUTATING_ACTIONS`, which is the same list the policy gate consults. Checking the injected
    // action here keeps the annotation and the enforcement in agreement.
    //
    // Read-only actions like `get_html` are NOT in `MUTATING_ACTIONS`, so `browser_get_html` stays
    // read-only. Without this distinction, every wrapper would be flagged as a mutation and read-only
    // mode would block all browser browsing, including pure reads.
    const action = injectedAction(body);
    if (action && mutatingActions.has(action)) sinks.push('dispatched-mutating-action');
    if (sinks.length > 0) entries.push({ name, sinks });
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  missingBodies.sort();
  return { entries, missingBodies };
}

/** The table body as text, so the generator and the test render it identically. */
export function renderTable(entries: SinkEntry[]): string {
  const lines = [
    '/* eslint-disable */',
    '/**',
    ' * GENERATED by scripts/generate-mutation-sinks.mts - do not edit.',
    ' *',
    ' * Tools whose own handler reaches a write sink while `isMutationTool` says otherwise by name. Keeping',
    ' * them here is what stops `readOnlyHint: true` from being a lie to the model: the annotation and the',
    ' * enforced policy were computed from different rules and disagreed for 13 of 652 tools.',
    ' *',
    ' * The *enforcement* does not depend on this file. `read-only-guard.ts` asks at each write sink, so a',
    ' * tool added tomorrow is covered by writing to a sink rather than by updating a list.',
    ' *',
    ' * Regenerate with `npm run gen:mutation-sinks`. The drift test fails if this file stops matching the',
    ' * code, and both it and the generator read the same scanner in `mutation-scan.ts`.',
    ` * ${entries.length} tools.`,
    ' */',
    '',
    'export const SINK_REACHING_TOOLS: Readonly<Record<string, readonly string[]>> = {',
  ];
  for (const entry of entries) {
    lines.push(`  '${entry.name}': [${entry.sinks.map((sink) => `'${sink}'`).join(', ')}],`);
  }
  lines.push('};', '');
  return lines.join('\n');
}
