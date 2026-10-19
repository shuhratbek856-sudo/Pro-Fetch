// Regression guard: `assertNoUnknownArguments` used to return early for any tool whose declared
// `properties` list was empty, so a tool with `additionalProperties: false` and no declared properties
// accepted every argument passed to it.
//
// Measured before the fix: 17 of the 18 schema-less tools accepted
// `totally_bogus_argument: 'x'` silently and ran normally. That is the failure mode the function
// exists to prevent — a caller who misspells a key gets a successful-looking result and no reason to
// suspect the argument was never read.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import '../src/loader.js';
import { allTools } from '../src/core/tool.js';
import { dispatch } from '../src/core/tool.js';
import type { ToolResult } from '../src/core/types.js';

const tool = (name: string) => {
  const found = allTools().find((candidate) => candidate.name === name);
  if (!found) throw new Error(`tool not registered: ${name}`);
  return found;
};

const textOf = (result: ToolResult): string =>
  (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('\n');

let workspace: string;

beforeAll(async () => {
  process.env.PRO_FETCH_PROFILE = 'full';
  workspace = mkdtempSync(path.join(tmpdir(), 'pf-unknown-args-'));
  process.env.PRO_FETCH_OUTPUT_ROOT = workspace;
  process.env.PRO_FETCH_CACHE_DIR = workspace;
});

afterAll(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('a tool with no declared properties refuses arguments', () => {
  it.each([
    'pro_fetch_config_get',
    'pro_fetch_rate_limit_status',
    'pro_fetch_proxy_status',
    'pro_fetch_health_check',
    'pro_fetch_usage_stats',
    'pro_fetch_env_check',
    'pro_fetch_cache_clear',
    'pro_fetch_session_list',
    'pro_llm_providers',
    'pro_fetch_knowledge_stats',
  ])('%s rejects a bogus argument', async (name) => {
    const candidate = tool(name);
    const declared = Object.keys(candidate.inputSchema.properties ?? {});
    expect(declared, `${name} bo'sh properties bilan keldi`).toEqual([]);
    expect(candidate.inputSchema.additionalProperties).toBe(false);

    const result = await dispatch(name, { totally_bogus_argument: 'x' });
    const text = textOf(result);
    expect(result.isError, `${name} xato qaytarishi kerak`).toBe(true);
    expect(text, `${name} "e'lon qilinmagan argument" deyishi kerak`).toMatch(/e’lon qilinmagan argument/);
  });

  it('it still runs when called with no arguments at all', async () => {
    // The refusal is for *unknown* arguments. An empty call is a different contract, governed by
    // `required`, and for these tools it is satisfiable by an empty object.
    const result = await dispatch('pro_fetch_config_get', {});
    expect(result.isError ?? false).toBe(false);
  });
});

describe('the refusal is not a blanket ban on arguments', () => {
  it('a declared argument is accepted', async () => {
    // `pro_fetch_security_npm_audit` declares `cwd` and `global`; both must still be accepted, or the
    // fix has over-reached into rejecting the tool's own contract.
    const result = await dispatch('pro_fetch_security_npm_audit', { cwd: workspace, global: true });
    const text = textOf(result);
    expect(text).not.toMatch(/e’lon qilinmagan argument/);
  });

  it('every schema-less tool in the registry refuses a bogus argument', async () => {
    // Swept rather than spot-checked. The bug was an early return keyed on the *shape* of the schema,
    // so it applied to every tool with zero declared properties, and a list of ten names cannot see a
    // twelfth.
    const schemaLess = allTools().filter(
      (candidate) => Object.keys(candidate.inputSchema.properties ?? {}).length === 0,
    );
    expect(schemaLess.length, "kamida bir bo'sh properties tool kerak").toBeGreaterThan(0);
    for (const candidate of schemaLess) {
      const result = await dispatch(candidate.name, { totally_bogus_argument: 'x' });
      expect(result.isError, `${candidate.name} e'lon qilinmagan argumentni rad etishi kerak`).toBe(true);
      expect(textOf(result), `${candidate.name} sababni yozishi kerak`).toMatch(/e’lon qilinmagan argument/);
    }
  });
});

describe('no key is exempt from the unknown-argument check', () => {
  // The check used to exempt `tool`, `arguments` and `label` on the assumption that the meta-executor
  // envelope reaches the tool. Measured: no tool in the registry declares `tool` or `label`, and
  // `arguments` is declared by exactly one — `pro_fetch_tool_execute` — which needs no exemption
  // because a declared property is allowed anyway. The list therefore exempted nothing and hid three
  // typos: `arguments` and `label` on any tool were accepted and silently dropped, which is the
  // failure this function exists to prevent.
  it('no tool declares `tool` or `label`', () => {
    const declaring = allTools().filter((candidate) => {
      const properties = Object.keys(candidate.inputSchema.properties ?? {});
      return properties.includes('tool') || properties.includes('label');
    });
    expect(declaring.map((candidate) => candidate.name)).toEqual([]);
  });

  it.each(['arguments', 'label', 'tool'])('%s is refused on an ordinary tool', async (key) => {
    const result = await dispatch('pro_fetch_xml_to_json', { text: '<a>1</a>', [key]: 'x' });
    expect(result.isError, `${key} rad etilishi kerak edi`).toBe(true);
    expect(textOf(result)).toMatch(/e’lon qilinmagan argument/);
  });

  it('the meta-executor still works, because it unwraps the envelope itself', async () => {
    // `pro_capability_call` reads `record.arguments` and passes that object to the inner tool, and
    // `pro_fetch_tool_execute` reads `input.arguments` the same way, so the envelope keys never reach
    // a tool's input and the exemption was never needed.
    const execute = await dispatch('pro_fetch_tool_execute', {
      tool_name: 'pro_fetch_xml_to_json',
      arguments: { text: '<a>1</a>' },
    });
    expect(execute.isError).toBeFalsy();

    const batch = await dispatch('pro_capability_call', {
      calls: [{ tool: 'pro_fetch_xml_to_json', arguments: { text: '<a>1</a>' } }],
    });
    expect(batch.isError).toBeFalsy();
    expect(textOf(batch)).toMatch(/"ok":\s*1/);
  });

  it('an unknown argument inside a batch call is still refused', async () => {
    const batch = await dispatch('pro_capability_call', {
      calls: [{ tool: 'pro_fetch_xml_to_json', arguments: { text: '<a>1</a>', bogus: 1 } }],
    });
    expect(textOf(batch)).toMatch(/"failed":\s*1/);
  });
});
