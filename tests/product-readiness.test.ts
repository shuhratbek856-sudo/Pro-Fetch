import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import '../src/loader.js';
import { allTools, dispatch } from '../src/core/tool.js';
import { isMutationTool, deriveAnnotations } from '../src/core/tool-classification.js';
import { assertToolAllowed } from '../src/core/security-policy.js';
import { currentProfile, isToolVisibleInProfile, profileEnforced } from '../src/core/profile.js';
import { getCredential } from '../src/core/credentials.js';
import { boundedEnv } from '../src/core/bounded-env.js';
import { VERSION, USER_AGENT } from '../src/core/version.js';
import { asRecordArray, pathStr, pathNum, view } from '../src/core/input.js';
import type { ToolDefinition } from '../src/core/types.js';

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL };
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

function fakeTool(name: string, category: string): ToolDefinition {
  return {
    name,
    description: 'product-readiness test tool',
    category,
    inputSchema: { type: 'object' },
    handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
  };
}

describe('tool classification: annotations and the read-only gate cannot drift', () => {
  it('marks a state-changing tool read-only=false even when its name has no mutation verb', () => {
    // These two drifted before the fix: `isMutationTool` blocked them in read-only mode while the
    // MCP annotation still advertised `readOnlyHint: true`, so a client trusting the hint would
    // auto-approve a call that changes server state.
    expect(isMutationTool('cache_tune')).toBe(true);
    expect(isMutationTool('knowledge_rebuild')).toBe(true);
    for (const tool of allTools()) {
      if (tool.name === 'pro_fetch_cache_tune' || tool.name === 'pro_fetch_knowledge_rebuild') {
        expect(tool.annotations?.readOnlyHint).toBe(false);
        expect(tool.annotations?.destructiveHint).toBe(true);
      }
    }
  });

  it('agrees in both directions across the whole registry', () => {
    const tools = allTools();
    const writeCapableCategories = new Set(['apitest', 'auth']);

    const annotatedButReadOnly = tools.filter(
      (tool) =>
        tool.annotations?.destructiveHint === true &&
        !writeCapableCategories.has(tool.category) &&
        !isMutationTool(tool.name),
    );
    const policyButAnnotatedReadOnly = tools.filter(
      (tool) => isMutationTool(tool.name) && tool.annotations?.readOnlyHint !== false,
    );

    expect(annotatedButReadOnly.map((tool) => tool.name)).toEqual([]);
    expect(policyButAnnotatedReadOnly.map((tool) => tool.name)).toEqual([]);
  });

  it('does not mark a plain read-only HTTP GET as destructive', () => {
    // `http` was previously write-capable as a category, so every plain fetch asked to confirm.
    const hash = allTools().find((tool) => tool.name === 'pro_fetch_hash_string');
    expect(hash?.annotations?.readOnlyHint).toBe(true);
    expect(hash?.annotations?.destructiveHint).toBe(false);
  });

  it('covers names matched by the verb list as well as the explicit list', () => {
    // Both routes must classify the same. Several explicit entries are also caught by
    // `MUTATION_VERBS` (`set`, `switch`, `schedule`, `save`); the rest exist because the verb
    // list alone would miss them. Removing either route must not silently reclassify a tool.
    for (const name of [
      'config_set',
      'api_key_set',
      'profile_switch',
      'batch_schedule',
      'archive_org_save',
      'cookie_jar_manage',
    ]) {
      expect(isMutationTool(name)).toBe(true);
    }
    // A name with no mutation verb at all must stay read-only.
    expect(isMutationTool('hash_string')).toBe(false);
    expect(isMutationTool('list_extract')).toBe(false);
  });

  it('strips both known tool prefixes before classifying', () => {
    // Classification must not depend on whether the name is `pro_fetch_` or `pro_research_`.
    expect(isMutationTool('pro_fetch_config_set')).toBe(true);
    expect(isMutationTool('config_set')).toBe(true);
    expect(isMutationTool('pro_research_hash_string')).toBe(false);
  });

  it('derives annotations from both the name and the category', () => {
    // `archive` reaches an external service, so it is open-world even though the write is local.
    expect(deriveAnnotations('pro_fetch_cache_put', 'archive')).toEqual({
      title: 'pro_fetch_cache_put',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    });
    // A purely local write in a local category is not open-world.
    expect(deriveAnnotations('pro_fetch_cache_put', 'knowledge')).toMatchObject({
      readOnlyHint: false,
      openWorldHint: false,
    });
  });
});

