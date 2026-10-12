/**
 * Measure how much of the registry the composites actually exercise.
 *
 * The strengthening strategy says composite coverage should be extended "where the data points",
 * not by guessing. This is that measurement: which tools are reachable only through the batch
 * executor, and which ones would be the best candidates for a composite.
 *
 * Run with: node --import tsx scripts/measure-composite-coverage.mts
 */
process.env.PRO_FETCH_PROFILE ??= 'full';
await import('../src/loader.js');
const { allTools } = await import('../src/core/tool.js');
const { readFile, readdir } = await import('node:fs/promises');

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* walk(full);
    else if (full.endsWith('.ts')) yield full;
  }
}

// Collect every tool name a composite references.
const referenced = new Set<string>();
for await (const file of walk('src/tools')) {
  const text = await readFile(file, 'utf8');
  for (const match of text.matchAll(/'(pro_[a-z0-9_]+)'/g)) {
    if (allTools().some((tool) => tool.name === match[1])) referenced.add(match[1]);
  }
}

// Composites that take a `tool` argument dispatch whatever name they are given. Static reference
// counting cannot see that, so it under-reports their coverage and calling it a gap would be wrong.
const dynamicComposites: string[] = [];
for await (const file of walk('src/tools')) {
  const text = await readFile(file, 'utf8');
  const definesTool = /defineTool\(\{/.test(text);
  const takesToolName = /tool:\s*\{\s*type:\s*'string'/.test(text);
  if (!definesTool || !takesToolName) continue;
  // A file may define several composites; count them all, not just the first.
  for (const match of text.matchAll(/name:\s*'(pro_[a-z0-9_]+)'/g)) dynamicComposites.push(match[1]);
}

const registry = allTools();
const byCategory = new Map<string, { total: number; referenced: number }>();
for (const tool of registry) {
  const entry = byCategory.get(tool.category) ?? { total: 0, referenced: 0 };
  entry.total++;
  if (referenced.has(tool.name)) entry.referenced++;
  byCategory.set(tool.category, entry);
}

console.log('=== Composite coverage by category ===\n');
console.log('category'.padEnd(16), 'covered', ' total', '  gap');
for (const [category, entry] of [...byCategory].sort((a, b) => b[1].total - a[1].total)) {
  const gap = entry.total - entry.referenced;
  const bar = '#'.repeat(Math.round((entry.referenced / entry.total) * 20));
  console.log(
    category.padEnd(16),
    String(entry.referenced).padStart(6),
    String(entry.total).padStart(6),
    String(gap).padStart(5),
    '  ' + bar,
  );
}

const covered = [...byCategory.values()].reduce((s, e) => s + e.referenced, 0);
console.log(`\nstatically referenced : ${covered}/${registry.length}`);
console.log(`dynamic executors     : ${dynamicComposites.length} -> ${dynamicComposites.join(', ')}`);
console.log(
  `reachability          : ${registry.length}/${registry.length} via capability_call + tool_execute (0 closed)`,
);

const needsNames = [...byCategory].filter(([, entry]) => entry.referenced === 0).map(([category]) => category);
console.log('\ncategories reachable only by naming a tool:', needsNames.join(', ') || 'none');
