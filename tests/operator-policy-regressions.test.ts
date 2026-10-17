// Regressiya testlari: ushbu sessiyada o'lchab topilgan va tuzatilgan nuqsonlar.
//
// Har bir test o'z izohida o'lchovni yozib qo'yadi - ya'ni test nima uchun mavjudligini aytadi, va
// u qachon buzilishi mumkinligini. "Ishlaydi" deb yozilgan test o'qilmaydi; o'lchov yozilgan test
// o'qiladi, chunki uni buzgan odam o'z qarorini tekshiradi.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import { writeZip } from '../src/tools/zip/_zip.js';
import { writeBoundaryRoot } from '../src/core/output-dir.js';
import { isMutationTool } from '../src/core/tool-classification.js';
import { assertToolAllowed } from '../src/core/security-policy.js';
import { allTools } from '../src/core/tool.js';
// The parsing lives in its own module. Importing `run-tests.mjs` for it would spawn a nested
// suite run inside the test worker and call process.exit there when that run failed - measured as
// `Error: process.exit unexpectedly called with "1"` against a file that collected zero tests.
import { evaluateSummary } from '../scripts/vitest-summary.mjs';
import type { ToolResult } from '../src/core/types.js';

const body = (result: ToolResult): string =>
  (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join(' ');

// -------------------------------------------------------------------------------------------
// 1. Read-only rejimida async yozuvchilar
// -------------------------------------------------------------------------------------------

describe('read-only mode refuses the tools that write through node:fs/promises', () => {
  let root: string;
  let previousRoot: string | undefined;
  const previousReadOnly = process.env.PRO_FETCH_READ_ONLY;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'ro-async-'));
    previousRoot = process.env.PRO_FETCH_OUTPUT_ROOT;
    process.env.PRO_FETCH_OUTPUT_ROOT = root;
    // The flag has to be set after any cleanup, because clearing the cache is itself a write and
    // now refuses under the flag. That ordering is not incidental - it is asserted in the security
    // boundary tests too.
    process.env.PRO_FETCH_READ_ONLY = 'true';
  });

  afterEach(() => {
    delete process.env.PRO_FETCH_READ_ONLY;
    if (previousReadOnly !== undefined) process.env.PRO_FETCH_READ_ONLY = previousReadOnly;
    if (previousRoot === undefined) delete process.env.PRO_FETCH_OUTPUT_ROOT;
    else process.env.PRO_FETCH_OUTPUT_ROOT = previousRoot;
    rmSync(root, { recursive: true, force: true });
  });

  it('refuses to extract an archive, and writes nothing', async () => {
    // Measured before the fix: isError=false, "extracted": 1, and the file was on disk. The scan that
    // classifies tools only looked for the *synchronous* filesystem functions, and this tool uses
    // `node:fs/promises`.
    const archive = writeZip([{ name: 'hello.txt', data: Buffer.from('read-only sinovi') }]);
    const outDir = path.join(root, 'extract-out');
    const result = await callTool('pro_zip_extract', {
      base64: archive.toString('base64'),
      out_dir: outDir,
      extract: true,
    });
    expect(result.isError).toBeTruthy();
    expect(body(result)).toMatch(/PRO_FETCH_READ_ONLY/);
    expect(existsSync(outDir) ? readdirSync(outDir) : []).toEqual([]);
  });

  it('refuses to split a PDF before producing any page', async () => {
    // Splitting writes one file per page, so the refusal has to happen before the first one rather
    // than leaving a half-finished directory behind.
    const result = await callTool('pro_pdf_split', { url: 'https://example.com/a.pdf', pages: '1' });
    expect(result.isError).toBeTruthy();
    expect(body(result)).toMatch(/PRO_FETCH_READ_ONLY/);
  });

  it('every tool reaching an async write sink is classified as a mutation', () => {
    // The classification table is what produces the MCP annotation a model sees before calling. A
    // tool that writes and is labelled read-only is a tool a client may pre-approve.
    for (const name of ['pro_zip_extract', 'pro_pdf_split', 'pro_fetch_pdf_split_pages']) {
      expect(isMutationTool(name), name + ' read-only deb tasniflangan').toBe(true);
    }
  });
});