describe('profile enforcement', () => {
  it('does not enforce the profile by default, so the smart meta-executor keeps working', () => {
    expect(profileEnforced()).toBe(false);
    process.env.PRO_FETCH_PROFILE = 'smart';
    delete process.env.PRO_FETCH_ENFORCE_PROFILE;
    expect(profileEnforced()).toBe(false);
  });

  it('blocks a tool outside the active profile when enforcement is on', () => {
    process.env.PRO_FETCH_PROFILE = 'minimal';
    process.env.PRO_FETCH_ENFORCE_PROFILE = 'true';
    const hidden = allTools().find((tool) => tool.category === 'github');
    expect(isToolVisibleInProfile(hidden!, currentProfile())).toBe(false);
    expect(() => assertToolAllowed(hidden!, {})).toThrow(/PRO_FETCH_ENFORCE_PROFILE/);
  });

  it('allows a visible tool when enforcement is on', () => {
    process.env.PRO_FETCH_PROFILE = 'minimal';
    process.env.PRO_FETCH_ENFORCE_PROFILE = 'true';
    const visible = allTools().find((tool) => isToolVisibleInProfile(tool, 'minimal'));
    expect(() => assertToolAllowed(visible!, {})).not.toThrow();
  });

  it('rejects the smart profile under enforcement instead of silently breaking the server', () => {
    process.env.PRO_FETCH_PROFILE = 'smart';
    process.env.PRO_FETCH_ENFORCE_PROFILE = 'true';
    expect(() => assertToolAllowed(allTools()[0]!, {})).toThrow(/'smart' profili/);
  });

  it('still enforces the real authorization lists regardless of the profile', () => {
    process.env.PRO_FETCH_PROFILE = 'full';
    delete process.env.PRO_FETCH_ENFORCE_PROFILE;
    process.env.PRO_FETCH_ALLOWED_TOOLS = 'pro_fetch_health_check';
    const other = allTools().find((tool) => tool.name !== 'pro_fetch_health_check');
    expect(() => assertToolAllowed(other!, {})).toThrow(/allowlist/);
    delete process.env.PRO_FETCH_ALLOWED_TOOLS;
    expect(() => assertToolAllowed(other!, {})).not.toThrow();
  });
});

describe('bounded environment parsing', () => {
  it('clamps to the configured range', () => {
    process.env.PRO_FETCH_TEST_BOUND = '9999';
    expect(boundedEnv('PRO_FETCH_TEST_BOUND', 5, 1, 20)).toBe(20);
    process.env.PRO_FETCH_TEST_BOUND = '0';
    expect(boundedEnv('PRO_FETCH_TEST_BOUND', 5, 1, 20)).toBe(5);
    delete process.env.PRO_FETCH_TEST_BOUND;
    expect(boundedEnv('PRO_FETCH_TEST_BOUND', 5, 1, 20)).toBe(5);
    process.env.PRO_FETCH_TEST_BOUND = 'not-a-number';
    expect(boundedEnv('PRO_FETCH_TEST_BOUND', 5, 1, 20)).toBe(5);
  });
});

