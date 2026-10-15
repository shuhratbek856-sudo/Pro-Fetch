// Regression guard for the vocabulary narrowing and the alternatives it must not break.
//
// `src/core/schema-narrowing.ts` removes a category-vocabulary property when a tool's resolved source
// never reads it. That is a change to a published contract with `additionalProperties: false` beneath
// it: a property removed while still read turns a working call into a validation error.
//
// These assertions cover the three ways that could go wrong, and each one exists because it did.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { allTools } from '../src/core/tool.js';
import { callTool } from '../src/router.js';

const tool = (name: string) => {
  const found = allTools().find((candidate) => candidate.name === name);
  if (!found) throw new Error(`tool not registered: ${name}`);
  return found;
};

const properties = (name: string) => Object.keys(tool(name).inputSchema.properties ?? {});

describe('category vocabulary is narrowed to what the code reads', () => {
  it('pro_fetch_crawl_speed advertises only its concurrency and delay settings', () => {
    // Reads `url`, `start_url`, `delay_ms`, `concurrency`. It used to advertise the whole crawl
    // vocabulary, `selector` and `xpath` and `output_path` among them.
    const declared = properties('pro_fetch_crawl_speed');
    expect(declared.sort()).toEqual(['concurrency', 'delay_ms', 'start_url', 'url']);
    expect(declared).not.toContain('selector');
    expect(declared).not.toContain('output_path');
  });

  it('keeps a property that is read between branches rather than inside one', () => {
    // `runBrowserTool` reads `const selector = string(input, 'selector')` on the line *before*
    // `if (name === 'browser_click')`. A resolver that only looked inside the branch concluded the
    // tool does not read `selector`, and narrowing would have stripped the one argument it cannot
    // work without.
    const declared = properties('pro_browser_browser_click');
    expect(declared).toContain('selector');
    expect(tool('pro_browser_browser_click').inputSchema.required).toEqual(['selector']);
  });

  it('never drops a property a required list names', () => {
    // The invariant behind the whole pass: `required` and every `anyOf` alternative survive.
    const offenders: string[] = [];
    for (const candidate of allTools()) {
      const schema = candidate.inputSchema as {
        properties?: Record<string, unknown>;
        required?: string[];
        anyOf?: Array<{ required?: string[] }>;
      };
      const declared = Object.keys(schema.properties ?? {});
      const needed = new Set<string>(schema.required ?? []);
      for (const alternative of schema.anyOf ?? []) for (const key of alternative.required ?? []) needed.add(key);
      for (const key of needed) if (!declared.includes(key)) offenders.push(`${candidate.name}: ${key}`);
    }
    expect(offenders).toEqual([]);
  });

  it('leaves a tool it cannot resolve with its full vocabulary', () => {
    // Failing closed matters more than failing tidy: an unresolved tool keeps advertising everything,
    // because a too-wide schema misleads and a too-narrow one breaks.
    const unresolved = properties('pro_fetch_codehost_gitlab_issues');
    expect(unresolved.length).toBeGreaterThan(3);
  });
});

describe('alternatives are stated as anyOf, not as required', () => {
  it('the extract tools declare url-or-text', () => {
    // All fourteen resolve through `sourceFrom(input)`, which refuses with "url yoki text talab
    // qiladi" when given neither. Their schemas said `required: []` and no `anyOf`, so the caller had
    // no way to learn a source was expected until the call failed.
    for (const name of [
      'pro_fetch_css_select',
      'pro_fetch_json_path',
      'pro_fetch_json_ld_extract',
      'pro_fetch_regex_extract',
      'pro_fetch_email_extract',
      'pro_fetch_link_classify',
      'pro_fetch_main_content_detect',
      'pro_fetch_form_extract',
      'pro_fetch_list_extract',
      'pro_fetch_comment_strip',
      'pro_fetch_footnote_extract',
      'pro_fetch_schema_org_extract',
      'pro_fetch_table_to_dataframe',
      'pro_page_diff',
    ]) {
      const schema = tool(name).inputSchema;
      expect(schema.required, name).toBeUndefined();
      expect(schema.anyOf, name).toEqual([{ required: ['url'] }, { required: ['text'] }]);
    }
  });

  it('accepts either branch and still needs a URL', async () => {
    // A tool that cannot work without a URL: one branch is a dead end, so the guard has to stand.
    const noInput = await callTool('pro_fetch_css_select', {});
    expect(noInput.isError).toBe(true);

    const text = (result: { content?: { text: string }[] }) =>
      (result.content ?? []).map((entry) => entry.text).join(' ');

    const fromText = await callTool('pro_fetch_css_select', { text: '<h1>Hi</h1>', selector: 'h1' });
    expect(fromText.isError).toBeFalsy();
    expect(text(fromText)).toContain('Hi');
  });

  it('requires the caller to choose an action for browser_action', async () => {
    // The other 40 browser tools inject their own action or dispatch on the tool name, so this is the
    // only one where the caller must supply it.
    expect(tool('pro_browser_browser_action').inputSchema.required).toEqual(['action']);
    const result = await callTool('pro_browser_browser_action', {});
    expect(result.isError).toBe(true);
  });
});

describe('a per-tool property list does not replace what the tool declared', () => {
  it('keeps properties the handler reads that the list omitted', () => {
    // `AUTH_TOOL_PROPERTIES.pro_fetch_bearer_fetch` lists six names. The handler also reads `body`
    // and `max_chars`, which were dropped because a specific list suppressed the union with the
    // tool's own declarations - so a POST body could not be sent to an authenticated endpoint
    // without going around the schema.
    const declared = properties('pro_fetch_bearer_fetch');
    expect(declared).toContain('body');
    expect(declared).toContain('max_chars');
  });

  it('honours every alternative the auth schema advertises', async () => {
    // `AUTH_TOOL_REQUIREMENTS` states `token | bearer_token | key_name`, and `runIntegrationTool`
    // reads `str(input, 'token', 'bearer_token')`. The handler read only `input.token`, so sending
    // `bearer_token` - exactly what the schema invites - failed with "token ёки мавжуд key_name
    // керак". Both spellings are exercised here so the advertised contract stays true.
    const text = (result: { content?: { text: string }[] }) =>
      (result.content ?? []).map((entry) => entry.text).join(' ');

    const viaToken = await callTool('pro_fetch_bearer_fetch', {
      url: 'https://example.com',
      token: 'secret',
    });
    expect(viaToken.isError).toBeFalsy();

    const viaBearerToken = await callTool('pro_fetch_bearer_fetch', {
      url: 'https://example.com',
      bearer_token: 'secret',
    });
    expect(viaBearerToken.isError).toBeFalsy();
    expect(text(viaBearerToken)).toContain('"status"');
  });
});
