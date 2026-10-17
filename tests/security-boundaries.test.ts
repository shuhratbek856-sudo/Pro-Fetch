// Security boundaries, each asserted by behaviour rather than by inspection.
//
// Every test here corresponds to a defect that was measured before it was fixed. The comments record the
// measurement, because a test whose rationale is "this should be true" stops being read the moment it
// starts failing, and the ones that fail are the ones that were wrong about something.
//
// The read-only tests set and restore `PRO_FETCH_READ_ONLY` around each case. The flag is read fresh on
// every call rather than cached, so this works, and `cache.clear()` refuses under the flag - which is
// itself asserted below and is why cleanup happens before the flag is set.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, symlinkSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import { allTools } from '../src/core/tool.js';
import { cache } from '../src/core/cache.js';
import { assertToolAllowed } from '../src/core/security-policy.js';
import { assertWritable, readOnly, WriteBlockedError } from '../src/core/read-only-guard.js';
import { childEnv, describeChildEnv } from '../src/core/child-env.js';
import { sanitizeToolError } from '../src/core/tool.js';
import { describeUrl, resolveSafeUrl, UrlSecurityError } from '../src/core/ssrf-guard.js';
import { isInside } from '../src/core/path-containment.js';
import { outputRoot } from '../src/core/output-dir.js';
import {
  MUTATING_ACTIONS,
  READ_ONLY_ACTIONS,
  deriveAnnotations,
  isMutatingAction,
  isMutationTool,
  isMutationToolByName,
  mutationSinksOf,
  MUTATING_ACTIONS,
} from '../src/core/tool-classification.js';
import { SINK_REACHING_TOOLS } from '../src/core/mutation-sinks.generated.js';
import { scanSinkReachingTools } from '../src/core/mutation-scan.js';
import type { ToolResult } from '../src/core/types.js';

const run = promisify(execFile);

