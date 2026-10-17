// Dump the authoritative tool catalog (all profiles) to docs/TOOL_CATALOG.md.
// Boots the real registry the same way verify:registry does, so every name and
// description is exactly what the server exposes — nothing hand-written.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

process.env.PRO_FETCH_PROFILE = 'full';
await import('../src/loader.js');
const { allTools } = await import('../src/core/tool.js');
const { listTools } = await import('../src/router.js');

type Tool = { name: string; category: string; description: string };
const tools = allTools() as Tool[];

const members = new Set<string>([
  ...listTools('minimal').map((t: Tool) => t.name),
  ...listTools('standard').map((t: Tool) => t.name),
]);
const smartNames = new Set<string>(listTools('smart').map((t: Tool) => t.name));

// One-line human label per category, for the summary table.
const LABELS: Record<string, string> = {
  admin: 'Smart System meta-tools, registry/config, diagnostics, batching',
  apitest: 'REST/GraphQL/OpenAPI/SOAP: fetch, parse, validate, mock, diff, probe',
  archive: 'Wayback + Internet Archive, local cache store, snapshots & diffs',
  auth: 'Sessions, cookies, basic/bearer fetch, OAuth device flow, scope audit',
  binary: 'Parquet / Arrow / Avro / Protobuf readers (schema + rows)',
  browser: 'Playwright automation: navigate, click, fill, extract, tabs, cookies',
  chess: 'FEN parse/validate, legal moves, perft, square & position analysis',
  codehost: 'GitLab / Gitea / Forgejo / Bitbucket repos, issues, PRs, releases',
  collaboration: 'Slack / Jira / Linear / Notion issues, comments, transitions',
  color: 'Color conversion & contrast helpers',
  convert: 'Format conversion: HTML/MD, CSV/JSON, image, units, encodings, etc.',
  crawl: 'Site crawl, sitemap/robots, link graph, site explain',
  data: 'Load, profile, query, join, transform datasets (tables)',
  database: 'SQLite / Postgres / MySQL / Redis query & inspect (read-only gated)',
  devops: 'Docker / Kubernetes / Terraform / CI operations (COMMAND_NOT_FOUND safe)',
  docs: 'arXiv / npm / PyPI / RFC / PubMed package & paper metadata',
  document: 'PDF / DOCX / XLSX / PPTX parse & text extraction',
  encoding: 'Base64/URL/hex/hash/compress codecs',
  extract: 'DOM/selector/regex/table/metadata extraction from HTML',
  geo_data: 'Geo / maps / timezone / country helpers',
  git: 'Local git: status, diff, log, blame, branch operations',
  github: 'GitHub API: repos, code, issues, PRs, releases, actions, advisories',
  http: 'HTTP client verbs, headers, retries, multipart, SSE/websocket',
  i18n: 'Translate, transliterate, locale & RTL helpers',
  imageproc: 'Image processing: resize, crop, EXIF, QR, OCR pre/post',
  knowledge: 'Local knowledge store / embeddings / retrieval',
  llm: 'LLM gateway: complete, embed, structured output',
  media: 'Audio/video/image info, transcode, thumbnails, waveform',
  monitoring: 'Watches, health checks, scheduled fetch & change alerts',
  opendata: 'Public open-data providers (Crossref, OpenLibrary, Patents, GDELT)',
  phonetics: 'Phonetic transcription helpers',
  productivity: 'Tasks, notes, calendars, snippets (provider-backed)',
  research: 'Deep research pipeline: search → read → facts → verify → report',
  schema: 'JSON Schema / validation / inference helpers',
  search: 'Web, news, image, academic & vertical search (Serper/Brave/DDG)',
  security: 'OSV/SBOM scanning, header/CSP checks, secrets & CVE lookups',
  storage: 'S3 / Drive / Dropbox / OneDrive file operations',
  time: 'Date/time parsing, diff, relative formatting, cron helpers',
  units: 'Unit & number formatting/normalization',
  zip: 'Archive (zip/tar) list, extract, create',
};

const byCat: Record<string, Tool[]> = {};
for (const t of tools) (byCat[t.category] ??= []).push(t);
const cats = Object.keys(byCat).sort((a, b) => byCat[b].length - byCat[a].length || a.localeCompare(b));

const esc = (s: string) => s.replace(/\s+/g, ' ').trim();

let out = '';
out += "# Pro-Fetch — To'liq tool katalogi\n\n";
out += '> Bu fayl **`npm run dump:catalog`** (skript: `scripts/dump-catalog.mts`) orqali **haqiqiy reestr**dan\n';
out += "> avtomatik generatsiya qilinadi — qo'lda yozilmagan. Shu sababli nom va tavsiflar server\n";
out += "> `tools/list` da ko'rsatganningsizdan ham o'zgarmas. Qayta generatsiya:\n";
out += '> `npx tsx scripts/dump-catalog.mts`\n\n';
out +=
  `**Jami:** ${tools.length} ta tool · ${cats.length} ta kategoriya · smart=${smartNames.size}, ` +
  `minimal=${listTools('minimal').length}, standard=${listTools('standard').length}, full=${listTools('full').length}\n\n`;
out +=
  "Belgilar: `S` = smart meta-toʻplamiga kiradi · `▸` = minimal/standard profilda ko'rinadi · `·` = faqat `full` profil.\n\n";

out += '## Kategoriya xulosasi\n\n';
out += '| Kategoriya | Tool | Nima bor |\n|---|---:|---|\n';
for (const c of cats) {
  const label = LABELS[c] ? LABELS[c].replace(/\|/g, '\\|') : '—';
  out += `| \`${c}\` | ${byCat[c].length} | ${label} |\n`;
}
out += '\n---\n\n';

for (const c of cats) {
  out += `## ${c} (${byCat[c].length})\n\n`;
  if (LABELS[c]) out += `_${LABELS[c]}_\n\n`;
  const list = [...byCat[c]].sort((a, b) => a.name.localeCompare(b.name));
  for (const t of list) {
    const flag = (smartNames.has(t.name) ? 'S' : ' ') + ' ' + (members.has(t.name) ? '▸' : '·');
    out += `- \`${t.name}\` \`${flag}\` — ${esc(t.description)}\n`;
  }
  out += '\n';
}

const dest = path.join(process.cwd(), 'docs', 'TOOL_CATALOG.md');
await mkdir(path.dirname(dest), { recursive: true });
await writeFile(dest, out, 'utf8');
console.log(`WROTE ${dest} tools=${tools.length} categories=${cats.length} bytes=${Buffer.byteLength(out)}`);