// -------------------------------------------------------------------------------------------
// 2. ZIP: chiqish papkasining ichidagi symlink
// -------------------------------------------------------------------------------------------

describe('an archive cannot be written through a symlink inside the destination', () => {
  let root: string;
  let previousRoot: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'zip-symlink-'));
    previousRoot = process.env.PRO_FETCH_OUTPUT_ROOT;
    process.env.PRO_FETCH_OUTPUT_ROOT = root;
  });

  afterEach(() => {
    if (previousRoot === undefined) delete process.env.PRO_FETCH_OUTPUT_ROOT;
    else process.env.PRO_FETCH_OUTPUT_ROOT = previousRoot;
    rmSync(root, { recursive: true, force: true });
  });

  it('refuses the entry and leaves the outside directory untouched', async () => {
    // Measured before the fix: the entry name was sanitised correctly - no `..` in it - and the file
    // was still written outside, because `dest/portal` was a symlink to a sibling directory. The
    // earlier containment tests all used a fresh destination, which is the one case where a name with
    // no `..` is sufficient.
    const outside = path.join(root, 'outside-secret');
    mkdirSync(outside, { recursive: true });
    const destination = path.join(root, 'destination');
    mkdirSync(destination, { recursive: true });
    try {
      symlinkSync(outside, path.join(destination, 'portal'), 'junction');
    } catch {
      // Creating links needs a privilege some environments withhold. Skipping the whole case is
      // better than pretending it ran, so it is reported rather than silently passing.
      console.warn('  symlink yaratilmadi - bu holat sinovdan chiqarildi');
      return;
    }

    const archive = writeZip([{ name: 'portal/stolen.txt', data: Buffer.from('MAXFIY MATN') }]);
    const result = await callTool('pro_zip_extract', {
      base64: archive.toString('base64'),
      out_dir: destination,
      extract: true,
    });

    expect(result.isError).toBeTruthy();
    expect(existsSync(path.join(outside, 'stolen.txt'))).toBe(false);
    expect(body(result)).toMatch(/symlink/i);
  });

  it('still extracts through a normal subdirectory', async () => {
    // The positive half. Without it, the case above would also pass against an extractor that refuses
    // every entry that has a directory component.
    const archive = writeZip([{ name: 'nested/ok.txt', data: Buffer.from('ichida') }]);
    const destination = path.join(root, 'normal-destination');
    const result = await callTool('pro_zip_extract', {
      base64: archive.toString('base64'),
      out_dir: destination,
      extract: true,
    });
    expect(result.isError).toBeFalsy();
    expect(readFileSync(path.join(destination, 'nested', 'ok.txt'), 'utf8')).toBe('ichida');
  });
});

// -------------------------------------------------------------------------------------------
// 3. Model operator siyosatini o'zgartira olmaydi
// -------------------------------------------------------------------------------------------