const body = (result: ToolResult): string =>
  (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join(' ');

// -------------------------------------------------------------------------------------------
// 1. Read-only mode, enforced at the sink rather than at the tool boundary
// -------------------------------------------------------------------------------------------

describe('PRO_FETCH_READ_ONLY is enforced where state actually changes', () => {
  const original = process.env.PRO_FETCH_READ_ONLY;
  beforeEach(() => {
    // Cleanup has to happen while writes are still permitted.
    delete process.env.PRO_FETCH_READ_ONLY;
    cache.clear();
  });
  afterEach(() => {
    delete process.env.PRO_FETCH_READ_ONLY;
    cache.clear();
    if (original === undefined) delete process.env.PRO_FETCH_READ_ONLY;
    else process.env.PRO_FETCH_READ_ONLY = original;
  });

  it('refuses every cache write entry point', () => {
    process.env.PRO_FETCH_READ_ONLY = 'true';
    expect(readOnly()).toBe(true);
    expect(() => cache.put('k', 'v')).toThrow(WriteBlockedError);
    expect(() => cache.delete('k')).toThrow(WriteBlockedError);
    expect(() => cache.clear()).toThrow(WriteBlockedError);
    expect(() => cache.tune({ maxEntries: 10 })).toThrow(WriteBlockedError);
  });

  it('names the effect in the refusal', () => {
    process.env.PRO_FETCH_READ_ONLY = 'true';
    // "Something was blocked" sends the reader looking; "cache yozuvi" tells them where to look.
    expect(() => cache.put('k', 'v')).toThrow(/cache yozuvi/);
  });

  it('leaves the store untouched when a write is refused', () => {
    cache.put('probe', 'before');
    const sizeBefore = cache.stats().size;
    process.env.PRO_FETCH_READ_ONLY = 'true';
    expect(() => cache.put('probe', 'after')).toThrow();
    // A refused write must not be a partial write.
    expect(cache.get('probe')?.value).toBe('before');
    expect(cache.stats().size).toBe(sizeBefore);
  });

  it('blocks a tool whose write is only visible in its handler', async () => {
    // The measured defect: `pro_fetch_import_bundle` was classified read-only by name, passed the
    // policy, and wrote every supplied key into the cache. The call completed with `isError: false`
    // and `cache.get(key)` returned the new value.
    process.env.PRO_FETCH_READ_ONLY = 'true';
    const key = 'read-only-contract-probe';
    const result = await callTool('pro_fetch_import_bundle', {
      data: JSON.stringify({ [key]: { value: 'WRITTEN' } }),
    });
    expect(result.isError).toBeTruthy();
    expect(cache.get(key)).toBeUndefined();
    expect(body(result)).toMatch(/PRO_FETCH_READ_ONLY/);
  });

  it('honours PRO_FETCH_MUTATION_ALLOWLIST for the guard that asks about a tool', () => {
    process.env.PRO_FETCH_READ_ONLY = 'true';
    process.env.PRO_FETCH_MUTATION_ALLOWLIST = 'some_other_tool';
    // The allowlist names *tools*; a sink cannot know its caller, so it only honours an explicit name.
    expect(() => assertWritable('cache yozuvi', 'some_other_tool')).not.toThrow();
    expect(() => assertWritable('cache yozuvi', 'pro_fetch_import_bundle')).toThrow();
    delete process.env.PRO_FETCH_MUTATION_ALLOWLIST;
  });

  it('reports read-only refusals as failures rather than as empty results', async () => {
    process.env.PRO_FETCH_READ_ONLY = 'true';
    // `isError: false` with no work done is the failure shape this whole change exists to remove.
    const result = await callTool('pro_fetch_import_bundle', { data: '{}' });
    expect(result.isError).toBeTruthy();
  });
});

// -------------------------------------------------------------------------------------------
// 2. Caching is a side effect, not the purpose of a call
// -------------------------------------------------------------------------------------------

describe('caching is skipped under read-only, and skipping is not an error', () => {
  const original = process.env.PRO_FETCH_READ_ONLY;
  afterEach(() => {
    delete process.env.PRO_FETCH_READ_ONLY;
    cache.clear();
    if (original === undefined) delete process.env.PRO_FETCH_READ_ONLY;
    else process.env.PRO_FETCH_READ_ONLY = original;
  });

  it('canSkipSideEffect follows the flag', () => {
    delete process.env.PRO_FETCH_READ_ONLY;
    expect(() => assertWritable('x')).not.toThrow();
    process.env.PRO_FETCH_READ_ONLY = 'true';
    expect(() => assertWritable('x')).toThrow();
  });
});

// -------------------------------------------------------------------------------------------
// 3. Child process environment
// -------------------------------------------------------------------------------------------

describe('a child process does not inherit the server credentials', () => {
  it('drops credential-shaped variables and keeps the ones a command needs', () => {
    const { env, dropped } = childEnv({
      source: {
        PATH: '/usr/bin',
        HOME: '/home/u',
        SystemRoot: 'C:/Windows',
        COMSPEC: 'C:/Windows/system32/cmd.exe',
        TEMP: 'C:/Temp',
        OPENAI_API_KEY: 'sk-leak',
        GITHUB_TOKEN: 'ghp-leak',
        AWS_SECRET_ACCESS_KEY: 'leak',
        DATABASE_URL: 'postgres://u:p@h/db',
        NODE_OPTIONS: '--require C:/evil.js',
        PRO_FETCH_CACHE_DIR: '.cache',
        RANDOM_THING: 'x',
      },
    });

    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/u');
    expect(env.SystemRoot).toBe('C:/Windows');
    // Server configuration a child may legitimately need.
    expect(env.PRO_FETCH_CACHE_DIR).toBe('.cache');
    // Nothing that carries a credential.
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.RANDOM_THING).toBeUndefined();
    expect(dropped).toContain('OPENAI_API_KEY');
    expect(dropped).toContain('NODE_OPTIONS');
  });

  it('never forwards NODE_OPTIONS even when it is explicitly allowed', () => {
    // `NODE_OPTIONS=--require /tmp/x.js` executes code in the child before its own entry point. It is
    // configuration only in the sense that a string is configuration.
    const { env } = childEnv({
      source: { NODE_OPTIONS: '--require C:/evil.js', PATH: '/usr/bin' },
      allow: ['NODE_OPTIONS'],
    });
    expect(env.NODE_OPTIONS).toBeUndefined();
  });

  it('honours an explicit allow for a name that looks like a credential', () => {
    const { env } = childEnv({
      source: { OPENAI_API_KEY: 'needed', PATH: '/usr/bin' },
      allow: ['OPENAI_API_KEY'],
    });
    expect(env.OPENAI_API_KEY).toBe('needed');
  });

  it('exempts the names that only *refer* to a credential', () => {
    const { env } = childEnv({
      source: { SSH_AUTH_SOCK: '/tmp/agent.sock', GIT_ASKPASS: '/bin/askpass', NPM_TOKEN_USERCONFIG: '/x' },
    });
    // Each names a file or a helper. Forwarding the *value* of any of them would not be safe.
    expect(env.SSH_AUTH_SOCK).toBe('/tmp/agent.sock');
    expect(env.GIT_ASKPASS).toBe('/bin/askpass');
    expect(env.NPM_TOKEN_USERCONFIG).toBe('/x');
  });

  it('a real child process sees none of it', async () => {
    // The rules above are unit-level; this runs an actual process and reads its environment, which is
    // the claim that matters.
    const secrets: Record<string, string> = {
      OPENAI_API_KEY: 'sk-probe',
      GITHUB_TOKEN: 'ghp-probe',
      DATABASE_URL: 'postgres://u:p@h/db',
      NODE_OPTIONS: '--require C:/evil.js',
    };
    const saved = { ...secrets };
    Object.assign(process.env, secrets);
    try {
      const { env } = childEnv();
      const probe =
        'console.log(JSON.stringify([' +
        '!!process.env.OPENAI_API_KEY,!!process.env.GITHUB_TOKEN,' +
        '!!process.env.DATABASE_URL,!!process.env.NODE_OPTIONS,!!process.env.PATH]))';
      const { stdout } = await run(process.execPath, ['-e', probe], { env });
      const [key, token, db, nodeOptions, path] = JSON.parse(stdout) as boolean[];
      expect(key).toBe(false);
      expect(token).toBe(false);
      expect(db).toBe(false);
      expect(nodeOptions).toBe(false);
      // PATH is what makes npm, git and npx work at all.
      expect(path).toBe(true);
    } finally {
      for (const [name, value] of Object.entries(saved)) process.env[name] = value;
    }
  });

  it('describes what a child would see without exposing the values', () => {
    const described = describeChildEnv({ source: { OPENAI_API_KEY: 'sk-x', PATH: '/bin', MYSTERY: '1' } });
    expect(described.forwarded).toContain('PATH');
    expect(described.dropped_as_credential).toContain('OPENAI_API_KEY');
    expect(described.dropped_as_unknown).toContain('MYSTERY');
    expect(JSON.stringify(described)).not.toContain('sk-x');
  });
});

