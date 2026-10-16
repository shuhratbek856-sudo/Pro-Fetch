// Locks the invariants fixed in sessions 40-41, none of which had a test.
//
// Each of these was a tool that reported a failure as a success, which is the failure mode that has
// cost the most time in this project: `pro_site_scan` reporting 0/7 with `isError: false`, ollama
// reported `ready: true` while calls went to OpenAI, 240 tools accepting an argument they never read,
// `issues_search` returning 422 for every call, and a directory holding 23 subdirectories announcing
// itself as empty.
//
// A test that only asserts a function exists would have passed while all five were broken, because all
// five are well-formed returns rather than crashes. Each case here asserts the *failure* is reported,
// because that is the part that was missing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import { splitModel } from '../src/core/llm-gateway.js';
import { MAX_MODE_CEILING } from '../src/core/mode.js';
import { assertNoUnknownArguments } from '../src/core/required-arguments.js';
import { buildIssueQuery } from '../src/tools/github/issues_search.js';
import { renderDirectoryListing } from '../src/tools/github/repo_directory_read.js';
import type { ToolResult } from '../src/core/types.js';

const ORIGINAL = { ...process.env };
beforeEach(() => {
  process.env = { ...ORIGINAL };
  process.env.PRO_FETCH_PROFILE = 'full';
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

const text = (result: ToolResult): string =>
  (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');

describe('a model name that names a provider reaches that provider', () => {
  it('routes a provider prefix', () => {
    expect(splitModel('', 'ollama/llama3')).toEqual({ provider: 'ollama', model: 'llama3' });
  });

  it('treats a bare provider name as the provider', () => {
    // `model: "ollama"` used to fall through to the default provider and return an OpenAI 401.
    expect(splitModel('', 'ollama')).toEqual({ provider: 'ollama', model: '' });
  });

  it('leaves a slash inside a real model name alone', () => {
    // Load-bearing: Ollama and OpenRouter both serve names containing slashes. Splitting these would
    // break every OpenAI-compatible endpoint.
    expect(splitModel('', 'meta-llama/Llama-3-8B')).toEqual({
      provider: '',
      model: 'meta-llama/Llama-3-8B',
    });
  });

  it('reports a disagreement instead of silently overriding', () => {
    const result = splitModel('openai', 'ollama/llama3');
    expect(result.provider).toBe('ollama');
    expect(result.conflict).toMatch(/mos emas/);
  });

  it('never sends an ollama model to a remote provider', async () => {
    // The failure being locked: the status tool said ready, the calling tool went elsewhere.
    const result = await callTool('pro_llm_complete', { model: 'ollama/llama3', prompt: 'x' });
    expect(text(result)).not.toMatch(/OpenAI/);
  });
});

describe('a readiness report predicts the next call', () => {
  it('does not report a provider as ready when the guard will refuse it', async () => {
    // Ollama is on loopback and the SSRF guard blocks loopback. Reporting it ready was the same lie as
    // before, one call later.
    const report = text(await callTool('pro_llm_providers', {}));
    const ollama = report.slice(report.indexOf('"ollama"'));
    expect(ollama.slice(0, 120)).toMatch(/"ready":\s*false/);
    expect(report).toMatch(/loopback|SSRF/);
  });
});

describe('an undeclared argument is refused', () => {
  it('names the likely intended key', () => {
    // 240 of 605 tools accepted `max_tokns` with isError: false, so a misspelling looked like a
    // successful call and nothing suggested the argument was never read.
    expect(() =>
      assertNoUnknownArguments(
        {
          name: 'demo',
          inputSchema: { additionalProperties: false, properties: { max_tokens: {} } },
        },
        { max_tokns: 5 },
      ),
    ).toThrow(/max_tokns.*->.*max_tokens/);
  });

  it('refuses a real tool', async () => {
    const result = await callTool('pro_llm_chat', { model: 'x', prompt: 'y', nonsense: true });
    expect(result.isError).toBeTruthy();
    expect(text(result)).toMatch(/e’lon qilinmagan argument/);
  });

  it('leaves a call with only declared arguments alone', async () => {
    // No credential here, so the call itself fails - what must not happen is the unknown-argument
    // refusal. Asserting isError === false would be asserting a network call succeeds.
    const result = await callTool('pro_llm_chat', { model: 'x', prompt: 'y', max_tokens: 64 });
    expect(text(result)).not.toMatch(/e�lon qilinmagan/);
  });
});

/**
 * These two were originally checked by calling GitHub, on the reasoning that a live call is the only
 * evidence. It is not: the defects were in how a request string and a heading are *built*, and both are
 * now exported pure functions, so the exact text sent to GitHub can be asserted with no network at all.
 *
 * That matters more than it sounds. The live version failed with `GitHub 403: API rate limit exceeded`
 * - measured: 0 of 60 anonymous requests left - which says nothing about the behaviour, and the only way
 * to stop the suite reporting that failure was to stop checking the behaviour. A test that needs a
 * third party's quota to run is a test that silently stops running.
 */
describe('issue search satisfies the API it calls', () => {
  it('adds is:issue when the caller has not chosen', () => {
    // Without this, every call returned 422 and the tool could not search anything at all.
    expect(buildIssueQuery('o', 'r', 'test')).toBe('repo:o/r test is:issue');
  });

  it('keeps is:pr, because rewriting it would return the wrong set and look right', () => {
    expect(buildIssueQuery('o', 'r', 'is:pr test')).toBe('repo:o/r is:pr test');
    expect(buildIssueQuery('o', 'r', 'is:issue test')).toBe('repo:o/r is:issue test');
    expect(buildIssueQuery('o', 'r', 'is:project x')).toBe('repo:o/r is:project x');
  });

  it('trims the query rather than sending the padding on', () => {
    expect(buildIssueQuery('o', 'r', '  bug  ')).toBe('repo:o/r bug is:issue');
  });
});

describe('a directory that holds only subdirectories does not report itself empty', () => {
  it('lists them when there are no files', () => {
    // src/tools holds 23 subdirectories and no files. Reporting only the count made it look empty.
    const body = renderDirectoryListing('src/tools', 0, ['a', 'b']);
    expect(body).toContain('0 fayl');
    expect(body).toContain('2 ta subdirektoriya');
    expect(body).toContain('yuqoridagi subdirektoriyalarga boring');
  });

  it('says so even when files are present too', () => {
    const body = renderDirectoryListing('src/core', 20, ['a']);
    expect(body).toContain('20 fayl');
    expect(body).toContain('1 ta subdirektoriya');
    // The "go into a subdirectory" note would be wrong when there are files to read here.
    expect(body).not.toContain('yuqoridagi subdirektoriyalarga boring');
  });

  it('adds nothing when there are no subdirectories', () => {
    // Not an equality check on the whole line: the separator is an em dash and writing it twice in two
    // files is how the two drifted apart in the first place. What matters is that a directory with no
    // subdirectories gains no note at all.
    const plain = renderDirectoryListing('tests', 3, []);
    expect(plain).toContain('tests');
    expect(plain).toContain('3 fayl');
    expect(plain).not.toContain('subdirektoriya');
  });
});

describe('a zero result says why it is zero', () => {
  it('never reports a bare zero without saying why', async () => {
    // Environment-independent on purpose. Which directory resolves depends on how .env loaded, so the
    // assertion is the invariant rather than one call: a result of 0 must be either an error naming
    // the directory, or a result carrying a note. A bare { count: 0, packages: [] } is the defect.
    for (const cwd of [process.env.PRO_FETCH_WORKSPACE, 'C:\\Users\\user\\Documents']) {
      const body = text(await callTool('pro_fetch_security_license_report', { cwd }));
      const bare = /"count":\s*0[^}]*"packages":\s*\[\]/.test(body) && !/note/.test(body);
      expect(bare, body.slice(0, 120)).toBe(false);
    }
  });
});

describe('the mode ceiling is the documented number', () => {
  it('holds ten nines', () => {
    expect(MAX_MODE_CEILING).toBe(9_999_999_999);
  });
});
