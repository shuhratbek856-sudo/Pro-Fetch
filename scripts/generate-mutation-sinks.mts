/**
 * Regenerates `src/core/mutation-sinks.generated.ts`.
 *
 * Run with: npm run gen:mutation-sinks
 *
 * The scan itself lives in `src/core/mutation-scan.ts` and is shared with
 * `tests/security-boundaries.test.ts`, so the generator and the test that guards this file cannot drift
 * apart. They did once: the generator read each tool's own handler body out of its file, the test went
 * through `resolveToolSource` - which appends shared helpers - and the two disagreed by 162 tools.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const base = 'file:///C:/Users/user/Downloads/pro-fetch/pro-fetch-mcp/src/';
process.env.PRO_FETCH_PROFILE = 'full';
await import(base + 'env.js');
await import(base + 'loader.js');
const { allTools } = await import(base + 'core/tool.js');
const { isMutationToolByName } = await import(base + 'core/tool-classification.js');
const { MUTATING_ACTIONS } = await import(base + 'core/tool-classification.js');
const { scanSinkReachingTools, renderTable } = await import(base + 'core/mutation-scan.js');

// Bootstrap: `isMutationToolByName`, not `isMutationTool`. The latter already reads the generated table
// this script is about to write, so asking it would make the scan see nothing to do and overwrite 13
// tools with 0. Measured: that is exactly what happened the first time.
const { entries, missingBodies } = scanSinkReachingTools(isMutationToolByName, MUTATING_ACTIONS);
const known = new Set(allTools().map((tool) => tool.name));
const unknown = entries.filter((entry) => !known.has(entry.name));

writeFileSync('src/core/mutation-sinks.generated.ts', renderTable(entries), 'utf8');

console.log(`  yozuv sinkiga yetadigan tool: ${entries.length}`);
console.log(
  `  registryda yo'q bo'lgan nom: ${unknown.length}${unknown.length > 0 ? ' - ' + unknown.map((entry) => entry.name).join(', ') : ''}`,
);
// Reported because a tool the scanner cannot read is a tool it cannot classify, and silence about it is
// how `pro_pdf_split` ended up labelled read-only while its own handler refused to write. The count was
// always zero because nothing filled it; the brace matcher silently dropped unreadable tools instead.
console.log(`  handler tanasi topilmagan: ${missingBodies.length}`);
if (missingBodies.length > 0) {
  console.log(`    ${missingBodies.slice(0, 10).join(', ')}${missingBodies.length > 10 ? ' ...' : ''}`);
}
