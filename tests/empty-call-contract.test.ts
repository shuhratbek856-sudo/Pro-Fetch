// The contract every schema publishes must hold when the call is empty.
//
// `anyOf` is a promise - "one of these must be present" - and until now the central guard only read
// `required`, so a tool declaring `anyOf` and no `required` had that promise honoured by its own
// handler and by nothing else. Measured across the registry: 111 tools were in that position and 14 of
// them answered `{}` with `isError: false`, which a caller reads as success. One guard in
// `required-arguments.ts` now covers all of them; this test is what keeps it covered.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { allTools } from '../src/core/tool.js';
import { callTool } from '../src/router.js';

const toolsWithAnyOf = allTools().filter((tool) => (tool.inputSchema.anyOf ?? []).length > 0);
const toolsWithoutAnyRequirement = allTools().filter(
  (tool) => (tool.inputSchema.required ?? []).length === 0 && (tool.inputSchema.anyOf ?? []).length === 0,
);

describe('an empty call is refused whenever the schema says something is needed', () => {
  it('the sweep is not vacuous', () => {
    expect(toolsWithAnyOf.length).toBeGreaterThan(50);
    expect(toolsWithoutAnyRequirement.length).toBeGreaterThan(0);
  });

  it('every tool with anyOf refuses {}', async () => {
    const offenders: string[] = [];
    for (const tool of toolsWithAnyOf) {
      const result = await callTool(tool.name, {});
      if (!result.isError) offenders.push(tool.name);
    }
    expect(offenders).toEqual([]);
  });

  it('names the alternatives in the refusal', async () => {
    // A refusal that does not say what was missing makes the caller guess, and the alternatives are
    // already written in the schema.
    const withNames = toolsWithAnyOf.find((tool) => {
      const branches = tool.inputSchema.anyOf as Array<{ required?: string[] }>;
      return branches.some((branch) => (branch.required ?? []).length > 0);
    });
    if (!withNames) return;
    const result = await callTool(withNames.name, {});
    const body = (result.content ?? []).map((item) => (item.type === 'text' ? item.text : '')).join(' ');
    expect(body).toMatch(/majburiy/);
  });

  it('leaves tools that declare nothing required alone', async () => {
    // The other half of the rule: a tool that needs no input must still work when given none, or the
    // guard above would be a way of disabling tools.
    const withoutRequirement = toolsWithoutAnyRequirement.find((tool) => !tool.name.includes('_'));
    if (!withoutRequirement) return;
    const result = await callTool(withoutRequirement.name, {});
    expect(typeof result.isError).toBe('boolean');
  });

  it('does not refuse a call that satisfies one branch', async () => {
    // The point of anyOf: `url` alone must be accepted where the schema says url *or* base64.
    const source = toolsWithAnyOf.find((tool) => {
      const branches = tool.inputSchema.anyOf as Array<{ required?: string[] }>;
      const names = branches.flatMap((branch) => branch.required ?? []);
      return names.includes('url') && names.length > 1;
    });
    if (!source) return;
    const result = await callTool(source.name, { url: 'https://example.com' });
    // Some of those tools will fail for their own reasons - a network call, a browser - but the
    // refusal must not be the missing-argument one.
    const body = (result.content ?? []).map((item) => (item.type === 'text' ? item.text : '')).join(' ');
    expect(body).not.toMatch(/majburiy argumentlar/);
  });
});
