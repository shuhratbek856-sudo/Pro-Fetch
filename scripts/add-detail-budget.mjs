/**
 * Ensure every composite exposes the `detail` budget knob.
 *
 * The first pass anchored on `required: [...]`, which misses tools whose schema ends without one
 * (`fetch_ingest`, `research_deep`) and tools that declare several tools per file. This pass
 * anchors on `properties: {`, which every `defineTool` schema has exactly once, so it is reliable
 * regardless of how the schema is otherwise shaped.
 */
import { readFile, writeFile } from 'node:fs/promises';

const DETAIL = "detail: { type: 'string', enum: ['summary', 'full'], description: 'Natija hajmi: summary yoki full' },";
const TARGETS = [
  'src/tools/extract/audit_page.ts',
  'src/tools/github/repo_audit.ts',
  'src/tools/http/fetch_ingest.ts',
  'src/tools/research/research_deep.ts',
  'src/tools/crawl/composites.ts',
  'src/tools/admin/capability_call.ts',
  'src/tools/admin/capability_map.ts',
];

let added = 0;
for (const file of TARGETS) {
  let text = await readFile(file, 'utf8');

  // Insert right after each `properties: {` that is not already followed by a detail entry.
  const before = text;
  let hits = 0;
  text = text.replace(/(\n(\s*)properties: \{\n)/g, (match, whole, indent) => {
    hits++;
    return `${whole}${indent}  ${DETAIL}\n`;
  });

  if (text !== before) {
    await writeFile(file, text, 'utf8');
    added += hits;
    console.log(`${file}: added ${hits}`);
  }
}
console.log(`\n${added} detail property/properties added`);
