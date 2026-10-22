// 2-versiya auditidagi nuqsonlarni ajratish: allaqachon tuzatilgan, yangi, va tekshirishni talab qiladigan.
//
// Hech biriga ishonish emas - har biri o'lchanadi.

import { readFileSync, readFileSync as rf, globSync } from 'node:fs';

process.env.PRO_FETCH_PROFILE = 'full';
const base = new URL('../src/', import.meta.url).href;
await import(base + 'env.js');
await import(base + 'loader.js');
const { allTools } = await import(base + 'core/tool.js');
const { isMutationTool } = await import(base + 'core/tool-classification.js');
const { ownHandlerBodies, WRITE_SINKS } = await import(base + 'core/mutation-scan.js');

const read = (f) => rf(f, 'utf8');

// --- F-20: CSP header nomi ---------------------------------------------------------------------
console.log('=== F-20) CSP header nomi ===');
{
  const text = read('src/core/max-platform-tools.ts');
  const wrong = /'content-security-security'/g;
  const right = /'content-security-policy'/g;
  console.log('  noto‘g‘ri nom (content-security-security): ' + (text.match(wrong) ?? []).length + ' marta');
  console.log('  to‘g‘ri nom  (content-security-policy):    ' + (text.match(right) ?? []).length + ' marta');
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('content-security-security')) console.log(`    ${i + 1}: ${l.trim().slice(0, 96)}`);
  });
}

// --- F-06: qolgan yozuvchilar ------------------------------------------------------------------
console.log('');
console.log('=== F-06) Audit ro‘yxatidagi 20 tool hozir qanday tasniflangan ===');
const NAMED = [
  'pro_fetch_pdf_split_pages',
  'pro_pdf_blank',
  'pro_pdf_flatten',
  'pro_pdf_form_fill',
  'pro_pdf_merge',
  'pro_pdf_metadata',
  'pro_pdf_new',
  'pro_pdf_reorder',
  'pro_pdf_split',
  'pro_pdf_rotate',
  'pro_pdf_watermark',
  'pro_image_adjust',
  'pro_image_convert',
  'pro_image_crop',
  'pro_image_resize',
  'pro_image_rotate',
  'pro_image_sprite',
  'pro_image_strip_metadata',
  'pro_image_watermark',
  'pro_zip_extract',
];
const bodies = ownHandlerBodies();
let notClassified = 0;
let noGuard = 0;
for (const name of NAMED) {
  const tool = allTools().find((t) => t.name === name);
  const mutation = isMutationTool(name);
  const body = bodies.get(name);
  const sinks = body ? WRITE_SINKS.filter((s) => s.pattern.test(body)).map((s) => s.label) : [];
  const guarded = body ? /assertWritable\s*\(/.test(body) : false;
  if (!mutation) notClassified += 1;
  if (!guarded) noGuard += 1;
  console.log(
    `  ${mutation ? 'mutation' : 'READ-ONLY'}  guard=${guarded ? 'ha ' : 'YO Q'}  ${name.padEnd(30)} sinklar: ${sinks.join(',') || (body === undefined ? '(tanasi topilmadi)' : 'yo q')}`,
  );
}
console.log(`  >>> mutation deb tasniflanmagan: ${notClassified}, o'z handler'ida guard yo'q: ${noGuard}`);

// --- F-07: browser wrapper'lar action ni yashiradimi --------------------------------------------
console.log('');
console.log('=== F-07) Wrapper tool ichida action qo‘shiladimi ===');
{
  const hits = [];
  for (const file of globSync('src/tools/browser/*.ts')) {
    const text = read(file.replace(/\\/g, '/'));
    if (!/action:\s*'/.test(text)) continue;
    const m = /name:\s*'(pro_browser_[a-z_]+)'[\s\S]{0,900}?action:\s*'([a-z_]+)'/.exec(text);
    if (m) hits.push([m[1], m[2], file.replace(/\\/g, '/')]);
  }
  for (const [tool, action, file] of hits) {
    console.log(`  ${tool.padEnd(34)} action='${action}'  mutation=${isMutationTool(tool)}  ${file}`);
  }
  console.log(`  jami: ${hits.length}`);
}

// --- F-02: Jira base qayerdan olinadi ----------------------------------------------------------
console.log('');
console.log('=== F-02) Jira base manbasi va autentifikatsiya ===');
{
  const text = read('src/core/max-platform-tools.ts');
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    if (/JIRA_BASE_URL|JIRA_EMAIL|JIRA_TOKEN/.test(l)) {
      console.log(`  ${i + 1}: ${l.trim().slice(0, 104)}`);
    }
  });
}

// --- F-08: config_get proxy kalitlari -----------------------------------------------------------
console.log('');
console.log('=== F-08) config_get proxy qiymatlari ===');
{
  const text = read('src/tools/admin/config_get.ts');
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    if (/PROXY|proxy/.test(l)) console.log(`  ${i + 1}: ${l.trim().slice(0, 96)}`);
  });
}

// --- F-09: llm-gateway keyEnv -------------------------------------------------------------------
console.log('');
console.log('=== F-09) llm-gateway keyEnv ===');
{
  const text = read('src/core/llm-gateway.ts');
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    if (/keyEnv|baseUrlEnv/.test(l)) console.log(`  ${i + 1}: ${l.trim().slice(0, 100)}`);
  });
}

// --- F-24: CI playwright -----------------------------------------------------------------------
console.log('');
console.log('=== F-24) CI playwright install qadami ===');
{
  try {
    const text = read('.github/workflows/ci.yml');
    console.log('  playwright install bor: ' + /playwright install/.test(text));
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      if (/npm ci|playwright|run:/.test(l)) console.log(`    ${i + 1}: ${l.trim().slice(0, 80)}`);
    });
  } catch {
    console.log('  .github/workflows/ci.yml yo q');
  }
}
