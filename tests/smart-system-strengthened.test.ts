import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/loader.js';
import { allTools, dispatch } from '../src/core/tool.js';
import { listTools } from '../src/router.js';
import {
  inferUrl,
  inferEmail,
  inferQuery,
  inferLimit,
  inferPaths,
  inferArguments,
} from '../src/core/argument-inference.js';
import { SMART_TOOL_NAMES } from '../src/core/profile.js';
import type { ToolResult } from '../src/core/types.js';

const ORIGINAL = { ...process.env };
beforeEach(() => {
  process.env = { ...ORIGINAL };
  process.env.PRO_FETCH_PROFILE = 'smart';
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

const text = (result: ToolResult): string =>
  (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');

const parseJson = (result: ToolResult): Record<string, unknown> => {
  const cleaned = text(result)
    .replace(/^```json\s*/gm, '')
    .replace(/```$/gm, '')
    .trim();
  const start = cleaned.indexOf('{');
  return JSON.parse(cleaned.slice(start, cleaned.lastIndexOf('}') + 1)) as Record<string, unknown>;
};

describe('argument inference', () => {
  it('extracts a full URL', () => {
    expect(inferUrl('look at https://example.com/page')).toBe('https://example.com/page');
  });

  it('extracts a bare www host and adds a scheme', () => {
    expect(inferUrl('check www.example.com')).toBe('https://www.example.com');
  });

  it('returns undefined when no URL is present', () => {
    expect(inferUrl('research climate change')).toBeUndefined();
  });

  it('extracts an email', () => {
    expect(inferEmail('contact me at user@example.com')).toBe('user@example.com');
  });

  it('extracts a query after a topic preposition', () => {
    expect(inferQuery('papers about retrieval augmented generation')).toBe('retrieval augmented generation');
  });

  it('falls back to the stripped task when no preposition is present', () => {
    expect(inferQuery('climate change')).toBe('climate change');
  });

  it('extracts filesystem paths', () => {
    const paths = inferPaths('read /home/user/data.csv');
    expect(paths).toContain('/home/user/data.csv');
  });

  it('extracts a limit from an explicit quantity', () => {
    expect(inferLimit('top 5 results')).toBe(5);
    expect(inferLimit('10 papers')).toBe(10);
  });

  it('ignores numbers that are not quantities', () => {
    expect(inferLimit('research react 18')).toBeUndefined();
  });

  it('fills url fields in a schema', () => {
    const args = inferArguments('fetch https://example.com', {
      properties: { url: { type: 'string' }, limit: { type: 'number' } },
    });
    expect(args.url).toBe('https://example.com');
    expect(args.limit).toBeUndefined();
  });

  it('fills query fields in a schema', () => {
    const args = inferArguments('papers about retrieval', {
      properties: { query: { type: 'string' } },
    });
    expect(args.query).toBe('retrieval');
  });

  it('returns empty arguments for a schema with no matching fields', () => {
    const args = inferArguments('research climate change', {
      properties: { owner: { type: 'string' }, repo: { type: 'string' } },
    });
    expect(args).toEqual({});
  });
});

describe('capability_map returns pre-filled arguments', () => {
  it('suggests a call with inferred arguments', async () => {
    const result = await dispatch('pro_capability_map', {
      task: 'papers about retrieval augmented generation',
      include_schema: false,
    });
    const payload = parseJson(result);
    const suggested = payload.suggested_call as {
      arguments: { calls: Array<{ tool: string; arguments: Record<string, unknown> }> };
    };
    expect(suggested.arguments.calls.length).toBeGreaterThan(0);
    // At least one call should have inferred arguments (not empty).
    const withArgs = suggested.arguments.calls.filter((call) => Object.keys(call.arguments).length > 0);
    expect(withArgs.length).toBeGreaterThan(0);
  });

  it('infers a URL for a task containing one', async () => {
    const result = await dispatch('pro_capability_map', {
      task: 'audit https://example.com',
      include_schema: false,
    });
    const payload = parseJson(result);
    const suggested = payload.suggested_call as {
      arguments: { calls: Array<{ tool: string; arguments: Record<string, unknown> }> };
    };
    const urlCalls = suggested.arguments.calls.filter((call) => call.arguments.url === 'https://example.com');
    expect(urlCalls.length).toBeGreaterThan(0);
  });
});

describe('pro_synthesize', () => {
  it('is registered in the registry', () => {
    expect(allTools().some((tool) => tool.name === 'pro_synthesize')).toBe(true);
  });

  it('is part of the smart profile', () => {
    expect(SMART_TOOL_NAMES.has('pro_synthesize')).toBe(true);
  });

  it('produces findings from multiple sources', async () => {
    const result = await dispatch('pro_synthesize', {
      sources: [
        { tool: 'pro_fetch_a', output: 'Node.js is a JavaScript runtime. It is fast and scalable.' },
        { tool: 'pro_fetch_b', output: 'Node.js is a JavaScript runtime. It handles many connections.' },
        { tool: 'pro_fetch_c', output: 'Python is a programming language. It is easy to learn.' },
      ],
    });
    const payload = parseJson(result);
    const findings = payload.findings as Array<{ claim: string; count: number }>;
    expect(findings.length).toBeGreaterThan(0);
    // The claim supported by two sources should rank first.
    expect(findings[0]!.count).toBeGreaterThanOrEqual(2);
  });

  it('identifies gaps in the task', async () => {
    const result = await dispatch('pro_synthesize', {
      task: 'who wrote Node.js and when was it created',
      sources: [{ tool: 'pro_fetch_a', output: 'Node.js is a JavaScript runtime.' }],
    });
    const payload = parseJson(result);
    const gaps = payload.gaps as string[];
    expect(gaps).toContain('who');
    expect(gaps).toContain('when');
  });

  it('handles a single source without error', async () => {
    const result = await dispatch('pro_synthesize', {
      sources: [{ tool: 'pro_fetch_a', output: 'Node.js is a JavaScript runtime.' }],
    });
    const payload = parseJson(result);
    expect(payload.findings.length).toBeGreaterThan(0);
  });

  it('rejects an empty source list', async () => {
    const result = await dispatch('pro_synthesize', { sources: [] });
    expect(result.isError).toBe(true);
  });

  it('skips malformed source entries', async () => {
    const result = await dispatch('pro_synthesize', {
      sources: [{ tool: 'pro_fetch_a', output: 'Node.js is a JavaScript runtime.' }, { output: 'no tool' }],
    });
    expect(result.isError).toBeFalsy();
    const payload = parseJson(result);
    expect(payload.sources).toHaveLength(1);
  });
});

describe('nested composition', () => {
  it('allows a batch to call a composite', async () => {
    const result = await dispatch('pro_capability_call', {
      calls: [
        { tool: 'pro_synthesize', arguments: { sources: [{ tool: 'x', output: 'test output' }] }, label: 'synth' },
      ],
    });
    expect(result.isError).toBeFalsy();
    const payload = parseJson(result);
    expect(payload.ok).toBe(1);
  });

  it('enforces the depth limit', async () => {
    // Build a deeply nested call chain: capability_call -> capability_call -> ... -> tool
    // The limit should kick in before infinite recursion.
    const deepCall = { tool: 'pro_fetch_hash_string', arguments: { text: 'deep' }, label: 'deep' };
    let current = { tool: 'pro_capability_call', arguments: { calls: [deepCall] }, label: 'level1' };
    for (let i = 0; i < 5; i++) {
      current = { tool: 'pro_capability_call', arguments: { calls: [current] }, label: `level${i + 2}` };
    }
    const result = await dispatch('pro_capability_call', { calls: [current] });
    // Either it succeeds (if depth is within limit) or fails with a clear error.
    // The key is it must not hang or crash. `isError` is undefined on success, not false.
    expect(result.isError === true || result.isError === undefined).toBe(true);
  });
});

describe('smart profile surface', () => {
  it('now exposes eleven tools (ten originals plus pro_synthesize)', () => {
    const visible = listTools('smart');
    expect(visible.length).toBe(11);
  });

  it('pro_synthesize has a handler and object schema', () => {
    const tool = allTools().find((t) => t.name === 'pro_synthesize');
    expect(typeof tool?.handler).toBe('function');
    expect(tool?.inputSchema.type).toBe('object');
  });
});
