// Manifestni haqiqiy ro'yxatdan qayta o'lchab yangilash.
//
// Qo'lda raqam yozish — bu xuddi shu loyihada bir necha marta sodir bo'lgan xato. Bu skript
// registrni o'zi o'lchaydi va har bir qiymatni faqat o'lchovdan keyin yozadi.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Derived from this script's own location: the written-down path pointed at a directory that no longer
// exists, so the script could not run at all on the machine that holds the repository.
const here = path.dirname(fileURLToPath(import.meta.url));
const base = pathToFileURL(path.join(here, '..', 'src')).href + '/';

process.env.PRO_FETCH_PROFILE = 'full';
await import(base + 'env.js');
await import(base + 'loader.js');
const { allTools } = await import(base + 'core/tool.js');
const { SMART_TOOL_NAMES } = await import(base + 'core/profile.js');

const tools = allTools();
const manifest = JSON.parse(readFileSync('scripts/tool-counts.json', 'utf8'));

const counts = {};
for (const tool of tools) counts[tool.category] = (counts[tool.category] ?? 0) + 1;

const before = {
  total: manifest.total,
  categoryCount: manifest.categoryCount,
  full: manifest.profiles.full,
};

manifest.total = tools.length;
manifest.full = tools.length;
manifest.categoryCount = Object.keys(counts).length;
manifest.categories = Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
manifest.profiles.full = tools.length;
manifest.smartComposites = [...SMART_TOOL_NAMES];
manifest.profiles.smart = SMART_TOOL_NAMES.size;

writeFileSync('scripts/tool-counts.json', JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(`  total: ${before.total} -> ${manifest.total}`);
console.log(`  kategoriya: ${before.categoryCount} -> ${manifest.categoryCount}`);
console.log(`  smart: ${manifest.profiles.smart}`);
console.log(`  yangi kategoriyalar: ${Object.keys(counts).filter((c) => !before.categoryCount)}`);
const added = Object.entries(counts).filter(([category, count]) => {
  const previous = manifest.categories[category];
  return previous === undefined;
});
for (const [category, count] of added) console.log(`    + ${category}: ${count}`);
void before;
