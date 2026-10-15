// Regression guard for the schema defect this workstream removed.
//
// Every tool in the GitHub pack used to declare the same 17-18 property block copied from its
// siblings, with `required: []`. Measured before the fix: 40 of 49 tools read at most three of those
// properties, 529 declared properties were unreachable, and all 49 declared no requirements.
//
// The user-visible half of that was worse than untidy. `inputSchema.required` is only advertised to
// the MCP client - nothing in the dispatcher enforces it, which this file pins down separately - so a
// call omitting `owner` reached GitHub and came back 404, telling the caller the repository does not
// exist rather than that the repository was never named.
//
// These assertions fail if either half returns.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { allTools } from '../src/core/tool.js';
import { listTools, callTool } from '../src/router.js';

const github = () => allTools().filter((tool) => tool.category === 'github');

describe('github schema precision', () => {
  it('no tool declares a property its handler never reads', () => {
    // Mirrors scripts/audit-schema.mts, which produces the same measurement across every category.
    // Kept inline rather than imported so this test stays independent of the script it mirrors.
    const offenders: string[] = [];

    for (const tool of github()) {
      const source = String(tool.handler);
      // Composites forward their whole input, so every declared property is reachable by definition.
      if (/runIntegrationTool|runCompositeTool/.test(source)) continue;

      const properties = Object.keys(tool.inputSchema.properties ?? {});
      const dead = properties.filter((property) => {
        const short = property.replace(/_number$/, '');
        return ![property, short, `input.${property}`, `p.${property}`].some((needle) =>
          new RegExp(`\\b${needle.replace(/\./g, '\\.')}\\b`).test(source),
        );
      });

      if (dead.length) offenders.push(`${tool.name}: ${dead.join(',')}`);
    }

    expect(offenders).toEqual([]);
  });

  it('every repository-scoped tool declares a requirement', () => {
    // A tool that takes no required argument at all is the signature of the old blanket block: it
    // means nothing tells the caller what must be supplied.
    //
    // An `anyOf` counts as declaring one. `pro_repo_audit` states its requirement as alternatives -
    // `repository` *or* `owner` + `repo` - because either one addresses the repository, and
    // `required: ['owner','repo']` rejected the spelling its own description invites.
    const offenders = github()
      .filter((tool) => {
        const required = tool.inputSchema.required ?? [];
        const anyOf = tool.inputSchema.anyOf ?? [];
        const declared = Object.keys(tool.inputSchema.properties ?? {});
        return required.length === 0 && anyOf.length === 0 && declared.length > 0;
      })
      .map((tool) => tool.name);

    expect(offenders).toEqual([]);
  });

  it('rejects unspecified properties instead of ignoring them', () => {
    // `ghSchema` sets additionalProperties:false so a typo becomes an error rather than silence.
    for (const tool of github()) {
      expect(tool.inputSchema.additionalProperties, tool.name).toBe(false);
    }
  });

  it('every smart composite still exposes the detail budget knob', () => {
    // `pro_repo_audit` lost this once during the migration because `detail` is a composite contract,
    // not a GitHub addressing property. Keep the assertion so the second loss is caught.
    for (const tool of listTools('smart').filter((t) => t.name !== 'pro_fetch_tool_execute')) {
      const detail = (tool.inputSchema.properties ?? {}).detail as { enum?: string[] } | undefined;
      expect(detail, tool.name).toBeDefined();
      expect(detail!.enum, tool.name).toEqual(['summary', 'full']);
    }
  });
});

