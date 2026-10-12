import { describe, it, expect, afterEach } from 'vitest';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import '../src/loader.js';
import { allTools, dispatch } from '../src/core/tool.js';
import type { ToolResult } from '../src/core/types.js';

const text = (r: ToolResult): string =>
  (r.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');

/**
 * Windows treats `npm`, `npx`, `yarn` and `pnpm` as batch scripts, not executables.
 *
 * `execFile` cannot launch either form: asking for `npm` fails with ENOENT because no extension is
 * resolved, and asking for `npm.cmd` fails with EINVAL because Node refuses to spawn a batch file.
 * Both were verified on Windows 11 with Node 24. Every npm-backed tool — audit, outdated, list,
 * package info, license report — was therefore dead on Windows, which is a large share of MCP users,
 * and the failure was reported as "command not found", sending people to install something they
 * already had.
 */
describe('package-manager tools work on Windows', () => {
  afterEach(() => {
    rmSync('npm-tool-test', { recursive: true, force: true });
  });

  it('resolves npm through its JavaScript entry point rather than a batch shim', async () => {
    const result = await dispatch('pro_fetch_devops_npm_list', {});
    const body = text(result);

    // Whatever the platform, this must not be the "missing executable" failure — npm is installed,
    // it is the spawn mechanism that was broken.
    expect(body, 'npm must not be reported as missing').not.toMatch(/COMMAND_NOT_FOUND/);
    expect(body, 'npm must not hit the Windows shim error').not.toMatch(/COMMAND_SHIM_UNUSABLE/);

    if (process.platform === 'win32') {
      // Proves the fix rather than the absence of a problem: the run reached npm and read a manifest.
      // The payload is nested inside a JSON block, so its quotes arrive escaped.
      expect(body).toMatch(/\\?"name\\?"/);
      expect(body).toMatch(/\\?"version\\?"/);
    }
  }, 60_000);

  it('reads a real dependency tree with the license report', async () => {
    const result = await dispatch('pro_fetch_security_license_report', {});
    expect(text(result)).not.toMatch(/COMMAND_NOT_FOUND/);
  }, 60_000);

  it('keeps the tool output when a command exits non-zero', async () => {
    // `npm audit` exits 1 when it finds vulnerabilities. That is a finding, not a failure, and the
    // report is written to stdout — so an error handler that reads only stderr throws away the exact
    // thing the caller asked for.
    const result = await dispatch('pro_fetch_devops_npm_audit', {});
    const body = text(result);
    if (result.isError === true) {
      expect(body, 'a failed command must still surface its output').not.toMatch(
        /^.*COMMAND_FAILED\S*: Command failed: $/,
      );
      expect(body.length, 'the report must not be discarded').toBeGreaterThan(60);
    } else {
      expect(body.length).toBeGreaterThan(60);
    }
  }, 90_000);

  it('a missing binary is still reported as missing', async () => {
    // The Windows fix must not have turned "not installed" into something vaguer.
    mkdirSync('npm-tool-test', { recursive: true });
    writeFileSync('npm-tool-test/.keep', '');
    const result = await dispatch('pro_fetch_devops_docker_ps', {});
    const body = text(result);
    if (/COMMAND_NOT_FOUND/.test(body)) {
      expect(body).toMatch(/docker/);
      expect(body).toMatch(/https:\/\/docs\.docker\.com/);
    }
  }, 60_000);
});

describe('a merge with nothing to merge says so', () => {
  it('refuses an empty list instead of returning an empty string', async () => {
    const result = await dispatch('pro_fetch_merge_results', { items: [] });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/bo‘sh/);
  });

  it('reports how many entries were blank', async () => {
    const result = await dispatch('pro_fetch_merge_results', { items: ['a', '', '  ', 'b'] });
    expect(result.isError).toBeFalsy();
    // Otherwise a caller cannot tell "nothing was merged" from "everything merged was blank".
    expect(text(result)).toMatch(/2 ta element bo‘sh/);
  });
});
