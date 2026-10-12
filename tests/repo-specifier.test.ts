import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { dispatch } from '../src/core/tool.js';
import { assertGithubInput } from '../src/core/github-input-guard.js';
import type { ToolResult, ToolDefinition } from '../src/core/types.js';

const text = (r: ToolResult): string =>
  (r.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');

/**
 * `repo` is documented as "Repository nomi" in all 42 GitHub tools and in the 24 codehost tools,
 * but the two categories required opposite formats: GitHub's guard rejected `owner/repo` outright
 * while the codehost tools require it. A caller who learned one convention got "'repo' qiymati
 * yaroqsiz repository nomi" from the other, with nothing saying which of the two was wrong.
 *
 * Both forms are now accepted everywhere, and the combined form is validated segment by segment so
 * that allowing the separator cannot admit a traversal.
 */
const githubTool = { category: 'github', name: 'pro_gh_repo_info' } as unknown as ToolDefinition;

describe('repo accepts both owner/repo and a bare name', () => {
  it('rejects a combined form with too many segments', () => {
    // `a/b/c` is an API route, not a repository. Accepting it would forward an unvalidated segment
    // into a URL, so it stays invalid even though it "looks like a path".
    expect(() => assertGithubInput(githubTool, { repo: 'a/b/c' })).toThrow(/yaroqsiz/);
  });

  it('rejects traversal, absolute paths and empty segments', () => {
    for (const repo of ['../etc/passwd', 'a/../../b', '/owner/name', 'owner/', '/', '..', '.']) {
      expect(() => assertGithubInput(githubTool, { repo }), repo).toThrow(/yaroqsiz/);
    }
  });

  it('rejects an owner that is not a legal owner name', () => {
    for (const repo of ['..b/name', 'b b/name', 'owner name/repo']) {
      expect(() => assertGithubInput(githubTool, { repo }), repo).toThrow(/yaroqsiz/);
    }
  });

  it('still accepts a repo whose own name begins with a dot', () => {
    // `.c` is a legal repository name: no separator, so no traversal, and GitHub permits it. Rejecting
    // it would be over-strict rather than safer.
    expect(() => assertGithubInput(githubTool, { repo: 'owner/.c' })).not.toThrow();
  });

  it('normalises the combined form so handlers receive owner and repo separately', () => {
    const input: Record<string, unknown> = { repo: 'nodejs/node' };
    assertGithubInput(githubTool, input);
    // Every handler reads these two fields, so the rewrite is what makes all 42 tools accept it.
    expect(input.owner).toBe('nodejs');
    expect(input.repo).toBe('node');
  });

  it('lets an explicit owner win over the prefix', () => {
    // A caller overriding the prefix means it; silently overwriting it would be surprising.
    const input: Record<string, unknown> = { owner: 'facebook', repo: 'nodejs/node' };
    assertGithubInput(githubTool, input);
    expect(input.owner).toBe('facebook');
    expect(input.repo).toBe('node');
  });

  it('leaves a bare repo name untouched', () => {
    const input: Record<string, unknown> = { owner: 'nodejs', repo: 'node' };
    assertGithubInput(githubTool, input);
    expect(input.owner).toBe('nodejs');
    expect(input.repo).toBe('node');
  });

  it('names both accepted formats when rejecting', () => {
    // An error that does not show the accepted shapes makes the caller guess.
    try {
      assertGithubInput(githubTool, { repo: 'a/b/c' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(String(error)).toMatch(/nodejs\/node/);
      expect(String(error)).toMatch(/owner/);
    }
  });

  it('does not apply the GitHub rules to other categories', () => {
    const codehostTool = {
      category: 'codehost',
      name: 'pro_fetch_codehost_gitlab_repository',
    } as unknown as ToolDefinition;
    expect(() => assertGithubInput(codehostTool, { repo: 'gitlab-org/gitlab' })).not.toThrow();
  });
});

describe('the error names the accepted formats end to end', () => {
  it('reaches the caller through dispatch', async () => {
    const result = await dispatch('pro_gh_repo_info', { repo: 'a/b/c' });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/nodejs\/node/);
  });
});
