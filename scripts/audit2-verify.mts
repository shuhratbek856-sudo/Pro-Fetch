// Uchta tasdiqlangan nuqsonning tuzatilishini o'lchash: har biri haqiqiy natija berishi kerak.
//
// Chiqish har biri uchun PASS/FAIL. O'lchamasdan "ishladi" deyilmaydi.

process.env.PRO_FETCH_PROFILE = 'full';

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Derived from this script's own location: the written-down path pointed at a directory that no longer
// exists, so the script could not run at all on the machine that holds the repository.
const here = path.dirname(fileURLToPath(import.meta.url));
const base = pathToFileURL(path.join(here, '..', 'src')).href + '/';
await import(base + 'env.js');
await import(base + 'loader.js');

const { allTools } = await import(base + 'core/tool.js');
const { checkProvider, PROVIDERS } = await import(base + 'core/llm-gateway.js');

const results: Array<{ id: string; pass: boolean; detail: string }> = [];
const check = (id: string, pass: boolean, detail: string) => results.push({ id, pass, detail });
const find = (name: string) => {
  const t = allTools().find((x) => x.name === name);
  if (!t) throw new Error('tool topilmadi: ' + name);
  return t;
};
const textOf = async (r: unknown): Promise<string> => {
  const blocks = (r as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return blocks
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n');
};

// ---------------------------------------------------------------------------------------------
// F-08: proxy paroli modelga chiqmasligi kerak
// ---------------------------------------------------------------------------------------------
{
  process.env.HTTPS_PROXY = 'http://alice:s3cr3t-passphrase@proxy.corp.example:8080';
  process.env.NO_PROXY = 'localhost,.corp.example';
  const out = await textOf(await find('pro_fetch_config_get').handler({}, {} as never));
  const leaks = ['s3cr3t-passphrase', 'alice'].filter((s) => out.includes(s));
  check('F-08 proxy password', leaks.length === 0, `sizib chiqqan: ${leaks.join(', ') || 'yo q'}`);
  check(
    'F-08 proxy host ko‘rinadi',
    out.includes('proxy.corp.example:8080'),
    out.includes('proxy.corp.example:8080') ? 'host saqlangan' : 'host yo qoldi — foydali ma’lumot yo‘qoldi',
  );
  check('F-08 NO_PROXY o‘zgarishsiz', out.includes('localhost,.corp.example'), 'NO_PROXY parser buzilmagan');
  delete process.env.HTTPS_PROXY;
  delete process.env.NO_PROXY;
}

// ---------------------------------------------------------------------------------------------
// F-02: Jira credential faqat operator originiga
// ---------------------------------------------------------------------------------------------
{
  const jira = find('pro_fetch_collab_jira_projects');
  const before = { ...process.env };
  process.env.JIRA_TOKEN = 'tok-secret-value';
  process.env.JIRA_EMAIL = 'ops@corp.example';

  // 1) Operator originiga mos kelmaydigan base
  process.env.JIRA_BASE_URL = 'https://jira.corp.example';
  let out = '';
  try {
    out = await textOf(await jira.handler({ base: 'https://evil.example' }, {} as never));
  } catch (error) {
    out = error instanceof Error ? error.message : String(error);
  }
  check(
    'F-02 boshqa origin rad etiladi',
    /JIRA_BASE_MISMATCH/.test(out) && !out.includes('tok-secret-value'),
    out.includes('JIRA_BASE_MISMATCH') ? 'rad etildi, token chiqmadi' : `KUTILMAGAN: ${out.slice(0, 120)}`,
  );

  // 2) Operator origini o'zi http:// bo'lsa — aniq xato, token yuborilmaydi
  process.env.JIRA_BASE_URL = 'http://jira.corp.example';
  out = '';
  try {
    out = await textOf(await jira.handler({}, {} as never));
  } catch (error) {
    out = error instanceof Error ? error.message : String(error);
  }
  check(
    'F-02 http operator origini',
    /JIRA_INSECURE_TRANSPORT/.test(out) && !out.includes('tok-secret-value'),
    out.includes('JIRA_INSECURE_TRANSPORT')
      ? 'http rad etildi'
      : `SSRF guard ga yetib keldi yoki boshqa xato: ${out.slice(0, 120)}`,
  );

  // 3) JIRA_BASE_URL umuman yo'q — model o'zi base bera olmasligi kerak
  delete process.env.JIRA_BASE_URL;
  out = '';
  try {
    out = await textOf(await jira.handler({ base: 'https://jira.corp.example' }, {} as never));
  } catch (error) {
    out = error instanceof Error ? error.message : String(error);
  }
  check(
    'F-02 JIRA_BASE_URL yo‘q bo‘lsa rad etiladi',
    /JIRA_BASE_URL/.test(out) && !/UPSTREAM_HTTP|CREDENTIAL_MISSING/.test(out),
    out.slice(0, 120) || '(javob yo q)',
  );

  for (const k of Object.keys(process.env)) if (!(k in before)) delete process.env[k];
  for (const [k, v] of Object.entries(before)) process.env[k] = v as string;
}

// ---------------------------------------------------------------------------------------------
// F-09: base URL kalit sifatida yuborilmasligi kerak
// ---------------------------------------------------------------------------------------------
{
  const spec = PROVIDERS.openai_compatible;
  check('F-09 keyEnv base URL emas', spec.keyEnv === 'PRO_FETCH_LLM_API_KEY', `keyEnv = ${spec.keyEnv}`);
  check(
    'F-09 baseUrlEnv alohida',
    spec.baseUrlEnv === 'PRO_FETCH_LLM_BASE_URL',
    `baseUrlEnv = ${String(spec.baseUrlEnv)}`,
  );

  // A public IP literal, not a hostname: `assertSafeUrl` resolves DNS *before* `fetch`, so a name that
  // does not resolve would be refused by the guard and the request never reached the stub below.
  process.env.PRO_FETCH_LLM_BASE_URL = 'https://1.1.1.1/v1';
  delete process.env.PRO_FETCH_LLM_API_KEY;
  const status = checkProvider('openai_compatible');
  check(
    'F-09 kalitsiz endpoint haqiqiy',
    status.ready && /PRO_FETCH_LLM_API_KEY/.test(status.note ?? ''),
    `ready=${status.ready} note=${status.note ?? '(yo q)'}`,
  );

  // Haqiqiy so'rov: baza URL Bearer sifatida yuborilmasligi kerak.
  const { fetchWithOptions } = await import(base + 'core/http-client.js');
  const real = fetchWithOptions;
  let seenAuth: string | undefined;
  let seenUrl = '';
  const mod = await import(base + 'core/http-client.js');
  // fetchWithOptions ichidagi global fetch ni almashtirish — hech qanday tarmoq chaqiruvsiz.
  const originalFetch = globalThis.fetch;
  // `fetchWithOptions` calls `fetch(url, init)`, so headers live on the second argument, not on a
  // Request object. The first version of this stub read `input.headers` and threw on a string.
  (globalThis as { fetch: unknown }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    seenUrl = String(input);
    seenAuth = new Headers(init?.headers ?? {}).get('authorization') ?? undefined;
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    const { chat } = await import(base + 'core/llm-gateway.js');
    await chat({ provider: 'openai_compatible', model: 'm', messages: [{ role: 'user', content: 'hi' }] });
  } finally {
    (globalThis as { fetch: unknown }).fetch = originalFetch;
  }
  check(
    'F-09 base URL Bearer sifatida yuborilmaydi',
    seenAuth === undefined,
    seenAuth ? `YUBORILDI: ${seenAuth.slice(0, 60)}` : `yo q (url=${seenUrl})`,
  );

  // Endi kalit bor — u haqiqiy kalit bo'lishi kerak
  process.env.PRO_FETCH_LLM_API_KEY = 'sk-real-key-value';
  (globalThis as { fetch: unknown }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    seenAuth = new Headers(init?.headers ?? {}).get('authorization') ?? undefined;
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
  try {
    const { chat } = await import(base + 'core/llm-gateway.js');
    await chat({ provider: 'openai_compatible', model: 'm', messages: [{ role: 'user', content: 'hi' }] });
  } finally {
    (globalThis as { fetch: unknown }).fetch = originalFetch;
    delete process.env.PRO_FETCH_LLM_API_KEY;
    delete process.env.PRO_FETCH_LLM_BASE_URL;
  }
  check(
    'F-09 haqiqiy kalit yuboriladi',
    seenAuth === 'Bearer sk-real-key-value',
    seenAuth ? `yuborildi: ${seenAuth}` : 'YUBORILMADI',
  );
  void real;
  void mod;
}

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(40)} ${r.detail}`);
}
console.log(`\n  jami: ${results.length}, muvaffaqiyatsiz: ${failed}`);
process.exit(failed ? 1 : 0);
