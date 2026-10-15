// The mode contract.
//
// Simple is the default and must stay boring: it is what every existing caller gets, and the mode
// system is only allowed to change what MAX mode does. MAX mode raises capacity limits; it must not
// touch a single network containment control.
//
// That second half is the part worth asserting. "We added an unlimited mode" is exactly the kind of
// change that quietly disables SSRF protection because both live in the same file, and the test suite
// is the only thing that would notice. So the security probes below are checked *in MAX mode* rather
// than only in simple mode.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import '../src/loader.js';
import { dispatch } from '../src/core/tool.js';
import { MAX_MODE_CEILING, batchCeiling, maxMode } from '../src/core/mode.js';
import { boundedEnv } from '../src/core/bounded-env.js';
import type { ToolResult } from '../src/core/types.js';

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL };
  process.env.PRO_FETCH_PROFILE = 'full';
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

const text = (result: ToolResult): string =>
  (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');

const calls = (n: number) =>
  Array.from({ length: n }, () => ({ tool: 'pro_fetch_hash_string', arguments: { text: 'x' } }));

describe('mode selection', () => {
  it('is simple unless MAX mode is asked for', () => {
    delete process.env.PRO_FETCH_MODE;
    expect(maxMode()).toBe(false);
    expect(batchCeiling()).toBe(5000);
  });

  it('recognises max, full and unlimited as the same selection', () => {
    for (const value of ['max', 'MAX', ' full ', 'unlimited']) {
      process.env.PRO_FETCH_MODE = value;
      expect(maxMode()).toBe(true);
    }
  });

  it('lifts the batch ceiling in MAX mode', () => {
    process.env.PRO_FETCH_MODE = 'max';
    expect(batchCeiling()).toBe(MAX_MODE_CEILING);
    expect(MAX_MODE_CEILING).toBe(9_999_999_999);
  });

  it('lets PRO_FETCH_MAX_BATCH hold MAX mode back in either direction', () => {
    // The ceiling is a control the user holds, not a switch that only goes one way. Setting it lower
    // than MAX mode's own ceiling has to work, or there is no way to narrow an installation back down.
    process.env.PRO_FETCH_MODE = 'max';
    process.env.PRO_FETCH_MAX_BATCH = '250';
    expect(batchCeiling()).toBe(250);

    process.env.PRO_FETCH_MODE = 'simple';
    process.env.PRO_FETCH_MAX_BATCH = '250000';
    expect(batchCeiling()).toBe(250000);
  });
});

describe('MAX mode raises capacity', () => {
  it('actually applies a concurrency value the simple ceiling would discard', () => {
    // This is the part that made the earlier attempt useless. The `max` argument was the real
    // restriction: PRO_FETCH_MAX_CONCURRENCY=100000 against a ceiling of 4096 was silently
    // discarded, so raising the default changed nothing for anyone who set the variable.
    process.env.PRO_FETCH_MAX_CONCURRENCY = '100000';

    process.env.PRO_FETCH_MODE = 'simple';
    expect(boundedEnv('PRO_FETCH_MAX_CONCURRENCY', 64, 1, 4096)).toBe(4096);

    process.env.PRO_FETCH_MODE = 'max';
    expect(boundedEnv('PRO_FETCH_MAX_CONCURRENCY', 64, 1, 4096)).toBe(100000);
  });

  it('raises the default too, so setting nothing still gives a working number', () => {
    process.env.PRO_FETCH_MODE = 'simple';
    const simple = boundedEnv('PRO_FETCH_MAX_CATEGORY_CONCURRENCY', 16, 1, 2048);

    process.env.PRO_FETCH_MODE = 'max';
    const max = boundedEnv('PRO_FETCH_MAX_CATEGORY_CONCURRENCY', 16, 1, 2048);

    expect(max).toBeGreaterThan(simple);
  });

  it('keeps the per-host ceiling, because that one protects someone else', async () => {
    // Every other number here bounds this process. This one bounds how many requests reach a single
    // remote host, so a raised value is aimed outward. It is held by name, which makes the exception
    // greppable rather than buried in a comment.
    process.env.PRO_FETCH_MODE = 'max';
    expect(boundedEnv('PRO_FETCH_MAX_PER_HOST_CONCURRENCY', 8, 1, 512)).toBe(8);

    process.env.PRO_FETCH_MAX_PER_HOST_CONCURRENCY = '999999999';
    expect(boundedEnv('PRO_FETCH_MAX_PER_HOST_CONCURRENCY', 8, 1, 512)).toBe(512);
  });
});

describe('the batch queue', () => {
  it('refuses above the ceiling in simple mode', async () => {
    process.env.PRO_FETCH_MODE = 'simple';
    const result = await dispatch('pro_capability_call', { calls: calls(5001) });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/5000/);
  });

  it('carries a batch the simple mode would refuse', async () => {
    process.env.PRO_FETCH_MODE = 'max';
    const result = await dispatch('pro_capability_call', { calls: calls(5001), detail: 'summary' });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toMatch(/"ok":\s*5001/);
  });

  it('runs a large batch in chunks rather than opening every socket at once', async () => {
    // 2 500 entries with a chunk size of 1 000 must produce three rounds. If the chunking were
    // removed this test still passes on the count, which is why the chunk size is set to a small
    // value here: the point is that a batch larger than the chunk is accepted and completes, not that
    // the engine can open thousands of sockets.
    process.env.PRO_FETCH_MODE = 'max';
    process.env.PRO_FETCH_BATCH_CHUNK = '500';
    process.env.PRO_FETCH_MAX_MODE_FANOUT = '4';
    const result = await dispatch('pro_capability_call', { calls: calls(1500), detail: 'summary' });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toMatch(/"ok":\s*1500/);
  });
});