describe('a tool call cannot change the operator policy', () => {
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('refuses every key whose name is a permission, a path or a cap', async () => {
    // Measured before the fix: PRO_FETCH_ALLOW_JS=true and PRO_FETCH_CACHE_DIR=/ were both applied
    // with isError=false. The second one is the escalation - writeBoundaryRoot() falls back to the
    // cache root, so moving the cache root to `/` moved the write boundary with it.
    const BOUNDARY_KEYS = [
      'PRO_FETCH_ALLOW_JS',
      'PRO_FETCH_ALLOW_COMMANDS',
      'PRO_FETCH_ALLOW_HTTPS_DOWNGRADE',
      'PRO_FETCH_ALLOW_UNPINNED_PROXY_DNS',
      'PRO_FETCH_READ_ONLY',
      'PRO_FETCH_ENFORCE_PROFILE',
      'PRO_FETCH_MODE',
      'PRO_FETCH_DENIED_TOOLS',
      'PRO_FETCH_DENIED_CATEGORIES',
      'PRO_FETCH_ALLOWED_TOOLS',
      'PRO_FETCH_MUTATION_ALLOWLIST',
      'PRO_FETCH_CACHE_DIR',
      'PRO_FETCH_OUTPUT_ROOT',
      'PRO_FETCH_WORKSPACE',
      'PRO_FETCH_KNOWLEDGE_DB',
      'PRO_FETCH_SQLITE_PATH',
      'PRO_FETCH_PROFILE',
      'PRO_FETCH_MAX_BYTES',
      'PRO_FETCH_MAX_INPUT_BYTES',
      'PRO_FETCH_MAX_SELF_SERVE',
      'PRO_FETCH_TIMEOUT_MS',
    ];
    for (const key of BOUNDARY_KEYS) {
      saved[key] = process.env[key];
      const result = await callTool('pro_fetch_config_set', { key, value: 'true' });
      expect(result.isError, key + ' o‘zgartirildi').toBeTruthy();
      expect(process.env[key], key + ' muhitga yozildi').toBe(saved[key]);
    }
  });

  it('still sets the keys that cannot widen anything', async () => {
    saved.PRO_FETCH_USER_AGENT = process.env.PRO_FETCH_USER_AGENT;
    const result = await callTool('pro_fetch_config_set', {
      key: 'PRO_FETCH_USER_AGENT',
      value: 'probe/1.0',
    });
    expect(result.isError).toBeFalsy();
    expect(process.env.PRO_FETCH_USER_AGENT).toBe('probe/1.0');
  });

  it('narrows the profile but does not widen it', async () => {
    saved.PRO_FETCH_PROFILE = process.env.PRO_FETCH_PROFILE;
    process.env.PRO_FETCH_PROFILE = 'standard';

    const narrower = await callTool('pro_fetch_profile_switch', { profile: 'minimal' });
    expect(narrower.isError).toBeFalsy();
    expect(process.env.PRO_FETCH_PROFILE).toBe('minimal');

    // Measured before the fix: switching to `full` succeeded with isError=false, so an operator who
    // chose `standard` could be overruled by one tool call.
    const wider = await callTool('pro_fetch_profile_switch', { profile: 'full' });
    expect(wider.isError).toBeTruthy();
    expect(process.env.PRO_FETCH_PROFILE).toBe('minimal');
  });

  it('refuses a write boundary that is a filesystem root', () => {
    // Defence in depth, and it covers a mistyped operator setting as well as the model: with the
    // boundary at `/` every containment check in this server becomes a no-op.
    saved.PRO_FETCH_OUTPUT_ROOT = process.env.PRO_FETCH_OUTPUT_ROOT;
    process.env.PRO_FETCH_OUTPUT_ROOT = '/';
    expect(() => writeBoundaryRoot()).toThrow(/ildizi|root/i);
    process.env.PRO_FETCH_OUTPUT_ROOT = path.join(tmpdir(), 'ordinary-boundary');
    expect(writeBoundaryRoot()).toBe(path.resolve(path.join(tmpdir(), 'ordinary-boundary')));
  });
});

// -------------------------------------------------------------------------------------------
// 4. PRO_FETCH_ALLOWED_TOOLS="*"
// -------------------------------------------------------------------------------------------

describe('an allowlist of "*" means no allowlist', () => {
  const saved = process.env.PRO_FETCH_ALLOWED_TOOLS;
  afterEach(() => {
    if (saved === undefined) delete process.env.PRO_FETCH_ALLOWED_TOOLS;
    else process.env.PRO_FETCH_ALLOWED_TOOLS = saved;
  });

  const probe = () => {
    const tool = allTools().find((entry) => entry.name === 'pro_fetch_fetch_url');
    if (!tool) throw new Error('pro_fetch_fetch_url registryda yo q');
    return tool;
  };

  const reason = (input: Record<string, unknown>): string => {
    try {
      assertToolAllowed(probe(), input);
      return '';
    } catch (error) {
      return (error as Error).message;
    }
  };

  it('lets a tool through that a named allowlist would block', () => {
    // Measured before the fix: '*' blocked every tool with "allowlist ichida yo'q", while the README
    // documented the variable as accepting '*'. A list that blocks everything fails safe, but it makes
    // the documented value a trap.
    process.env.PRO_FETCH_ALLOWED_TOOLS = 'pro_something_else';
    const withName = reason({});
    process.env.PRO_FETCH_ALLOWED_TOOLS = '*';
    const withStar = reason({ url: 'https://example.com' });

    expect(withName).toMatch(/allowlist/);
    // With '*' the only thing left to complain about is the missing url, which is the required-argument
    // guard doing its job rather than the allowlist.
    expect(withStar).not.toMatch(/allowlist/);
  });

  it('a named allowlist still restricts', () => {
    process.env.PRO_FETCH_ALLOWED_TOOLS = 'pro_fetch_pdf_read';
    expect(reason({ url: 'https://example.com' })).toMatch(/allowlist/);
  });
});

