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
];

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
    const nameMatch = /name:\s*'(pro_[a-z0-9_]+)'/.exec(text);
    if (!nameMatch) continue;
    const handlerAt = text.indexOf('async handler(', nameMatch.index);
    if (handlerAt < 0) continue;
    const open = text.indexOf('{', handlerAt);
    if (open < 0) continue;

    let depth = 0;
    let quote: string | undefined;
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
export function scanSinkReachingTools(alreadyMutating: (name: string) => boolean): {
  entries: SinkEntry[];
  missingBodies: string[];
} {
  const bodies = ownHandlerBodies();
  const entries: SinkEntry[] = [];
  const missingBodies: string[] = [...unreadable];
  for (const [name, body] of bodies) {
    if (alreadyMutating(name)) continue;
    const sinks = WRITE_SINKS.filter((sink) => sink.pattern.test(body)).map((sink) => sink.label);
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
