// One-off migration: the GitHub handlers formatted API responses by mapping over untyped rows.
// Typing each row as `any` disabled checking, so a renamed or missing API field produced
// `undefined` in user-facing output instead of a type error. `JsonRow` keeps the direct
// property access working while making the element type explicit.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('src/tools/github');

/** A single JSON object with untyped fields, for reading API responses without a schema. */
export const JSON_ROW_TYPE = `type JsonRow = Record<string, unknown>;`;

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
  if (!/\(\w+: any\)/.test(before)) continue;

  let after = before.replace(/\((\w+): any\)/g, '($1: JsonRow)');

  // Declare the local type after the last import when the file needs it.
  if (!after.includes('type JsonRow =')) {
    const lines = after.split('\n');
    let last = -1;
    for (let i = 0; i < lines.length; i++) if (/^import .*;$/.test(lines[i])) last = i;
    lines.splice(last + 1, 0, JSON_ROW_TYPE);
    after = lines.join('\n');
  }
  await writeFile(file, after, 'utf8');
  changed++;
}
console.log(`typed ${changed} github file(s)`);