// -------------------------------------------------------------------------------------------
// 5. Test natijalarini o'qish: skipped
// -------------------------------------------------------------------------------------------

describe('the test runner reads a summary that includes skipped tests', () => {
  // Vitest prints one `N state` segment per state, in no guaranteed order, and any subset may be
  // present. The runner used to match a fixed `failed | passed` shape, so these parsed as nothing:
  //
  //     Tests  3 skipped | 738 passed (741)         -> no match
  //     Test Files  1 skipped | 37 passed (38)      -> no match
  //
  // and the run was reported as "vitest never reached the end" - a sentence about a crashed run,
  // produced by a run that finished cleanly.
  const summarise = (files: string, tests: string): string => ` Test Files  ${files}\n Tests  ${tests}\n`;

  const judge = (files: string, tests: string) =>
    evaluateSummary(summarise(files, tests), { expectedTestFiles: 38, expectedTests: 741 });

  it('reads passed, failed, skipped and todo in any order', () => {
    const shapes: Array<[string, string, number]> = [
      ['38 passed (38)', '741 passed (741)', 0],
      ['1 failed | 37 passed (38)', '1 failed | 740 passed (741)', 0],
      ['1 skipped | 37 passed (38)', '3 skipped | 738 passed (741)', 3],
      ['1 failed | 1 skipped | 36 passed (38)', '1 failed | 3 skipped | 737 passed (741)', 3],
      ['2 todo | 36 passed (38)', '2 todo | 739 passed (741)', 0],
    ];
    for (const [files, tests, skipped] of shapes) {
      const result = judge(files as string, tests as string);
      expect(result.reportedTests, tests as string).toBe(741);
      expect(result.skippedTests, tests as string).toBe(skipped);
    }
  });

  it('treats a skipped test as neither a pass nor a failure', () => {
    // Passing it silently would be the other half of the same mistake: a suite where a third of the
    // assertions never ran would report a pass.
    const result = judge('1 skipped | 37 passed (38)', '3 skipped | 738 passed (741)');
    expect(result.failures.join(' ')).toMatch(/skipped/);
  });

  it('still reports a real failure', () => {
    const failed = judge('1 failed | 37 passed (38)', '1 failed | 740 passed (741)');
    expect(failed.failures.join(' ')).toMatch(/failed/);
  });

  it('still reports a run that stopped early', () => {
    const truncated = judge('20 passed (38)', '400 passed (741)');
    expect(truncated.failures.join(' ')).toMatch(/only 400 of 741/);
  });

  it('recognises a stale manifest as stale rather than as a failure', () => {
    // More tests than the manifest recorded means the manifest is behind, which the runner repairs from
    // the number it just measured. Reporting that as a failure would describe a crash that did not
    // happen - the same sentence, the same confusion, three separate times in this project.
    const grown = judge('40 passed (40)', '800 passed (800)');
    expect(grown.failures).toEqual([]);
    expect(grown.manifestStale).toBe(true);
  });
});

// 6. Bolalar jarayoni muhiti: izoh bilan kod mos
// -------------------------------------------------------------------------------------------

describe('the child environment matches what its own documentation says', () => {
  it('drops SSH_AUTH_SOCK unless the operator opts in', async () => {
    // `SSH_AUTH_SOCK` was removed from the default allowlist. It names the agent's socket — forwarding
    // it gives every child the ability to ask the agent to sign. An operator who needs git-over-SSH
    // opts in via `PRO_FETCH_CHILD_EXTRA_ENV`.
    const { childEnv } = await import('../src/core/child-env.js');
    const { env, dropped } = childEnv({ source: { SSH_AUTH_SOCK: '/tmp/agent.sock', PATH: '/bin' } });
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
    expect(dropped).toContain('SSH_AUTH_SOCK');
  });
});
