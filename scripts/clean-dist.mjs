/**
 * Removes `dist` before a build.
 *
 * `tsc` compiles what is there and leaves everything else alone, so a file whose source was renamed or
 * deleted survives every subsequent build and ships. Measured on this repository: four files in `dist`
 * had no corresponding `.ts` - `tools/document/tools.js` at 32 KB, `tools/git/workspace_ops.js` at
 * 6 KB, and two empty ones - and package.json publishes every `.js` under `dist`, so all four would
 * have gone into the tarball.
 *
 * (The pattern is written out in words rather than as a glob because a literal `*` followed by a slash
 * closes a block comment. That is not hypothetical: it is what this file contained the first time.)
 *
 * A clean build is the fix; `verify-package.mjs` is the guard that says so if anyone skips this step.
 */

import { rmSync } from 'node:fs';

const target = 'dist';

try {
  rmSync(target, { recursive: true, force: true });
  console.log('  ' + target + ' tozalandi');
} catch (error) {
  // A directory held open by a running dev server is the usual cause. Not fatal: the build still
  // works, and verify-package will report the stale files rather than let them ship silently.
  console.warn('  ' + target + ' ni tozalab bo‘lmadi: ' + String(error && error.message ? error.message : error));
  console.warn('  Build davom etadi; eskirgan fayllar verify-package da ko‘rinadi.');
}
