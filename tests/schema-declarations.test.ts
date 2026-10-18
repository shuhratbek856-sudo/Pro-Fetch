// Regression guard for schema declarations that told the caller nothing.
//
// `max-platform-tools.ts` builds its SPECS schemas through a table, `P`, keyed by property name, with
// a fallback for anything missing: `{ type: 'string', description: k }`. That fallback produced two
// shapes that both fail silently rather than erroring:
//
// - a description that just restated the property name — "global" for `global`, "Provider" for
//   `provider` — which tells a caller nothing about the form the value takes or what it does;
// - a declared type that disagreed with the first branch of the handler's check, so `global` was a
//   `string` while the code tested `i.global === true`, and only the string `"true"` worked.
//
// Each assertion covers a case that existed. The last two sweep the whole registry, because the
// fallback can apply to any property in it.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { allTools } from '../src/core/tool.js';
import { resolveToolSource } from '../src/core/source-resolver.js';
import { readsProperty } from '../src/core/schema-narrowing.js';

const tool = (name: string) => {
  const found = allTools().find((candidate) => candidate.name === name);
  if (!found) throw new Error(`tool not registered: ${name}`);
  return found;
};

const property = (toolName: string, key: string) =>
  (tool(toolName).inputSchema.properties ?? {})[key] as
    { type?: string; description?: string; enum?: string[] } | undefined;

describe('declared types agree with the check the handler makes first', () => {
  it.each(['pro_fetch_security_npm_audit', 'pro_fetch_security_npm_outdated'])(
    '%s declares `global` as the boolean its handler tests first',
    (name) => {
      // The handler reads `i.global === true || String(i.global ?? '').toLowerCase() === 'true'`. The
      // first branch is boolean, and declaring `string` meant a caller sending the natural value
      // `true` — or `"yes"`, or `1`, or `"--global"` — was told nothing except that the flag was
      // accepted, and every one of those except `"true"` was silently ignored.
      const schema = property(name, 'global');
      expect(schema, `${name}.global borligi kerak`).toBeDefined();
      expect(schema!.type, `${name}.global boolean bo'lishi kerak`).toBe('boolean');
      const description = schema!.description ?? '';
      expect(description.length, 'tavsif 40 belgidan uzun').toBeGreaterThan(40);
      expect(description, 'tavsif property nomi emas').not.toMatch(/^global$/i);
    },
  );

  it('the handler really reads `global`, so the description is not decorative', () => {
    // A description can be written to satisfy a test. The check that matters is that the flag is
    // read, because an unread description is exactly what this file is about.
    for (const name of ['pro_fetch_security_npm_audit', 'pro_fetch_security_npm_outdated']) {
      const source = resolveToolSource(name, tool(name).category);
      expect(source, `${name} source topilishi kerak`).toBeTruthy();
      expect(source!, `${name} global o'qishi kerak`).not.toContain("description: 'global'");
      expect(readsProperty(source!, 'global'), `${name} global o'qiladimi`).toBe(true);
    }
  });

  it('`pro_fetch_storage_s3_list` describes `prefix` rather than restating it', () => {
    const description = property('pro_fetch_storage_s3_list', 'prefix')?.description ?? '';
    expect(description.length).toBeGreaterThan(20);
    expect(description).not.toMatch(/^prefix$/i);
  });

  it('`pro_llm_compare` describes what `provider` defaults to, beyond its enum', () => {
    // The enum already carries the valid values. Without a sentence the caller does not learn that
    // the property is optional or that `openai` is used when it is omitted — both of which change
    // the call they make.
    const schema = property('pro_llm_compare', 'provider');
    expect(schema).toBeDefined();
    expect(schema!.enum?.length ?? 0).toBeGreaterThan(0);
    const description = schema!.description ?? '';
    expect(description.length).toBeGreaterThan(40);
    expect(description).not.toMatch(/^provider$/i);
    expect(description).toMatch(/openai/);
  });
});

describe('no property in the registry describes itself by name', () => {
  const selfNamed = (): string[] => {
    const found: string[] = [];
    for (const candidate of allTools()) {
      const properties = (candidate.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
      for (const [key, schema] of Object.entries(properties)) {
        if ((schema?.description ?? '').trim().toLowerCase() === key.toLowerCase()) {
          found.push(`${candidate.name}.${key}`);
        }
      }
    }
    return found;
  };

  it('there are none', () => {
    // Four properties fell back to `description: k` before this was added: `global` on the two npm
    // tools, `prefix` on s3 list, `provider` on llm compare.
    expect(selfNamed()).toEqual([]);
  });
});

describe('no property in the registry has no description at all', () => {
  const missing = (): string[] => {
    const found: string[] = [];
    for (const candidate of allTools()) {
      const properties = (candidate.inputSchema.properties ?? {}) as Record<string, { description?: string }>;
      for (const [key, schema] of Object.entries(properties)) {
        if (!(schema?.description ?? '').trim()) found.push(`${candidate.name}.${key}`);
      }
    }
    return found;
  };

  it('there are none', () => {
    expect(missing()).toEqual([]);
  });
});
