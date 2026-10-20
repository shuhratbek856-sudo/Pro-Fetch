/**
 * Regression pins for audit batch 7 — the execution engine:
 * the timeout is the call's budget, and the budget covers the wait for a slot.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeTool, executionStats } from '../src/core/execution-engine.js';

const fakeTool = (name: string, category: string) =>
  ({
    name,
    category,
    description: 'probe',
    inputSchema: { type: 'object', properties: {} },
  }) as never;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('the tool timeout covers the whole call, queueing included', () => {
  it('refuses a call whose budget was spent waiting for a slot', async () => {
    vi.stubEnv('PRO_FETCH_MAX_CATEGORY_CONCURRENCY', '1');
    vi.stubEnv('PRO_FETCH_TOOL_TIMEOUT_MS', '1200');
    vi.stubEnv('PRO_FETCH_ABANDON_GRACE_MS', '200');

    // A stuck handler holds the only slot in the category for its timeout plus the abandon grace.
    const stuck = fakeTool('batch7_stuck', 'batch7_queue');
    const first = executeTool(stuck, {}, () => new Promise(() => {}));
    first.catch(() => {});

    // The second call arrives while the slot is taken. Its own budget is 1200 ms, and the queueing
    // is inside that budget - so it must be refused rather than run with a fresh timer.
    const started = Date.now();
    const outcome = await executeTool(fakeTool('batch7_queued', 'batch7_queue'), {}, async () => 'done').then(
      () => 'executed',
      (error: Error) => 'failed:' + error.message,
    );
    const wall = Date.now() - started;
    expect(outcome).toMatch(/^failed:/);
    expect(outcome).toMatch(/tugamadi/);
    expect(wall).toBeLessThan(3_000);
  }, 20_000);

  it('counts the refusal as a timeout', async () => {
    vi.stubEnv('PRO_FETCH_MAX_CATEGORY_CONCURRENCY', '1');
    vi.stubEnv('PRO_FETCH_TOOL_TIMEOUT_MS', '1000');
    vi.stubEnv('PRO_FETCH_ABANDON_GRACE_MS', '100');
    const stuck = fakeTool('batch7_stuck2', 'batch7_queue2');
    const first = executeTool(stuck, {}, () => new Promise(() => {}));
    first.catch(() => {});
    await expect(executeTool(fakeTool('batch7_queued2', 'batch7_queue2'), {}, async () => 'done')).rejects.toThrow(
      /tugamadi/,
    );
    const stats = executionStats();
    expect(stats.totals.timeouts).toBeGreaterThan(0);
  }, 20_000);
});

describe('a refused call does not hold a slot', () => {
  it('a policy rejection does not take a slot and is immediate', async () => {
    vi.stubEnv('PRO_FETCH_MAX_CATEGORY_CONCURRENCY', '1');
    vi.stubEnv('PRO_FETCH_READ_ONLY', 'true');
    const blocked = {
      name: 'pro_fetch_github_pr_merge',
      category: 'batch7_policy',
      description: 'probe',
      inputSchema: { type: 'object', properties: {} },
    } as never;
    await expect(executeTool(blocked, {}, async () => 'nope')).rejects.toThrow(/READ_ONLY/);
    const after = await executeTool(fakeTool('batch7_after_policy', 'batch7_policy'), {}, async () => 'ok');
    expect(after.value).toBe('ok');
  });

  it('a thrown handler releases its slot', async () => {
    vi.stubEnv('PRO_FETCH_MAX_CATEGORY_CONCURRENCY', '1');
    const tool = fakeTool('batch7_throw', 'batch7_throw_cat');
    await expect(
      executeTool(tool, {}, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow(/boom/);
    const after = await executeTool(fakeTool('batch7_after_throw', 'batch7_throw_cat'), {}, async () => 'ok');
    expect(after.value).toBe('ok');
  });
});
