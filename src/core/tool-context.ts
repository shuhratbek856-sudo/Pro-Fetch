/**
 * Which tool is currently executing.
 *
 * Sinks need this. `cache.put`, the filesystem writers, `page.screenshot` are called from
 * hundreds of handlers, and a write that reaches a sink in read-only mode must be attributable
 * to the tool that caused it — otherwise `PRO_FETCH_MUTATION_ALLOWLIST` cannot rescue an
 * explicitly allowed tool at the point where the write actually happens.
 *
 * Threading a `toolName` parameter through every call path from handler to sink was measured as
 * unworkable: `cache.put` alone is reached from 149 tools through layers that do not carry the
 * name. `AsyncLocalStorage` follows the async chain instead: `dispatch` binds the name once, and
 * every sink that asks during that handler's execution — including nested dispatches, which bind
 * their own — gets the right answer. A sink called outside any dispatch (tests, startup) gets
 * `undefined`, which is the same "unknown caller" it had before this existed.
 *
 * Only `node:async_hooks` is imported, so nothing here can form a cycle with the policy engine
 * or the guard.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<{ toolName: string }>();

/** Run `fn` with `toolName` visible to every sink it calls, directly or after `await`. */
export function withCurrentTool<T>(toolName: string, fn: () => T): T {
  return storage.run({ toolName }, fn);
}

/** The tool whose handler is executing, or `undefined` outside a dispatch. */
export function currentToolName(): string | undefined {
  return storage.getStore()?.toolName;
}
