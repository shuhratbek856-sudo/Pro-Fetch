// Ensure every github handler that calls pathStr/pathNum/asRecordArray imports them.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('src/tools/github');

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && full.endsWith('.ts')) yield full;
  }
}

let changed = 0;
for await (const file of walk(ROOT)) {
  let text = await readFile(file, 'utf8');
  const body = text
    .split('\n')
    .filter((line) => !/^import /.test(line))
    .join('\n');
  const used = ['pathStr', 'pathNum', 'asRecordArray'].filter((helper) => new RegExp(`\\b${helper}\\(`).test(body));
  if (!used.length) continue;

  const importLine = /^import \{ ([^}]+) \} from '(\.\.\/\.\.\/core\/input\.js)';$/m.exec(text);
  if (importLine) {
    const names = importLine[1]
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    if (used.every((name) => names.includes(name))) continue;
    const merged = [...new Set([...names, ...used])].join(', ');
    text = text.replace(importLine[0], `import { ${merged} } from '${importLine[2]}';`);
  } else {
    const lines = text.split('\n');
    let last = -1;
    for (let i = 0; i < lines.length; i++) if (/^import .*;$/.test(lines[i])) last = i;
    lines.splice(last + 1, 0, `import { ${used.join(', ')} } from '../../core/input.js';`);
    text = lines.join('\n');
  }
  await writeFile(file, text, 'utf8');
  changed++;
}
console.log(`imported helpers in ${changed} file(s)`);
