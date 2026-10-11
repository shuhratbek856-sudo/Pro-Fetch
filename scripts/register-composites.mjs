import { readFile, writeFile } from 'node:fs/promises';

/** [file, new import line, array entry line] */
const REGISTRATIONS = [
  ['src/tools/extract/index.ts', "import audit_page from './audit_page.js';", '  audit_page,'],
  ['src/tools/github/index.ts', "import repo_audit from './repo_audit_tool.js';", '  repo_audit,'],
  ['src/tools/github/index.ts', "import pr_review from './pr_review_tool.js';", '  pr_review,'],
  ['src/tools/http/index.ts', "import fetch_ingest from './fetch_ingest.js';", '  fetch_ingest,'],
  ['src/tools/crawl/index.ts', "import page_diff from './page_diff.js';", '  page_diff,'],
  ['src/tools/crawl/index.ts', "import site_scan from './site_scan.js';", '  site_scan,'],
  ['src/tools/data/index.ts', "import data_pipeline from './data_pipeline.js';", '  data_pipeline,'],
];

let changed = 0;
for (const [file, importLine, entryLine] of REGISTRATIONS) {
  let text = await readFile(file, 'utf8');
  const name = importLine.match(/import (\w+) from/)[1];
  if (text.includes(importLine)) continue;

  // Insert the import after the last existing import.
  const lines = text.split('\n');
  let last = -1;
  for (let i = 0; i < lines.length; i++) if (/^import .*;$/.test(lines[i])) last = i;
  lines.splice(last + 1, 0, importLine);
  text = lines.join('\n');

  // Insert the entry at the head of the exported array.
  text = text.replace(/export default \[\s*\n/, (match) => `${match}  // Smart System composite\n${entryLine}\n`);

  await writeFile(file, text, 'utf8');
  changed++;
  console.log(`registered ${name} in ${file}`);
}
console.log(`\n${changed} registration(s) added`);
