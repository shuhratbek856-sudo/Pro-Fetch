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

export const OUTPUT_KINDS = ['img-out', 'pdf-out', 'bin-out', 'geo-out', 'zip-out'] as const;
export type OutputKind = (typeof OUTPUT_KINDS)[number];

// Imported here rather than above the module: `read-only-guard` has no imports of its own, so this
// cannot cycle, and keeping the guard free of dependencies is what lets `cache.ts` depend on it too.
import { assertWritable } from './read-only-guard.js';

function cacheRoot(): string {
  return process.env.PRO_FETCH_CACHE_DIR ?? '.pro-fetch-cache';
}

/**
 * A filesystem root is never a write boundary.
 *
 * Defence in depth, and it covers the operator as well as the model: accepting `C:\` or `/` turns any
 * path check against the boundary into a no-op, because *every* absolute path trivially stays inside a
 * root. Measured as reachable - `PRO_FETCH_CACHE_DIR=/` was accepted by a tool call and moved the
 * boundary with it. Both readers of the configured output root go through this check, because leaving it
 * on one of them is exactly how `outputRoot()` kept accepting a root after `writeBoundaryRoot()` had
 * learned to refuse one.
 */
function assertNotFilesystemRoot(root: string, variable: string, label: string): void {
  if (path.dirname(root) === root) {
    throw new Error(`${variable} a fayl tizimi ildizi bo‘lmaydi (${root}). ${label}`);
  }
}

/**
 * The root every generated file must stay inside.
 *
 * Resolved eagerly rather than at call time so a caller cannot move the boundary by assigning the
 * environment variable between the sandbox check and the write.
 */
export function outputRoot(): string {
  const configured = process.env.PRO_FETCH_OUTPUT_ROOT?.trim();
  if (configured && configured.length > 0) {
    const root = path.resolve(configured);
    // The same root check `writeBoundaryRoot` applies. Missing it here let a tool call accept
    // `PRO_FETCH_OUTPUT_ROOT=C:\` and place generated files one directory off the drive - the
    // sandbox checked against a boundary that accepted everything.
    assertNotFilesystemRoot(root, 'PRO_FETCH_OUTPUT_ROOT', 'Chiqish papkasi katalog bo‘lishi kerak.');
    return root;
  }
  return path.resolve(path.join(cacheRoot(), 'out'));
}

/**
 * The boundary a write must stay inside, which is not always `outputRoot()`.
 *
 * `outputRoot()` is where a *tool's produced artefact* belongs, and it is the right answer for the
 * converters, screenshots and PDFs. It is the wrong answer for a server writing its own working files:
 * `pro_gh_repo_full_clone` downloads into the cache directory, one level above `out/`, and always has.
 *
 * The first version of the sink-level check used `outputRoot()` unconditionally and broke that tool with
 *
 *     filePath chegaradan tashqariga chiqmoqda:
 *     C:\Users\user\.pro-fetch\cache\octocat-Hello-World-main.tar.gz
 *     Ruxsat etilgan papka: C:\Users\user\.pro-fetch\cache\out
 *
 * - a legitimate download refused because the boundary had been chosen too narrowly, not because the
 * path was dangerous. The mistake was in the boundary, so that is what changed.
 *
 * So: when the operator sets `PRO_FETCH_OUTPUT_ROOT`, that is the boundary, because setting it is a
 * decision. Otherwise it is the cache root, which contains both `out/` and the server's own working
 * files - still this server's private area, and still nowhere near the user's documents.
 */
export function writeBoundaryRoot(): string {
  const configured = process.env.PRO_FETCH_OUTPUT_ROOT?.trim();
  if (configured && configured.length > 0) {
    const root = path.resolve(configured);
    assertNotFilesystemRoot(root, 'PRO_FETCH_OUTPUT_ROOT', 'Chiqish chegarasi katalog bo‘lishi kerak.');
    return root;
  }
  const fallback = path.resolve(cacheRoot());
  assertNotFilesystemRoot(fallback, 'PRO_FETCH_CACHE_DIR', 'Kesh papkasi katalog bo‘lishi kerak.');
  return fallback;
}

/** A per-kind subdirectory of the output root, created on demand. */
export function outputDir(kind: OutputKind): string {
  // A per-kind output directory is only ever asked for in order to write something into it, and the
  // `mkdirSync` below is already a write whether or not a file ever lands there. So this is the place
  // read-only mode is enforced for every tool that produces output.
  //
  // Measured before this: `outputDir()` was the single funnel for 17 tools and none of them asked.
  // `pro_pdf_merge`, `pro_image_convert`, `pro_image_watermark` and 14 more were classified read-only
  // while writing files, and none of them had a guard of its own - each one reached `writeFile` through
  // a module helper, so the handler-by-handler scan could not see the write. Fixing that by adding a
  // guard to each handler would have been 17 edits that the next tool would forget. One funnel, one
  // check: a tool cannot produce output without passing through here.
  assertWritable('chiqish papkasini yaratish');
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