describe('credentials', () => {
  it('resolves a relative *_FILE path against the package root, not the working directory', async () => {
    // The file lives in the package root while the process runs from an unrelated directory.
    // Only package-root anchoring can resolve it: resolving from the cwd would fail, which is
    // exactly the bug this guards (a stdio server is not started in the package directory).
    const previousCwd = process.cwd();
    const elsewhere = await mkdtemp(path.join(tmpdir(), 'pro-fetch-cwd-'));
    const relative = `.pro-fetch-test-secret-${process.pid}.txt`;
    const target = path.resolve(previousCwd, relative);
    try {
      await writeFile(target, 'secret-value\n', 'utf8');
      process.chdir(elsewhere);
      delete process.env.PRO_FETCH_TEST_SECRET;
      process.env.PRO_FETCH_TEST_SECRET_FILE = relative;
      expect(getCredential('PRO_FETCH_TEST_SECRET')).toBe('secret-value');
    } finally {
      process.chdir(previousCwd);
      delete process.env.PRO_FETCH_TEST_SECRET;
      delete process.env.PRO_FETCH_TEST_SECRET_FILE;
      await rm(elsewhere, { recursive: true, force: true });
      await rm(target, { force: true });
    }
  });

  it('prefers a direct environment value over a file', () => {
    process.env.PRO_FETCH_TEST_DIRECT = 'from-env';
    expect(getCredential('PRO_FETCH_TEST_DIRECT')).toBe('from-env');
    delete process.env.PRO_FETCH_TEST_DIRECT;
  });

  it('never throws when the secret file is missing', () => {
    process.env.PRO_FETCH_TEST_MISSING_FILE = 'does-not-exist-anywhere.txt';
    expect(getCredential('PRO_FETCH_TEST_MISSING')).toBeUndefined();
    delete process.env.PRO_FETCH_TEST_MISSING_FILE;
  });

  it('rejects an oversized secret file instead of reading it', async () => {
    const relative = `.pro-fetch-test-big-${process.pid}.txt`;
    const target = path.resolve(process.cwd(), relative);
    try {
      await writeFile(target, 'x'.repeat(17 * 1024), 'utf8');
      process.env.PRO_FETCH_TEST_BIG_FILE = relative;
      expect(getCredential('PRO_FETCH_TEST_BIG')).toBeUndefined();
    } finally {
      delete process.env.PRO_FETCH_TEST_BIG_FILE;
      await rm(target, { force: true });
    }
  });
});

describe('version single source', () => {
  it('reads the version from package.json instead of a hard-coded literal', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
    expect(USER_AGENT).toBe(`pro-fetch-mcp/${VERSION}`);
  });
});

describe('typed input helpers', () => {
  it('narrows API rows without losing property access', () => {
    expect(pathStr({ a: { b: 'x' } }, 'a.b')).toBe('x');
    expect(pathStr({ a: { b: 'x' } }, 'a.missing', 'fallback')).toBe('fallback');
    expect(pathStr(null, 'a.b')).toBe('');
    expect(pathNum({ n: '42' }, 'n')).toBe(42);
    expect(pathNum({ n: 'oops' }, 'n', 7)).toBe(7);
    expect(asRecordArray([{ a: 1 }, 'skip', null])).toEqual([{ a: 1 }]);
    expect(asRecordArray('not-an-array')).toEqual([]);
  });

  it('exposes a typed view instead of `any`', () => {
    const input = { owner: 'acme', per_page: 10 };
    const p = view(input);
    expect(String(p.owner)).toBe('acme');
    expect(typeof p.per_page).toBe('number');
  });
});

describe('env_check reports file-backed secrets as configured', () => {
  it('reads through the credential resolver instead of raw process.env', async () => {
    // Previously the tool read `process.env` directly, so a `<NAME>_FILE` setup reported the
    // credential as missing even though the server could actually use it.
    const previous = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN_FILE = path.resolve(process.cwd(), '.github-token-test-fixture.txt');
    try {
      await writeFile(path.resolve(process.cwd(), '.github-token-test-fixture.txt'), 'fixture-token\n', 'utf8');
      const result = await dispatch('pro_fetch_env_check', {});
      const text = (result.content ?? []).map((item) => item.text).join('\n');
      expect(result.isError).toBeFalsy();
      expect(text).toContain('GITHUB_TOKEN');
      expect(text).toContain('✅');
    } finally {
      if (previous === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = previous;
      delete process.env.GITHUB_TOKEN_FILE;
      await rm(path.resolve(process.cwd(), '.github-token-test-fixture.txt'), { force: true });
    }
  });
});

describe('dispatch still returns structured errors after the input migration', () => {
  it('wraps a failing tool in the standard error envelope', async () => {
    const result = await dispatch('pro_fetch_tool_execute', { tool_name: 'definitely_not_a_tool' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.ok).toBe(false);
    expect(typeof result.structuredContent?.error?.message).toBe('string');
  });
});
