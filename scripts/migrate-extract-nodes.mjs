// One-off migration: the extract handlers iterate cheerio selections with `(i, el: any)`. Cheerio
// ships `AnyNode` for exactly this, so the callback types become real and a changed cheerio API
// would be caught by `tsc` instead of failing at runtime.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('src/tools/extract');

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && full.endsWith('.ts')) yield full;
  }
}

let changed = 0;
for await (const file of walk(ROOT)) {
  const before = await readFile(file, 'utf8');
  if (!/el: any|\(el: any\)/.test(before)) continue;
  let after = before.replace(/\bel: any\b/g, 'el: AnyNode');

  // Add the cheerio type import if the file uses it and does not already import it.
  if (after.includes('AnyNode') && !/AnyNode[^\n]*from 'cheerio'/.test(after)) {
    const lines = after.split('\n');
    let last = -1;
    for (let i = 0; i < lines.length; i++) if (/^import .*;$/.test(lines[i])) last = i;
    lines.splice(last + 1, 0, "import type { AnyNode } from 'cheerio';");
    after = lines.join('\n');
  }
  await writeFile(file, after, 'utf8');
  changed++;
}
console.log(`typed ${changed} extract file(s)`);
