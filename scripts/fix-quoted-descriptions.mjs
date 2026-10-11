/**
 * Repair descriptions that embed an apostrophe inside a single-quoted TypeScript string.
 *
 * Uzbek text routinely writes possessives as `URL'i`, which closes the string early and produces
 * a wall of parser errors far from the real cause. Rewrite those to double quotes, which keeps the
 * reading natural without escaping.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('src/tools');
const FILES = [
  'crawl/composites.ts',
  'research/research_deep.ts',
  'extract/audit_page.ts',
  'github/repo_audit.ts',
  'http/fetch_ingest.ts',
  'admin/capability_map.ts',
  'admin/capability_call.ts',
];

/** `description: '....'` where the body contains an apostrophe. */
const PATTERN = /(description:\s*)'((?:[^'\\\n]|\\.)*)'/g;

let total = 0;
for (const relative of FILES) {
  const file = path.join(ROOT, relative);
  let text = await readFile(file, 'utf8');
  let fixed = 0;

  // Only touch strings that genuinely contain a stray apostrophe, not balanced quotes.
  text = text.replace(PATTERN, (match, prefix, body) => {
    if (!body.includes("'")) return match;
    if (body.includes("\\'")) return match.replace(/\\'/g, "'");
    fixed++;
    return `${prefix}"${body.replace(/"/g, '\\"')}"`;
  });

  if (fixed > 0) {
    await writeFile(file, text, 'utf8');
    console.log(`fixed ${fixed} description(s) in ${relative}`);
    total += fixed;
  }
}
console.log(`\n${total} description(s) repaired`);