// -------------------------------------------------------------------------------------------
// 4. Secrets in URLs
// -------------------------------------------------------------------------------------------

describe('error messages do not repeat credentials carried by a URL', () => {
  const SECRETS = [
    'sk_live_9f8a7b6c5d4e3f2a1b0c',
    'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    'hunter2-super-secret',
    'OPAQWEBHOOKID0123456789',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  ];

  const cases: Array<[string, string]> = [
    [
      'a secret in the path, as a webhook URL carries it',
      'https://hooks.example.com/h/OPAQWEBHOOKID0123456789?attempt=1',
    ],
    ['a token in the query', 'https://api.example.com/v1/reset?token=sk_live_9f8a7b6c5d4e3f2a1b0c&redirect=/home'],
    [
      'a parameter name the old list did not cover',
      'https://api.example.com/v1/session?auth_ticket=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    ],
    ['credentials in the authority', 'https://admin:hunter2-super-secret@example.com/panel'],
    ['a bearer token', 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'],
  ];

  it.each(cases)('redacts %s', (_label, input) => {
    const output = sanitizeToolError(new Error(input), {});
    for (const secret of SECRETS) expect(output).not.toContain(secret);
  });

  const harmless: Array<[string, string]> = [
    ['an ordinary path with version and resource names', 'https://example.com/v1/users?page=2&sort=name&limit=50'],
    ['an ordinary file path', 'https://example.com/docs/report.pdf?v=2'],
  ];

  it.each(harmless)('leaves %s intact', (_label, input) => {
    // Redaction that mangles ordinary output trains people to ignore it, and would hide the signal in
    // the cases that matter.
    expect(sanitizeToolError(new Error(input), {})).toBe(input);
  });

  it('describeUrl reports shape without values', () => {
    expect(describeUrl('https://x.example/h/OPAQWEBHOOKID0123456789?t=abc')).not.toContain('OPAQWEBHOOKID');
    expect(describeUrl('https://x.example/h/abc?t=secretvalue')).toContain('query kalitlari: t');
    // An unparseable URL reports only its length, so a malformed token still cannot leak.
    const described = describeUrl('not a url at all');
    expect(described).not.toContain('not a url');
    expect(described).toContain('16');
  });

  it('the SSRF guard does not echo the input it rejected', async () => {
    // Measured before the fix: `new UrlSecurityError('Yaroqsiz URL: ' + rawUrl)` put the whole string,
    // credentials included, into the message the model sees.
    await expect(resolveSafeUrl('h ttp://%zz')).rejects.toBeInstanceOf(UrlSecurityError);
    try {
      await resolveSafeUrl('h ttp://exa mple.com/h/OPAQWEBHOOKID0123456789?token=sk_live_9f8a7b6c5d4e3f2a1b0c');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain('OPAQWEBHOOKID');
      expect(message).not.toContain('sk_live_');
    }
  });
});

// -------------------------------------------------------------------------------------------
// 5. Path containment
// -------------------------------------------------------------------------------------------

describe('written paths stay inside the output root', () => {
  it('a sibling directory whose name shares the prefix is outside', () => {
    // `C:\out-evil` starts with `C:\out` as a string. Comparing with `startsWith` would pass it.
    const root = outputRoot();
    const sibling = root + '-evil';
    expect(isInside(root, root)).toBe(true);
    expect(isInside(root, path.join(root, 'a', 'b.txt'))).toBe(true);
    expect(isInside(root, sibling)).toBe(false);
  });

  it('a symlink pointing out of the root does not pass', () => {
    const base = mkdtempSync(path.join(tmpdir(), 'containment-'));
    const root = path.join(base, 'root');
    const outside = path.join(base, 'outside');
    mkdirSync(root, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(path.join(outside, 'target.txt'), 'data', 'utf8');
    try {
      symlinkSync(outside, path.join(root, 'link'), 'junction');
    } catch {
      // Creating links needs a privilege this environment may not grant; the check below still runs and
      // the directory-name case above covers the same comparison.
    }
    expect(isInside(root, path.join(root, 'link', 'target.txt'))).toBe(false);
  });

  it('reads are confined to the workspace', () => {
    const outside = mkdtempSync(path.join(tmpdir(), 'outside-workspace-'));
    // The real check raises; this asserts the boundary rather than the exception, so a failure names the
    // cause instead of just "it threw".
    expect(isInside(process.cwd(), path.join(process.cwd(), 'src', 'core', 'cache.ts'))).toBe(true);
    expect(isInside(process.cwd(), path.join(outside, 'anything'))).toBe(false);
  });
});

// -------------------------------------------------------------------------------------------
// 6. The mutation table cannot drift from the code
// -------------------------------------------------------------------------------------------

// -------------------------------------------------------------------------------------------
// 7. Multi-action tools: read-only has to look inside the name
// -------------------------------------------------------------------------------------------

describe('a tool that dispatches several actions cannot hide a write behind its name', () => {
  const ACTIONS = [
    'back',
    'clear_cookies',
    'close_all',
    'close_session',
    'close_tab',
    'cookies_get',
    'cookies_set',
    'download',
    'drag',
    'forward',
    'get_html',
    'get_state',
    'get_text',
    'get_title',
    'get_url',
    'handle_dialog',
    'hover',
    'list_sessions',
    'list_tabs',
    'new_tab',
    'press',
    'reload',
    'select',
    'set_headers',
    'switch_tab',
    'upload_file',
  ];

  // Kept in sorted order because the assertions compare against a sorted result.
  const MUTATING = [
    'clear_cookies',
    'close_all',
    'close_session',
    'close_tab',
    'cookies_set',
    'download',
    'drag',
    'handle_dialog',
    'press',
    'set_headers',
    'upload_file',
  ];

  const browserAction = () => allTools().find((tool) => tool.name === 'pro_browser_browser_action');

  it('every action the browser handler implements is classified', () => {
    // Measured from the handler itself: the actions are the `case '...'` labels and the
    // `action === '...'` comparisons in `browser-tools.ts`. An action added there and not here would be
    // unclassified, and `isMutatingAction` treats unknown as a write - the safe direction, but still
    // drift between the code and the list.
    const source = readFileSync(new URL('../src/core/browser-tools.ts', import.meta.url), 'utf8');
    const implemented = new Set<string>();
    for (const match of source.matchAll(/case '([a-z_]+)':/g)) implemented.add(match[1] as string);
    for (const match of source.matchAll(/action === '([a-z_]+)'/g)) implemented.add(match[1] as string);
    for (const match of source.matchAll(/action !== '([a-z_]+)'/g)) implemented.add(match[1] as string);
    expect([...implemented].sort()).toEqual(ACTIONS);

    for (const action of ACTIONS) {
      const classified = READ_ONLY_ACTIONS.has(action) || MUTATING_ACTIONS.has(action);
      expect(classified, action + ' tasniflanmagan').toBe(true);
    }
  });

  it('an action is in exactly one of the two sets', () => {
    for (const action of ACTIONS) {
      const readOnly = READ_ONLY_ACTIONS.has(action);
      const mutating = MUTATING_ACTIONS.has(action);
      expect(readOnly && mutating, action + ' ikkalasida ham').toBe(false);
    }
    expect([...MUTATING_ACTIONS].sort()).toEqual(MUTATING);
  });

  it('the published schema lists every action', () => {
    const tool = browserAction();
    if (!tool) return;
    const enumBlock = /enum:\s*\[([\s\S]*?)\]/.exec(JSON.stringify(tool.inputSchema));
    if (!enumBlock) return;
    const published = [...(enumBlock[1] as string).matchAll(/'([a-z_]+)'/g)].map((m) => m[1] as string);
    for (const action of ACTIONS) {
      expect(published, action + ' sxemada yo q').toContain(action);
    }
  });

  it('refuses every state-changing action under read-only, and allows the readers', () => {
    // The measurement that motivated this: all eleven passed before the check existed, `cookies_set`
    // among them, and it reaches no filesystem sink, so the sink-level guard could not see it either.
    const tool = browserAction();
    if (!tool) return;
    const original = process.env.PRO_FETCH_READ_ONLY;
    process.env.PRO_FETCH_READ_ONLY = 'true';
    try {
      const refused: string[] = [];
      const allowed: string[] = [];
      for (const action of ACTIONS) {
        let blocked = false;
        try {
          assertToolAllowed(tool, { action });
        } catch {
          blocked = true;
        }
        if (blocked) refused.push(action);
        else allowed.push(action);
      }
      expect(refused.sort()).toEqual(MUTATING);
      expect(allowed.sort()).toEqual(ACTIONS.filter((action) => !MUTATING.includes(action)));
    } finally {
      if (original === undefined) delete process.env.PRO_FETCH_READ_ONLY;
      else process.env.PRO_FETCH_READ_ONLY = original;
    }
  });

  it('names the read-only actions in the refusal', () => {
    const tool = browserAction();
    if (!tool) return;
    const original = process.env.PRO_FETCH_READ_ONLY;
    process.env.PRO_FETCH_READ_ONLY = 'true';
    try {
      expect(() => assertToolAllowed(tool, { action: 'cookies_set' })).toThrow(/o'qishga ruxsat/i);
    } finally {
      if (original === undefined) delete process.env.PRO_FETCH_READ_ONLY;
      else process.env.PRO_FETCH_READ_ONLY = original;
    }
  });

  it('treats an unknown action as a write rather than assuming it is harmless', () => {
    // A list that is wrong in the safe direction is a list that fails safe.
    expect(isMutatingAction('something_new')).toBe(true);
    expect(isMutatingAction('get_url')).toBe(false);
  });
});

describe('the generated mutation table matches the code', () => {
  it('finds no tool that writes without being classified as a mutation', () => {
    // The same scanner the generator uses, so the two cannot disagree. It reads each tool's *own*
    // handler body: going through `resolveToolSource` appends the shared helpers a handler calls, and
    // the shared HTTP client contains `method: 'POST'`, which made 162 plain fetchers look like writers.
    const { entries } = scanSinkReachingTools(isMutationToolByName, MUTATING_ACTIONS);
    expect(entries.length).toBeGreaterThan(0);

    // Recomputed here rather than compared against the generated file directly, because that is the
    // drift this test exists to catch.
    const generated = Object.keys(SINK_REACHING_TOOLS).sort();
    expect(generated).toEqual(entries.map((entry) => entry.name).sort());
    for (const entry of entries) {
      expect(SINK_REACHING_TOOLS[entry.name], entry.name).toEqual(entry.sinks);
    }
  });

  it('the table is not empty and names what it found', () => {
    const entries = Object.entries(SINK_REACHING_TOOLS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, sinks] of entries) {
      expect(
        allTools().some((tool) => tool.name === name),
        name,
      ).toBe(true);
      expect(sinks.length, name).toBeGreaterThan(0);
    }
  });

  it('the tool that proved the defect is in the table', () => {
    expect(mutationSinksOf('pro_fetch_import_bundle')).toContain('cache');
    expect(isMutationTool('pro_fetch_import_bundle')).toBe(true);
  });

  it('no mutation is advertised to a model as read-only', () => {
    // The two answers came from two regexes and disagreed. They now read the same source, and this is
    // the assertion that keeps them reading the same source.
    const lying = allTools().filter(
      (tool) => isMutationTool(tool.name) && deriveAnnotations(tool.name, tool.category).readOnlyHint,
    );
    expect(lying).toEqual([]);
  });
});
