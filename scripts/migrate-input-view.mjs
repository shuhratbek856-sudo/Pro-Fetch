// One-off migration: replace the `const p = input as any;` alias with the typed `view(input)`
// helper and add the matching import. Kept in the repo so the change is auditable and repeatable.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('src');
const DRY = process.argv.includes('--dry');

/** Depth of the relative import from a file under `src/tools/<category>/<name>.ts` to `src/core`. */
function coreImportPath(file) {
  const depth = path.relative(ROOT, path.dirname(file)).split(path.sep).length;
  return '../'.repeat(depth) + 'core';
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && full.endsWith('.ts')) yield full;
  }
}

let changed = 0;
let skipped = 0;
for await (const file of walk(ROOT)) {
  const before = await readFile(file, 'utf8');
  if (!/const p = input as any;/.test(before)) {
    skipped++;
    continue;
  }
  let after = before.replace(/const p = input as any;/g, 'const p = view(input);');

  if (!/from '.*core\/input\.js'/.test(after)) {
    // Always add a dedicated import for `core/input`; never merge into another module.
    const importLine = `import { view } from '${coreImportPath(file)}/input.js';`;
    const lines = after.split('\n');
    let last = -1;
    for (let i = 0; i < lines.length; i++) if (/^import .*;$/.test(lines[i])) last = i;
    lines.splice(last + 1, 0, importLine);
    after = lines.join('\n');
  }
  changed++;
  if (!DRY) await writeFile(file, after, 'utf8');
}
console.log(`${DRY ? 'would update' : 'updated'} ${changed} file(s); ${skipped} already migrated`);
