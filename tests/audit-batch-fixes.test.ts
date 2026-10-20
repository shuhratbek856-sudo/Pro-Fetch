// Regression tests for the measured-defect batch fixed in this working tree.
//
// Every test here encodes a specific measured failure, not a style preference. Where a fix was
// verified by a live probe only (charset decoding, redirect URLs, proxy handling, WebSocket
// timeout behaviour), the probe is the evidence — this file carries the offline assertions that
// keep the fixes from regressing.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import '../src/loader.js';
import { allTools, dispatch } from '../src/core/tool.js';
import { assertNoUnknownArguments } from '../src/core/required-arguments.js';
import { cache } from '../src/core/cache.js';
import { chunkText, clipToTokens } from '../src/core/chunker.js';
import { readTextSource } from '../src/core/text-source.js';
import { SMART_TOOL_NAMES } from '../src/core/profile.js';
import { repoAuditSteps } from '../src/tools/github/repo_audit.js';

const tool = (name: string) => {
  const found = allTools().find((candidate) => candidate.name === name);
  if (!found) throw new Error(`tool not registered: ${name}`);
  return found;
};

const textOf = (result: { content?: Array<{ type: string; text?: string }> }): string =>
  (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n');

/** A dispatch result is successful unless it says otherwise: success leaves `isError` unset. */
const ok = (result: { isError?: boolean }): boolean => result.isError !== true;

let workspace: string;
const savedEnv: Record<string, string | undefined> = {};

beforeAll(async () => {
  process.env.PRO_FETCH_PROFILE = 'full';
  workspace = mkdtempSync(path.join(tmpdir(), 'pf-batch-'));
  process.env.PRO_FETCH_OUTPUT_ROOT = workspace;
  process.env.PRO_FETCH_CACHE_DIR = workspace;
  for (const key of ['PRO_FETCH_READ_ONLY', 'PRO_FETCH_MUTATION_ALLOWLIST']) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(workspace, { recursive: true, force: true });
});

describe('read-only guard attributes a write to the running tool (tool-context)', () => {
  // pro_fetch_import_bundle is a documented case: classified read-only by name, writes through
  // cache.put. Before the dispatch-bound tool name existed, PRO_FETCH_MUTATION_ALLOWLIST was read
  // only where a tool name was passed — nowhere at the sinks — so an operator could not allow
  // this tool read-only.
  const importInput = { data: JSON.stringify({ 'batch:attr': { value: 'from-allowed-tool' } }) };

  it('blocks the write with no allowlist', async () => {
    process.env.PRO_FETCH_READ_ONLY = 'true';
    process.env.PRO_FETCH_MUTATION_ALLOWLIST = '';
    const res = await dispatch('pro_fetch_import_bundle', importInput);
    expect(res.isError).toBe(true);
  });

  it('runs the write when the tool is allowlisted, and records it', async () => {
    process.env.PRO_FETCH_READ_ONLY = 'true';
    process.env.PRO_FETCH_MUTATION_ALLOWLIST = 'pro_fetch_import_bundle';
    const res = await dispatch('pro_fetch_import_bundle', importInput);
    expect(ok(res)).toBe(true);
    const back = await dispatch('pro_fetch_cache_get', { key: 'batch:attr' });
    expect(textOf(back)).toContain('from-allowed-tool');
  });

  it('keeps blocking when the allowlist names a different tool', async () => {
    process.env.PRO_FETCH_READ_ONLY = 'true';
    process.env.PRO_FETCH_MUTATION_ALLOWLIST = 'pro_fetch_cache_put';
    const res = await dispatch('pro_fetch_import_bundle', importInput);
    expect(res.isError).toBe(true);
  });

  it('behaves normally with read-only off', async () => {
    process.env.PRO_FETCH_READ_ONLY = 'false';
    const res = await dispatch('pro_fetch_import_bundle', importInput);
    expect(ok(res)).toBe(true);
  });
});

describe('composite step arguments must be declared by the target tools', () => {
  // repo_audit passed `limit`/`max_depth` to tools whose schemas are additionalProperties:false
  // and that only declare per_page/max_pages — seven of fifteen steps failed validation. The fix
  // named the keys the targets actually declare; the test pins the plan to their schemas.
  it('every repo_audit step names only declared, required-satisfying arguments', () => {
    for (const [, toolName, args] of repoAuditSteps('owner', 'repo', {
      include_ci: true,
      include_security: true,
    })) {
      const target = tool(toolName);
      expect(() => assertNoUnknownArguments(target, args)).not.toThrow();
      const schema = target.inputSchema as { required?: string[] };
      const required = schema.required ?? [];
      const supplied = Object.keys(args);
      for (const key of required) expect(supplied).toContain(key);
    }
  });
});

describe('chunker refuses budgets that cannot advance a loop', () => {
  it('chunkText throws on zero, negative and non-finite budgets instead of never returning', () => {
    expect(() => chunkText('abc', 0)).toThrow();
    expect(() => chunkText('abc', -2)).toThrow();
    expect(() => chunkText('abc', Number.NaN)).toThrow();
    expect(() => chunkText('abc', Number.POSITIVE_INFINITY)).toThrow();
  });

  it('clipToTokens falls back to the default on a nonsense budget', () => {
    const text = 'x'.repeat(50);
    expect(clipToTokens(text, Number.NaN)).toBe(text);
    expect(clipToTokens(text, -5)).toBe(text);
  });
});

describe('empty text is not a source', () => {
  // `readTextSource` used to return '' when `text: ''` was present and never consult url.
  it('readTextSource falls through an empty text to the url (which refuses loopback)', async () => {
    await expect(readTextSource({ text: '', url: 'http://127.0.0.1:9/x' }, 'label')).rejects.toThrow();
  });

  it('a tool given only empty text fails instead of parsing an empty document', async () => {
    const res = await dispatch('pro_fetch_csv_to_json', { text: '' });
    expect(res.isError).toBe(true);
  });
});

describe('cache.delete is exact-key', () => {
  it('a substring match is not deleted', () => {
    cache.put('f11:needle', 'v1');
    cache.put('f11:needle-and-more', 'v2');
    expect(cache.delete('f11:needle')).toBe(1);
    expect(cache.get('f11:needle')).toBeUndefined();
    expect(cache.get('f11:needle-and-more')?.value).toBe('v2');
  });
});

describe('the smart profile set matches the registry', () => {
  it('has eleven entries, and every one is a registered tool', () => {
    expect(SMART_TOOL_NAMES.size).toBe(11);
    for (const name of SMART_TOOL_NAMES) expect(tool(name)).toBeTruthy();
  });
});

describe('pro_data_pipeline operations dispatch only declared arguments', () => {
  it('dedupe succeeds end to end on inline JSON', async () => {
    const res = await dispatch('pro_data_pipeline', { text: '[[1,2],[3,4]]', operation: 'dedupe' });
    expect(ok(res)).toBe(true);
    expect(textOf(res)).toContain('failed=0');
  });

  it('sort dispatches to array_ops and succeeds', async () => {
    const res = await dispatch('pro_data_pipeline', { text: '[3,1,2]', operation: 'sort' });
    expect(ok(res)).toBe(true);
    expect(textOf(res)).toContain('failed=0');
    expect(textOf(res)).toContain('pro_fetch_array_ops');
  });

  it('group parses the rows and passes the declared rows/key pair', async () => {
    const res = await dispatch('pro_data_pipeline', {
      text: '[{"k":"a"},{"k":"b"},{"k":"a"}]',
      operation: 'group',
      operation_arg: 'k',
    });
    expect(ok(res)).toBe(true);
    // The pipeline profiles any text, so base loaders that cannot read a given shape report their
    // failure visibly instead of dying with the tool: JSON-with-quotes defeats the CSV parser by
    // design. The step this test exists for is group_by running at all — before the argument fix
    // it failed with undeclared `text`/`limit` beside missing required `rows`/`key`, whatever the
    // caller sent.
    expect(textOf(res)).toMatch(/pro_fetch_group_by · ok/);
    expect(textOf(res)).toContain('steps=6');
  });
});

describe('a pipeline on a CSV-shaped text profiles it without hitting undeclared arguments', () => {
  it('every base step that can read the shape runs, and dedupe dispatches cleanly', async () => {
    const res = await dispatch('pro_data_pipeline', { text: 'x,y\n1,2\n3,4', operation: 'dedupe' });
    expect(ok(res)).toBe(true);
    // The declared failure budget: only the JSON loader cannot read CSV. Before the argument fix
    // the Deduplicate step also failed, because `limit` went to a tool that declares no such key.
    expect(textOf(res)).toContain('steps=6; ok=5; failed=1');
    expect(textOf(res)).toContain('failed: Load as JSON');
    expect(textOf(res)).toMatch(/pro_fetch_dedupe_text · ok/);
  });
});

describe('fetch_batch rejects a non-numeric concurrency instead of dropping all URLs', () => {
  it('errors with a named reason', async () => {
    const res = await dispatch('pro_fetch_fetch_batch', { urls: ['http://example.com'], concurrency: 'fast' });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('concurrency');
  });

  it('a valid numeric concurrency is accepted and the batch shape is clean', async () => {
    const res = await dispatch('pro_fetch_fetch_batch', {
      urls: ['http://127.0.0.1:9/x'],
      concurrency: 2,
    });
    // Both URLs fail at the SSRF/network layer, but the batch itself is a normal result.
    expect(ok(res)).toBe(true);
  });
});

describe('JSON minification is text-level', () => {
  it('keeps duplicate keys, big integers and key order', () => {
    const src = '{"outer": 2, "outer": 99999999999999999999, "n": 1}';
    const res = dispatch('pro_fetch_json_minify', { text: src }) as unknown as Promise<any>;
    return res.then((r) => {
      expect(ok(r)).toBe(true);
      const out = textOf(r);
      expect(out.split('"outer"').length - 1).toBe(2);
      expect(out).toContain('99999999999999999999');
      expect(out.startsWith('{"outer":2')).toBe(true);
    });
  });
});

describe('JWT HS* verify follows the algorithm digest and refuses PEM secrets', () => {
  const b64url = (input: Buffer | string): string => Buffer.from(input).toString('base64url').replace(/=+$/, '');

  const signedToken = (alg: 'HS384' | 'HS512', secret: string): string => {
    const header = b64url(JSON.stringify({ alg, typ: 'JWT' }));
    const payload = b64url(JSON.stringify({ sub: 'regression' }));
    const digest = crypto.createHash(alg === 'HS384' ? 'sha384' : 'sha512');
    const signature = b64url(
      crypto
        .createHmac(digest.algorithm === 'sha384' ? 'sha384' : 'sha512', secret)
        .update(`${header}.${payload}`)
        .digest(),
    );
    return `${header}.${payload}.${signature}`;
  };

  const pem = '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ==\n-----END PUBLIC KEY-----';

  it('a correct HS512 token verifies', async () => {
    const res = await dispatch('pro_encode_jwt_verify', {
      token: signedToken('HS512', 'batch-secret'),
      key: 'batch-secret',
      algorithm: 'HS512',
    });
    expect(ok(res)).toBe(true);
  });

  it('a correct HS384 token verifies', async () => {
    const res = await dispatch('pro_encode_jwt_verify', {
      token: signedToken('HS384', 'batch-secret'),
      key: 'batch-secret',
      algorithm: 'HS384',
    });
    expect(ok(res)).toBe(true);
  });

  it('a PEM public key is refused as an HS secret, not reported invalid', async () => {
    const res = await dispatch('pro_encode_jwt_verify', {
      token: signedToken('HS256', 'anything'),
      key: pem,
      algorithm: 'HS256',
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('PEM');
  });
});

describe('CSV handling is one parser with honest statistics', () => {
  it('csv_stats counts a blank cell as missing, not zero', () => {
    const res = dispatch('pro_fetch_csv_stats', { text: 'a,b\n10,0\n20,\n' }) as unknown as Promise<any>;
    return res.then((r) => {
      expect(ok(r)).toBe(true);
      const out = textOf(r);
      expect(out).toContain('"missing": 0');
      expect(out).toContain('"missing": 1');
      expect(out).toContain('"min": 10');
    });
  });

  it('csv_to_markdown_table escapes pipes and line breaks', () => {
    const res = dispatch('pro_fetch_csv_to_markdown_table', {
      text: 'a,b\n"x|y",2\n"x\ny",3',
    }) as unknown as Promise<any>;
    return res.then((r) => {
      expect(ok(r)).toBe(true);
      const out = textOf(r);
      expect(out).toContain('x\\|y');
      expect(out).toContain('x<br>y');
      // Three plain lines of input become exactly two body rows.
      expect(out.split('\n').filter((line) => line.startsWith('| ')).length).toBe(4);
    });
  });
});

describe('SSRF guard covers the WebSocket listener', () => {
  it('a loopback ws target is refused before dialling', async () => {
    const res = await dispatch('pro_fetch_websocket_listen', { url: 'ws://127.0.0.1:8080/x', timeout_ms: 500 });
    expect(res.isError).toBe(true);
  });
});
