import { randomUUID } from 'node:crypto';
import { log } from './log.js';
import { assertToolAllowed } from './security-policy.js';
import { isMutationTool } from './tool-classification.js';
import { boundedEnv } from './bounded-env.js';
import type { ToolDefinition } from './types.js';

interface Waiter {
  resolve: (release: () => void) => void;
}
class Semaphore {
  private active = 0;
  private readonly queue: Waiter[] = [];
  constructor(private readonly limit: number) {}
  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const waiter = { resolve };
      if (this.active < this.limit) {
        this.active++;
        resolve(this.releaser());
      } else this.queue.push(waiter);
    });
  }
  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) next.resolve(this.releaser());
      else this.active = Math.max(0, this.active - 1);
    };
  }
}

export class ExecutionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

const globalGate = new Semaphore(boundedEnv('PRO_FETCH_MAX_CONCURRENCY', 64, 1, 4096));
const categoryGates = new Map<string, Semaphore>();
const counters = new Map<
  string,
  {
    calls: number;
    success: number;
    errors: number;
    timeouts: number;
    totalDurationMs: number;
    maxDurationMs: number;
    lastStatus: string;
    lastRunAt?: string;
  }
>();
const inFlight = new Map<string, number>();

function gateFor(category: string): Semaphore {
  let gate = categoryGates.get(category);
  if (!gate) {
    gate = new Semaphore(boundedEnv('PRO_FETCH_MAX_CATEGORY_CONCURRENCY', 16, 1, 2048));
    categoryGates.set(category, gate);
  }
  return gate;
}

function metric(name: string) {
  let item = counters.get(name);
  if (!item) {
    item = { calls: 0, success: 0, errors: 0, timeouts: 0, totalDurationMs: 0, maxDurationMs: 0, lastStatus: 'never' };
    counters.set(name, item);
  }
  return item;
}

export interface ExecutionMetadata {
  requestId: string;
  tool: string;
  category: string;
  durationMs: number;
  status: 'success' | 'error' | 'timeout';
  /**
   * Whether the call succeeded, as opposed to having thrown.
   *
   * Distinct from `status === 'success'` in one case only: a handler that *returned* `isError: true`
   * resolved normally, so there was no exception to catch, and it used to be counted as a success. The
   * field exists so a log line, the stats counters and what the caller actually received cannot be read
   * three different ways.
   */
  ok?: boolean;
  retryable?: boolean;
  errorCode?: string;
}

