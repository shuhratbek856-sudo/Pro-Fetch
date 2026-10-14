// Regression guard for the declared-vs-implemented mismatch in the delegating tools.
//
// Twenty tools declare a schema and then delegate to `runIntegrationTool`, which switches on the tool
// name and reads a specific set of fields. Two of those groups had requirements that did not match
// what the code reads, and because the schema is all the caller has, the mismatch was a silent
// no-op rather than an error:
//
//   - Six i18n tools required `target_lang` they never read. `script_convert` and `transliterate`
//     read `to_script` / `target_script` instead, so a caller who followed the schema and sent
//     `target_lang: 'ru'` got "Hello" back unchanged - no error, no conversion.
//   - `to_script`, `from_lang`, `to_lang` and `html` were accepted by the code but absent from the
//     published schema, so a conforming caller could not name them.
//   - Six apitest tools required `url`; five of them also accept an inline document, and
//     `json_schema_infer` never looks at a URL at all.
//   - `openapi_try` sat after the `bodyFor` call, so calling an endpoint demanded a specification
//     document whose contents the tool then discarded.
//
// These assertions fail if any of that returns.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { allTools } from '../src/core/tool.js';
import { callTool } from '../src/router.js';

const text = (result: { content?: { text: string }[] }) => (result.content ?? []).map((entry) => entry.text).join(' ');

const tool = (name: string) => {
  const found = allTools().find((candidate) => candidate.name === name);
  if (!found) throw new Error(`tool not registered: ${name}`);
  return found;
};

describe('i18n requirements match what the dispatcher reads', () => {
  it('does not demand a target language from tools that never read one', () => {
    // `str(input, 'text', 'content', 'html')` is the whole of their input handling.
    for (const name of [
      'pro_fetch_locale_detect',
      'pro_fetch_rtl_normalize',
      'pro_fetch_i18n_strings_extract',
      'pro_fetch_mixed_lang_split',
    ]) {
      expect(tool(name).inputSchema.required, name).toEqual(['text']);
    }
  });

  it('does not require a script, because a script is optional', () => {
    // `convertScript` defaults to latin, so `{ text }` alone is a valid call. An earlier version of
    // this file required `target_script`, which broke the `to_script` alias that
    // `tests/handler-regression.test.ts` uses - caught by that suite, corrected here.
    for (const name of ['pro_fetch_script_convert', 'pro_fetch_transliterate']) {
      expect(tool(name).inputSchema.required, name).toEqual(['text']);
    }
  });

  it('explains that a language code is not a script, instead of silently doing nothing', async () => {
    // The actual harm: `target_lang: 'ru'` used to default to latin and return "Hello" unchanged,
    // with no error - a result that looked successful and was not.
    const result = await callTool('pro_fetch_script_convert', { text: 'Hello', target_lang: 'ru' });
    expect(result.isError).toBeFalsy();
    // The refusal is in the body rather than isError, because this tool reports its refusals that way.
    const body = text(result);
    expect(body).not.toBe('Hello');
    expect(body).toContain('to_script');
  });

  it('still accepts the to_script alias', async () => {
    const viaAlias = await callTool('pro_fetch_script_convert', { text: 'salom', to_script: 'cyrillic' });
    const viaCanonical = await callTool('pro_fetch_script_convert', { text: 'salom', target_script: 'cyrillic' });
    expect(viaAlias.isError).toBeFalsy();
    expect(text(viaAlias)).toBe(text(viaCanonical));
    expect(text(viaAlias)).not.toBe('salom');
  });

  it('asks translate_page for a url rather than text', () => {
    // `translate_page` fetches the page; it never reads `text`.
    expect(tool('pro_fetch_translate_page').inputSchema.required).toEqual(['url', 'target_lang']);
    expect(tool('pro_fetch_translate_text').inputSchema.required).toEqual(['text', 'target_lang']);
  });

  it('publishes every alias the dispatcher accepts', () => {
    // Absent from the schema means a caller who obeys the schema cannot use the tool at all.
    const properties = tool('pro_fetch_script_convert').inputSchema.properties ?? {};
    for (const key of ['to_script', 'target_script', 'html', 'text', 'content']) {
      expect(properties, key).toHaveProperty(key);
    }
  });

  it('actually converts when the caller uses the declared argument', async () => {
    // This is the behaviour that was silently missing. Same call, declared argument: it must convert.
    const result = await callTool('pro_fetch_script_convert', { text: 'Hello', target_script: 'cyrillic' });
    expect(result.isError).toBeFalsy();
    expect(text(result)).not.toBe('Hello');
  });

  it('still works for the tools that need no target at all', async () => {
    const detected = await callTool('pro_fetch_locale_detect', { text: 'Bu va uchun yaxshi' });
    expect(detected.isError).toBeFalsy();
    expect(text(detected)).toContain('uz');
  });
});

describe('apitest requirements match what the dispatcher reads', () => {
  it('lets the five spec tools take an inline document instead of forcing a url', () => {
    // `bodyFor` reads `content|text|spec|document|sample` *or* `url`, so "one of these" is the honest
    // statement. `required: ['url']` made the offline path unreachable from the schema.
    for (const name of [
      'pro_fetch_openapi_fetch',
      'pro_fetch_openapi_parse',
      'pro_fetch_openapi_endpoints_list',
      'pro_fetch_swagger_validate',
      'pro_fetch_wsdl_parse',
    ]) {
      const schema = tool(name).inputSchema;
      expect(schema.required, name).toBeUndefined();
      expect(schema.anyOf, name).toEqual([{ required: ['url'] }, { required: ['content'] }]);
    }
  });

  it('asks json_schema_infer for inline json, not a url', () => {
    expect(tool('pro_fetch_json_schema_infer').inputSchema.required).toEqual(['json']);
  });

  it('asks the two-spec tools for both sides of the comparison', () => {
    expect(tool('pro_fetch_api_diff').inputSchema.required).toEqual(['base_url', 'head_url']);
    expect(tool('pro_fetch_openapi_try').inputSchema.required).toEqual(['base_url', 'path']);
  });

  it('parses a spec supplied inline, with no network access', async () => {
    const spec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Demo', version: '1.0' },
      paths: { '/ping': { get: { summary: 'Ping' } } },
    });
    const parsed = await callTool('pro_fetch_openapi_parse', { content: spec });
    expect(parsed.isError).toBeFalsy();
    expect(text(parsed)).toContain('/ping');

    const listed = await callTool('pro_fetch_openapi_endpoints_list', { content: spec });
    expect(listed.isError).toBeFalsy();
    expect(text(listed)).toContain('/ping');
  });

  it('infers a schema from inline json', async () => {
    const result = await callTool('pro_fetch_json_schema_infer', { json: '{"a":1,"b":"x"}' });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('integer');
  });

  it('openapi_try does not demand a specification document it never reads', () => {
    // The behavioural half: the branch used to sit after `bodyFor`, so this exact call failed with
    // "url yoki content parametri kerak" even though the branch only needs base_url and path.
    // Asserted through the schema, not the network, so the test cannot flake on an upstream 404.
    expect(tool('pro_fetch_openapi_try').inputSchema.required).not.toContain('url');
  });
});
