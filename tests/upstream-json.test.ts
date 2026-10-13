import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { parseUpstreamJson } from '../src/core/json-response.js';
import { readFileSync } from 'node:fs';

/**
 * Upstream APIs answer throttling and overload with a 200 and a non-JSON body.
 *
 * Parsing that blindly produced `Unexpected token 'O', "OK..." is not valid JSON` — observed live
 * against the GDELT news API — which tells the caller nothing about what happened. Every upstream
 * JSON decode now goes through `parseUpstreamJson`, which names the provider, the status, the
 * content type and the start of the body instead.
 */
describe('parseUpstreamJson', () => {
  it('returns the parsed body when it is valid JSON', () => {
    const parsed = parseUpstreamJson<{ ok: number }>(
      { status: 200, contentType: 'application/json', text: '{"ok":1}' },
      'Test API',
    );
    expect(parsed).toEqual({ ok: 1 });
  });

  it('names the provider, the status and the body preview when it is not JSON', () => {
    try {
      parseUpstreamJson({ status: 200, contentType: 'text/html', text: '<html>Overloaded</html>' }, 'GDELT news API');
      expect.unreachable('should have thrown');
    } catch (error) {
      const message = String(error);
      expect(message).toContain('GDELT news API');
      expect(message).not.toMatch(/Unexpected token/);
      expect(message).toMatch(/200/);
      expect(message).toMatch(/Overloaded/);
    }
  });

  it('says the body was empty rather than showing an empty preview', () => {
    try {
      parseUpstreamJson({ status: 200, contentType: 'application/json', text: '   ' }, 'Test API');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(String(error)).toMatch(/bo‘sh/);
    }
  });
});

describe('no upstream decode is left unguarded', () => {
  // The registry-wide rule, pinned at the source level: a bare `JSON.parse` on a network body is how
  // the `Unexpected token` failure returns.
  it('every network-body decode goes through the helper', () => {
    const files = [
      'src/core/search-providers.ts',
      'src/core/research-tools.ts',
      'src/core/archive-monitoring-tools.ts',
      'src/tools/auth/oauth_device_flow.ts',
      'src/tools/http/fetch_graphql.ts',
      'src/tools/monitoring/release_watch.ts',
      'src/tools/docs/dockerhub_read.ts',
      'src/tools/docs/doi_resolve.ts',
      'src/tools/docs/npm_package_read.ts',
      'src/tools/docs/pypi_package_read.ts',
      'src/tools/docs/registry_api_read.ts',
    ];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // Without the paren: call sites use the generic form `parseUpstreamJson<{...}>(...)`.
      expect(source, file).toContain('parseUpstreamJson');
      expect(source, `${file} must not keep a bare decode`).not.toMatch(/JSON\.parse\((response|r|t)\.text\)/);
    }
  });

  it('the remaining bare decodes are all guarded', () => {
    // Two live in try/catch with a fallback, two parse with a `'{}'` default. If any of these lines
    // changes shape, this test names the file so the rule stays complete rather than approximate.
    const guarded: Array<[string, RegExp]> = [
      ['src/core/integration-tools.ts', /try \{\s*\n.*JSON\.parse\(response\.text\)/],
      ['src/core/max-platform-tools.ts', /try \{\s*\n.*JSON\.parse\(response\.text\)/],
      ['src/tools/archive/wayback_lookup.ts', /JSON\.parse\(r\.text \|\| '\{\}'\)/],
      ['src/tools/docs/wikipedia_deep_read.ts', /JSON\.parse\(r\.text \|\| '\{\}'\)/],
    ];
    for (const [file, guard] of guarded) {
      expect(readFileSync(file, 'utf8'), `${file} guard changed shape`).toMatch(guard);
    }
  });

  it('news_search decodes through the helper', () => {
    // The live call is not made here: GDELT answers in tens of seconds when throttled, and a unit
    // suite must not depend on a third party's latency. The live behaviour was verified by hand
    // (a 429, and before the fix, `Unexpected token 'O'` on a 200 with a non-JSON body). What the
    // suite pins is the wiring: the handler parses with the helper, so any non-JSON body fails with
    // the provider named.
    const source = readFileSync('src/tools/search/news_search.ts', 'utf8');
    expect(source).toContain('parseUpstreamJson<{');
    expect(source).toContain("'GDELT news API'");
    expect(source).not.toMatch(/JSON\.parse\(response\.text\)/);
  });
});
