import path from 'node:path';
import { mkdirSync } from 'node:fs';

/**
 * Where a tool may write its output.
 *
 * ## Why this exists
 *
 * The default used to be `process.env.PRO_FETCH_OUTPUT_ROOT ?? '.'`, which meant **the current working
 * directory**. Two consequences, both observed rather than reasoned about:
 *
 * Running the tools from the repository root left the results in the repository. Commits `277b276`,
 * `204b766`, `36b773e`, `2ea4fdd` and `90bf3e0` each added generated PNGs and PDFs to source control -
 * 78 images and 3 PDFs, 99 KB of build output tracked by git - because a test run wrote them next to
 * the package.json and `git add -A` swept them in.
 *
 * Worse, the sandbox in `security-policy.ts` only ran **when the variable was set**. Unset, no
 * containment applied at all and a tool could be pointed at any path the process could write. A guard
 * that exists only in the configuration where it is not needed is not a guard.
 *
 * ## The rule
 *
 * `PRO_FETCH_OUTPUT_ROOT` when it is set - that is the whole point of the variable. Otherwise a
 * directory under the cache root, which is already git-ignored, so nothing a tool produces can land in a
 * working tree by accident. Both the writers and the sandbox read it from here, so the two can never
 * disagree about where output belongs.
 */

export const OUTPUT_KINDS = ['img-out', 'pdf-out', 'bin-out', 'geo-out'] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

function cacheRoot(): string {
  return process.env.PRO_FETCH_CACHE_DIR ?? '.pro-fetch-cache';
}

/**
 * The root every generated file must stay inside.
 *
 * Resolved eagerly rather than at call time so a caller cannot move the boundary by assigning the
 * environment variable between the sandbox check and the write.
 */
export function outputRoot(): string {
  const configured = process.env.PRO_FETCH_OUTPUT_ROOT?.trim();
  return path.resolve(configured && configured.length > 0 ? configured : path.join(cacheRoot(), 'out'));
}

/** A per-kind subdirectory of the output root, created on demand. */
export function outputDir(kind: OutputKind): string {
  const directory = path.join(outputRoot(), kind);
  mkdirSync(directory, { recursive: true });
  return directory;
}

/**
 * A generated file name inside `kind`.
 *
 * Random rather than derived from the input: a caller-supplied name is a path traversal waiting to
 * happen, and a name derived from the source file collides the moment the same document is converted
 * twice.
 */
export function outputFileName(kind: OutputKind, extension: string, suffix = ''): string {
  const random = globalThis.crypto.randomUUID();
  const safeExtension = extension.replace(/^\./, '').replace(/[^a-z0-9]/gi, '') || 'bin';
  const tail = suffix ? `-${suffix.replace(/[^a-z0-9._-]/gi, '_').slice(0, 40)}` : '';
  return path.join(outputDir(kind), `${kind.slice(0, 3)}-${random}${tail}.${safeExtension}`);
}
