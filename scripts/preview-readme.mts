// Render README.md the way GitHub does, so the layout can be looked at rather than guessed at.
//
// A design critique needs the rendered thing. Markdown source hides the problems that matter - how a
// table sits next to a heading, where the eye lands, how much of the fold is badges. The first
// version of this README was written without looking, and two things were wrong in ways the source
// did not show: a `<td width="50%">` grid that renders as a heavy bordered table, and six tables in
// a row that turn the page into a spreadsheet.
//
// Usage: node scripts/preview-readme.mts  ->  .preview/readme.html
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, '.preview');
await mkdir(outDir, { recursive: true });

const markedPath = path.join(outDir, 'marked.min.js');
let marked = await readFile(markedPath, 'utf8').catch(() => '');
if (!marked) {
  // Fetched rather than vendored: it is a build artefact, not source, and the directory is ignored.
  const response = await fetch('https://cdn.jsdelivr.net/npm/marked/marked.min.js');
  if (!response.ok) throw new Error(`could not fetch marked: HTTP ${response.status}`);
  marked = await response.text();
  await writeFile(markedPath, marked, 'utf8');
}

const markdown = await readFile(path.join(root, 'README.md'), 'utf8');
const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>README preview</title>
<style>
  :root {
    --fg: #1f2328; --muted: #59636e; --border: #d1d9e0; --bg: #ffffff;
    --accent: #0969da; --surface: #f6f8fa; --quote: #eaeef2;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  }
  .page { max-width: 1012px; margin: 0 auto; padding: 32px 40px 96px; }
  .markdown-body { font-size: 16px; }
  .markdown-body h1, .markdown-body h2 { border-bottom: 1px solid var(--border); padding-bottom: .3em; }
  h1 { font-size: 2em; margin: .67em 0 16px; font-weight: 600; }
  h2 { font-size: 1.5em; margin: 24px 0 16px; font-weight: 600; }
  h3 { font-size: 1.25em; margin: 24px 0 16px; font-weight: 600; }
  p, ul, ol, table, pre, details { margin: 0 0 16px; }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  img { vertical-align: middle; }
  code {
    font: 12.8px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    background: var(--quote); padding: .2em .4em; border-radius: 6px;
  }
  pre { background: var(--surface); border-radius: 6px; padding: 16px; overflow: auto; }
  pre code { background: none; padding: 0; font-size: 12.8px; line-height: 1.45; }
  table { border-collapse: collapse; display: block; width: max-content; max-width: 100%; overflow: auto; }
  th, td { border: 1px solid var(--border); padding: 6px 13px; text-align: left; }
  th { background: var(--surface); font-weight: 600; }
  tr:nth-child(2n) td { background: var(--surface); }
  blockquote { border-left: .25em solid var(--border); padding: 0 1em; color: var(--muted); margin: 0 0 16px; }
  hr { height: .25em; background: var(--border); border: 0; margin: 24px 0; }
  summary { cursor: pointer; }
  img[align="center"], div[align="center"] { text-align: center; }
  table[align="center"] { margin: 0 auto; }
</style></head>
<body><div class="page"><div class="markdown-body" id="out"></div></div>
<script>${marked}</script>
<script>
  document.getElementById('out').innerHTML = marked.parse(${JSON.stringify(markdown)});
</script>
</body></html>`;

const file = path.join(outDir, 'readme.html');
await writeFile(file, page, 'utf8');
console.log('wrote ' + file);