export async function executeTool<T>(
  tool: ToolDefinition,
  input: Record<string, unknown>,
  handler: () => Promise<T>,
): Promise<{ value: T; metadata: ExecutionMetadata }> {
  const requestId = randomUUID();
  const started = Date.now();
  const stats = metric(tool.name);
  stats.calls++;
  stats.lastRunAt = new Date(started).toISOString();

  // The timeout is the call's budget, and the budget covers the wait for a slot.
  //
  // The timer used to be armed after both gates were acquired, so a call that queued behind a busy
  // category started its timeout only once it was running. Measured: with a 1200 ms timeout and a
  // category capacity of one, a call that queued behind a stuck handler waited 1418 ms and then ran
  // with a fresh 1200 ms timer - 1418 ms of waiting plus the handler's own time, against a timeout
  // the tool had named as 1200 ms. The deadline is now taken when the call arrives, and a call
  // whose budget was spent waiting is refused rather than run.
  const timeoutMs = boundedEnv('PRO_FETCH_TOOL_TIMEOUT_MS', 600_000, 1_000, 86_400_000);
  const deadline = started + timeoutMs;

  try {
    assertToolAllowed(tool, input);
  } catch (error) {
    const durationMs = Date.now() - started;
    stats.errors++;
    stats.totalDurationMs += durationMs;
    stats.maxDurationMs = Math.max(stats.maxDurationMs, durationMs);
    stats.lastStatus = 'error';
    const code =
      error instanceof Error && 'code' in error ? String((error as Error & { code?: unknown }).code) : 'POLICY_BLOCKED';
    const metadata: ExecutionMetadata = {
      requestId,
      tool: tool.name,
      category: tool.category,
      durationMs,
      status: 'error',
      retryable: false,
      errorCode: code,
    };
    log(JSON.stringify({ event: 'tool.blocked', ...metadata }));
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      executionMetadata: metadata,
      code,
      retryable: false,
    });
  }

  const categoryRelease = await gateFor(tool.category).acquire();
  let globalRelease: (() => void) | undefined;
  try {
    globalRelease = await globalGate.acquire();
    inFlight.set(tool.category, (inFlight.get(tool.category) ?? 0) + 1);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abandonTimer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (abandonTimer) clearTimeout(abandonTimer);
      const left = Math.max(0, (inFlight.get(tool.category) ?? 1) - 1);
      if (left === 0) inFlight.delete(tool.category);
      else inFlight.set(tool.category, left);
      globalRelease?.();
      categoryRelease();
    };

    // The budget may already be spent: the call waited for a slot.
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      release();
      throw new ExecutionError(
        `Tool ${tool.name} ${timeoutMs} ms ichida tugamadi (slot kutishida vaqt tugdi).`,
        'TOOL_TIMEOUT',
        !isMutationTool(tool.name),
      );
    }

    const operation = Promise.resolve().then(handler);
    operation.then(
      () => {
        if (timedOut) release();
      },
      () => {
        if (timedOut) release();
      },
    );
    try {
      const value = await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            // Handlers are not cancellable, so slots stay reserved while a timed-out handler is still
            // running (prevents over-commit). That reservation is bounded: a handler that never settles
            // must not hold a category/global slot forever, so force-release after a grace period.
            const graceMs = boundedEnv('PRO_FETCH_ABANDON_GRACE_MS', 60_000, 100, 3_600_000);
            abandonTimer = setTimeout(() => {
              if (!released)
                log(
                  JSON.stringify({
                    event: 'tool.abandoned',
                    requestId,
                    tool: tool.name,
                    category: tool.category,
                    graceMs,
                  }),
                );
              release();
            }, graceMs);
            abandonTimer.unref?.();
            // A timed-out mutation is not retryable. The handler is still running - `Promise.race` does not cancel
            // it - so a retry would start a second copy of an operation that may have already done part of
            // its work. For a write that means a duplicate: two rows, two files, two messages sent because
            // the first was slow rather than absent. A read can be retried freely; a write cannot be
            // retried safely.
            //
            // Measured before this: `TOOL_TIMEOUT` was marked `retryable: true` for every tool, so a
            // client that retried a timed-out `task_create` could create two tasks. The timeout error
            // said "retry me" about an operation whose outcome was unknown.
            const retryable = !isMutationTool(tool.name);
            reject(new ExecutionError(`Tool ${tool.name} ${timeoutMs} ms ichida tugamadi.`, 'TOOL_TIMEOUT', retryable));
          }, remaining);
        }),
      ]);
      const durationMs = Date.now() - started;
      // A handler that answered with `isError: true` did not succeed. It resolved, so there was no
      // exception to catch, but the work failed - and `dispatch()` already reported `ok: false` for it.
      // Counting it as a success here meant the monitoring counters and the caller's own result
      // disagreed: a dashboard could report a 100% success rate over a run in which every call failed.
      const reportedFailure =
        value !== null && typeof value === 'object' && (value as { isError?: unknown }).isError === true;
      if (reportedFailure) {
        stats.errors++;
      } else {
        stats.success++;
      }
      stats.totalDurationMs += durationMs;
      stats.maxDurationMs = Math.max(stats.maxDurationMs, durationMs);
      stats.lastStatus = reportedFailure ? 'error' : 'success';
      const metadata: ExecutionMetadata = {
        requestId,
        tool: tool.name,
        category: tool.category,
        durationMs,
        status: reportedFailure ? 'error' : 'success',
        ok: !reportedFailure,
      };
      log(JSON.stringify({ event: 'tool.complete', ...metadata }));
      return { value, metadata };
    } catch (error) {
      const durationMs = Date.now() - started;
      const isTimeout = error instanceof ExecutionError && error.code === 'TOOL_TIMEOUT';
      stats.errors++;
      if (isTimeout) stats.timeouts++;
      stats.totalDurationMs += durationMs;
      stats.maxDurationMs = Math.max(stats.maxDurationMs, durationMs);
      stats.lastStatus = isTimeout ? 'timeout' : 'error';
      const code =
        error instanceof ExecutionError
          ? error.code
          : error instanceof Error && 'code' in error
            ? String((error as Error & { code?: unknown }).code)
            : 'TOOL_EXECUTION_ERROR';
      const retryable =
        error instanceof ExecutionError
          ? error.retryable
          : error instanceof Error && 'retryable' in error
            ? Boolean((error as Error & { retryable?: unknown }).retryable)
            : false;
      const metadata: ExecutionMetadata = {
        requestId,
        tool: tool.name,
        category: tool.category,
        durationMs,
        status: isTimeout ? 'timeout' : 'error',
        retryable,
        errorCode: code,
      };
      log(JSON.stringify({ event: 'tool.error', ...metadata }));
      throw Object.assign(error instanceof Error ? error : new Error(String(error)), { executionMetadata: metadata });
    } finally {
      if (timer) clearTimeout(timer);
      if (!timedOut) release();
    }
  } catch (error) {
    // Policy rejection occurs before execution slots are acquired; release is handled above only
    // after both gates have been acquired. An assertion thrown before acquisition reaches here.
    throw error;
  }
}

export function executionStats(): {
  totals: { calls: number; success: number; errors: number; timeouts: number; inFlight: number };
  byTool: Record<
    string,
    {
      calls: number;
      success: number;
      errors: number;
      timeouts: number;
      averageDurationMs: number;
      maxDurationMs: number;
      lastStatus: string;
      lastRunAt?: string;
    }
  >;
  inFlightByCategory: Record<string, number>;
} {
  const values = Array.from(counters.values());
  const totals = values.reduce(
    (acc, item) => ({
      calls: acc.calls + item.calls,
      success: acc.success + item.success,
      errors: acc.errors + item.errors,
      timeouts: acc.timeouts + item.timeouts,
    }),
    { calls: 0, success: 0, errors: 0, timeouts: 0 },
  );
  return {
    totals: { ...totals, inFlight: Array.from(inFlight.values()).reduce((a, b) => a + b, 0) },
    byTool: Object.fromEntries(
      Array.from(counters, ([name, item]) => [
        name,
        {
          calls: item.calls,
          success: item.success,
          errors: item.errors,
          timeouts: item.timeouts,
          averageDurationMs: item.calls ? Math.round(item.totalDurationMs / item.calls) : 0,
          maxDurationMs: item.maxDurationMs,
          lastStatus: item.lastStatus,
          ...(item.lastRunAt ? { lastRunAt: item.lastRunAt } : {}),
        },
      ]),
    ),
    inFlightByCategory: Object.fromEntries(inFlight),
  };
}