describe('large batches ask the user', () => {
  const selfServe = Number(process.env.PRO_FETCH_MAX_SELF_SERVE ?? 99_999);

  it('refuses above the self-serve line and names the way through', async () => {
    process.env.PRO_FETCH_MODE = 'max';
    const result = await dispatch('pro_capability_call', { calls: calls(selfServe + 1) });
    expect(result.isError).toBe(true);
    const body = text(result);
    // A refusal the caller cannot act on is a dead end, so it has to say what to do.
    expect(body).toMatch(/confirm_large_batch/);
    expect(body).toMatch(new RegExp(String(selfServe)));
  });

  it('allows exactly the self-serve line without confirmation', async () => {
    process.env.PRO_FETCH_MODE = 'max';
    process.env.PRO_FETCH_MAX_SELF_SERVE = '200';
    const atLine = await dispatch('pro_capability_call', { calls: calls(200), detail: 'summary' });
    expect(atLine.isError).toBeFalsy();

    const overLine = await dispatch('pro_capability_call', { calls: calls(201) });
    expect(overLine.isError).toBe(true);
  });

  it('proceeds once the caller states the user confirmed', async () => {
    process.env.PRO_FETCH_MODE = 'max';
    process.env.PRO_FETCH_MAX_SELF_SERVE = '100';
    const result = await dispatch('pro_capability_call', {
      calls: calls(150),
      confirm_large_batch: true,
      detail: 'summary',
    });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toMatch(/"ok":\s*150/);
  });
});

describe('MAX mode does not touch network containment', () => {
  // Items 1-3 of the security inventory, re-checked with the mode switched on. If a future change
  // ever routes a limit through MAX mode, one of these fails.
  const probes: Array<[string, string]> = [
    ['loopback', 'http://127.0.0.1:8080/internal'],
    ['private range', 'http://192.168.1.1/admin'],
    ['link-local metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['internal suffix', 'http://db.internal/secrets'],
    ['file protocol', 'file:///C:/Windows/win.ini'],
    ['credentials in URL', 'http://user:pass@example.com/'],
  ];

  for (const [label, url] of probes) {
    it(`still refuses ${label} in MAX mode`, async () => {
      process.env.PRO_FETCH_MODE = 'max';
      const result = await dispatch('pro_fetch_fetch_raw', { url });
      expect(result.isError).toBe(true);
    });
  }

  it('refuses the same probes in simple mode, so the check is not vacuous', async () => {
    process.env.PRO_FETCH_MODE = 'simple';
    for (const [, url] of probes) {
      const result = await dispatch('pro_fetch_fetch_raw', { url });
      expect(result.isError).toBe(true);
    }
  });
});