describe('the detail knob is implemented, not just declared', () => {
  // `detail` was declared on these three tools and never read, so the caller asked for a smaller
  // response and always got the full one. Each was found by the dead-property audit.

  it('capability_map drops input schemas under summary and keeps them under full', async () => {
    const task = { task: 'arxiv paper search', limit: 6 };
    const text = (result: { content?: { text: string }[] }) =>
      (result.content ?? []).map((entry) => entry.text).join(' ');

    const summary = await callTool('pro_capability_map', { ...task, detail: 'summary' });
    const full = await callTool('pro_capability_map', { ...task, detail: 'full' });

    expect(text(summary)).toContain('"detail": "summary"');
    expect(text(full)).toContain('"detail": "full"');
    // The flag is the precise assertion. A size ratio is not: `suggested_call` stays the same size
    // either way, and the word "inputSchema" still appears once inside the `how_to_call` prose, so
    // both would misreport what actually changed.
    expect(text(summary)).toContain('"schemas_included": false');
    expect(text(full)).toContain('"schemas_included": true');
    expect(text(summary).length).toBeLessThan(text(full).length * 0.7);
  });

  it('capability_map keeps schemas by default, because a discovery call exists to return them', async () => {
    // Regression guard: routing the default through `detailMode` made every unset call a summary
    // and silently stripped the schemas. `tests/smart-system-quality.test.ts` caught it; this states
    // the rule locally so the cause is obvious if it happens again.
    const text = (result: { content?: { text: string }[] }) =>
      (result.content ?? []).map((entry) => entry.text).join(' ');

    const byDefault = await callTool('pro_capability_map', { task: 'arxiv paper search', limit: 6 });
    expect(text(byDefault)).toContain('"schemas_included": true');
    expect(text(byDefault)).toContain('inputSchema');
  });

  it('capability_map lets an explicit include_schema override the summary default', async () => {
    const text = (result: { content?: { text: string }[] }) =>
      (result.content ?? []).map((entry) => entry.text).join(' ');
    const forced = await callTool('pro_capability_map', {
      task: 'arxiv paper search',
      limit: 6,
      detail: 'summary',
      include_schema: true,
    });
    expect(text(forced)).toContain('"schemas_included": true');
    expect(text(forced)).toContain('inputSchema');
  });

  it('capability_map still honours an explicit include_schema:false under full', async () => {
    const text = (result: { content?: { text: string }[] }) =>
      (result.content ?? []).map((entry) => entry.text).join(' ');
    const without = await callTool('pro_capability_map', {
      task: 'arxiv paper search',
      limit: 6,
      include_schema: false,
    });
    expect(text(without)).toContain('"schemas_included": false');
  });

  it('capability_call trims successful output under summary but never hides an error', async () => {
    const calls = [
      { tool: 'pro_gh_repo_readme', arguments: { owner: 'facebook', repo: 'react' } },
      { tool: 'pro_gh_repo_readme', arguments: { owner: 'definitely-not-a-real-owner-xyz', repo: 'nope' } },
    ];
    const text = (result: { content?: { text: string }[] }) =>
      (result.content ?? []).map((entry) => entry.text).join(' ');

    const summary = await callTool('pro_capability_call', { calls, detail: 'summary' });
    const full = await callTool('pro_capability_call', { calls, detail: 'full' });

    const summaryText = text(summary);
    expect(summaryText).toContain('"detail": "summary"');
    expect(summaryText.length).toBeLessThan(text(full).length);
    // The successful step's body is dropped...
    expect(summaryText).not.toContain('facebook/react');
    // ...but the failing step still explains itself, and both steps are still accounted for.
    expect(summaryText).not.toContain('"output"');
    expect(summaryText).toContain('"error"');
    expect(summaryText).toContain('"total": 2');
  });
});

describe('github missing-input handling', () => {
  it('names the omitted argument instead of letting the request reach GitHub', async () => {
    // Regression: with `required` unenforced, `{}` produced "/repos/undefined/undefined" and a 404
    // that read as "repository not found". The message must name what is missing.
    //
    // `pro_gh_code_search` is excluded: it checks for GITHUB_TOKEN before anything else, so on a host
    // without a token it reports the credential, which is correct - the tool genuinely cannot run.
    // Argument presence is asserted for it in the schema test above instead.
    const cases: [string, Record<string, unknown>, string[]][] = [
      ['pro_gh_repo_readme', {}, ['owner', 'repo']],
      ['pro_gh_repo_readme', { owner: 'facebook' }, ['repo']],
      ['pro_gh_repo_info', {}, ['owner', 'repo']],
      ['pro_gh_repo_file_read', { owner: 'facebook', repo: 'react' }, ['path']],
      ['pro_gh_issue_read', { owner: 'facebook', repo: 'react' }, ['issue_number']],
      ['pro_gh_pr_read', { owner: 'facebook', repo: 'react' }, ['pr_number']],
      ['pro_gh_repo_search', {}, ['query']],
      ['pro_gh_user_profile', {}, ['user']],
      ['pro_gh_gist_read', {}, ['gist_id']],
      ['pro_gh_org_repos', {}, ['org']],
    ];

    for (const [tool, args, expected] of cases) {
      const result = await callTool(tool, args);
      const text = (result.content ?? []).map((entry) => entry.text).join(' ');
      expect(result.isError, `${tool} ${JSON.stringify(args)}`).toBe(true);
      expect(text, `${tool} ${JSON.stringify(args)}`).toMatch(/majburiy argumentlar berilmadi/);
      for (const name of expected) {
        expect(text, `${tool} ${JSON.stringify(args)} should name ${name}`).toContain(name);
      }
    }
  });

  it('rejects a blank value as absent rather than forwarding it', async () => {
    // `owner: '   '` is truthy in JavaScript and would reach the API as a blank path segment,
    // producing the same 404 this work removed. Either rejection is correct; forwarding is not.
    for (const args of [
      { owner: '   ', repo: 'react' },
      { owner: 'facebook', repo: '  ' },
    ]) {
      const result = await callTool('pro_gh_repo_readme', args);
      const text = (result.content ?? []).map((entry) => entry.text).join(' ');
      expect(result.isError, JSON.stringify(args)).toBe(true);
      expect(text).toMatch(/yaroqsiz|majburiy/);
      // The failure must be local: no GitHub 404 is what distinguishes this from the old behaviour.
      expect(text).not.toContain('GitHub 404');
    }
  });

  // A "and it still works" assertion against live GitHub is deliberately absent. It was written, and
  // it flaked on a transient upstream failure while every local assertion stayed green — which is
  // the signature of a test measuring the network, not this code. The guard's own behaviour is fully
  // covered above: each case fails locally, names the omitted argument, and never reaches a 404.
});
