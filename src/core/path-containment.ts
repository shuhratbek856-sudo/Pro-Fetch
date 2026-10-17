/**
 * Path containment for everything this server writes or reads.
 *
 * ## Why the checks moved next to the sinks
 *
 * `assertToolAllowed` contained two input fields by name: `output_path` and `storage_state_path`. Any
 * tool that wrote through a differently named property - and several did - bypassed it entirely:
 *
 *     src/tools/browser/browser_download.ts   save_path       (not checked)
 *     src/core/browser-tools.ts:452           download.saveAs(savePath)
 *     src/tools/browser/browser_upload_file.ts file_path      (no boundary at all)
 *
 * Checking by field name is the same mistake as classifying tools by name: it is a list to keep in step
 * with the code, and it fails open the moment something is renamed. The boundary that cannot be
 * bypassed is the one enforced at the moment of the write, which is why `assertWritablePath` exists and
 * why the writers call it themselves rather than trusting the policy engine to have seen their input.
 *
 * The policy engine still checks. Two independent checks on the same boundary is not redundancy to
 * remove: the policy check names the offending *argument*, and the sink check holds even when a writer is
 * called from somewhere the policy engine does not inspect.
 */

import path from 'node:path';
import { realpathSync } from 'node:fs';
import { assertWritable } from './read-only-guard.js';
import { outputRoot, writeBoundaryRoot } from './output-dir.js';

/** Raised when a path is outside its boundary, or when writing is not permitted at all. */
export class PathContainmentError extends Error {
  readonly code = 'PATH_NOT_CONTAINED';
  constructor(message: string) {
    super(message);
    this.name = 'PathContainmentError';
  }
}

/**
 * Resolve as the filesystem will, following symlinks on the deepest existing ancestor.
 *
 * A plain `path.resolve` does not follow links, so a symlink *inside* the sandbox pointing outside it
 * passes a containment check and then writes wherever it points. This is the same helper the policy
 * engine uses, kept here so the two cannot drift.
 */
export function realResolve(target: string): string {
  const resolved = path.resolve(target);
  let current = resolved;
  const tail: string[] = [];
  for (;;) {
    try {
      const real = realpathSync.native(current);
      return tail.length > 0 ? path.join(real, ...[...tail].reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return resolved;
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

/** The workspace: the tree a tool may read from and write into. Falls back to the working directory. */
export function workspaceRoot(): string {
  return path.resolve(process.env.PRO_FETCH_WORKSPACE?.trim() || process.cwd());
}

/**
 * Whether `candidate` is inside `root` after both are resolved the way the filesystem sees them.
 *
 * Compared with `path.relative` rather than a `startsWith` on the string, because
 * `C:\out-evil` starts with `C:\out` and is somewhere else entirely.
 */
export function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(realResolve(root), realResolve(candidate));
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function describeEscape(root: string, candidate: string, field: string): string {
  const resolved = realResolve(candidate);
  return (
    `${field} chegaradan tashqariga chiqmoqda: ${resolved}\n` +
    `Ruxsat etilgan papka: ${realResolve(root)}\n` +
    'Boshqa joyga yozish uchun PRO_FETCH_OUTPUT_ROOT ni sozlang yoki yo lni o‘zgartiring.'
  );
}

/**
 * The check every writer makes: is writing permitted at all, and is this path inside the boundary.
 *
 * `effect` names the operation in the message, so a caller learns what was refused rather than only
 * that something was.
 */
export function assertWritablePath(candidate: string, field: string, effect: string): void {
  assertWritable(effect);
  // `writeBoundaryRoot`, not `outputRoot`: the boundary for writes is the server's own area, which is the
  // cache root unless the operator narrowed it with `PRO_FETCH_OUTPUT_ROOT`. Using `outputRoot` here
  // refused `pro_gh_repo_full_clone`, which has always downloaded into the cache directory beside `out/`.
  const root = writeBoundaryRoot();
  if (!isInside(root, candidate)) {
    throw new PathContainmentError(describeEscape(root, candidate, field));
  }
}

/** The check every reader of a caller-supplied file makes. */
export function assertReadablePath(candidate: string, field: string, effect: string): void {
  const root = workspaceRoot();
  if (!isInside(root, candidate)) {
    throw new PathContainmentError(describeEscape(root, candidate, field));
  }
}

/**
 * Contained *or* already inside the output root.
 *
 * Used where reading from the workspace and writing into the output tree are both legitimate, such as a
 * conversion that takes a source and produces a file.
 */
export function assertReadableOrOutputPath(candidate: string, field: string, effect: string): void {
  if (isInside(workspaceRoot(), candidate) || isInside(outputRoot(), candidate)) return;
  throw new PathContainmentError(
    `${field} nafaqat ish papkasida, nafaqat chiqish papkasida emas: ${realResolve(candidate)}\n` +
      `Ish papkasi: ${realResolve(workspaceRoot())}\n` +
      `Chiqish papkasi: ${realResolve(outputRoot())}`,
  );
}
