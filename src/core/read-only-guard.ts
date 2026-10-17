/**
 * The read-only guard, at the point where state actually changes.
 *
 * ## Why this exists
 *
 * `PRO_FETCH_READ_ONLY=true` was enforced by classifying tools by **name**: a regex over
 * `create|update|delete|write|save|...` decided which tools were mutations. Classification by name is a
 * guess about a tool's body, and a guess that failed open:
 *
 *     pro_fetch_import_bundle   isMutationTool = false   readOnlyHint = true
 *     assertToolAllowed(read-only) = passed
 *     cache before = undefined, after = { value: "YOZILDI" }
 *
 * The call completed without an error and wrote to the cache. That was not a one-off: a static sweep of
 * every tool whose handler reaches a write sink - `cache.put`, `writeFileSync`, `download.saveAs`,
 * `page.screenshot`, `page.pdf`, an HTTP method that is not GET/HEAD/OPTIONS - found **161 of 652**
 * tools that write something and were classified read-only. 149 of them reach `cache.put`.
 *
 * ## Why the check moved here
 *
 * A name cannot be wrong about what a tool does if the tool never gets to do it. Every sink that
 * changes state now asks first, and the answer does not depend on who called it, so a new tool added
 * next month is covered the day it is written rather than the day someone remembers to update a table.
 *
 * Name-based classification stays, for one reason: it is what produces the MCP `readOnlyHint` a model
 * sees before calling anything. It is now backed by a generated table derived from the sinks these tools
 * actually reach (`mutation-sinks.generated.ts`), and `tests/mutation-classification.test.ts` fails if
 * that table no longer matches the code.
 *
 * No imports, deliberately: `cache.ts` and the filesystem writers depend on this, and it must not be
 * able to create a cycle with the policy engine that also asks it questions.
 */

/** Set when `PRO_FETCH_READ_ONLY=true`. Read fresh on every call, never cached. */
export function readOnly(): boolean {
  return process.env.PRO_FETCH_READ_ONLY === 'true';
}

/** A write that the operator's read-only configuration forbids. */
export class WriteBlockedError extends Error {
  readonly code = 'READ_ONLY_BLOCKED';
  constructor(effect: string) {
    super(
      `PRO_FETCH_READ_ONLY=true rejimida ${effect} bloklangan. ` +
        'Bu yozuv amalga oshirmaydi - cache, fayl va boshqa holatlar o‘zgarmaydi. ' +
        'Agar o‘zgartirish kerak bo‘lsa, PRO_FETCH_MUTATION_ALLOWLIST bilan bu tool nomini ' +
        'ruxsatga qo‘shing yoki PRO_FETCH_READ_ONLY ni o‘chiring.',
    );
    this.name = 'WriteBlockedError';
  }
}

/**
 * Throw unless a write of `effect` is permitted.
 *
 * `PRO_FETCH_MUTATION_ALLOWLIST` is honoured here for the same reason it is honoured in the policy
 * engine: an operator who has explicitly allowed one tool should not have to disable read-only mode to
 * use it. The name is passed rather than looked up, because a sink knows what it is about to do and a
 * tool name is not available here.
 */
export function assertWritable(effect: string, toolName?: string): void {
  if (!readOnly()) return;
  if (toolName && mutationAllowlist().has(toolName)) return;
  throw new WriteBlockedError(effect);
}

/**
 * Whether a *side effect* may be skipped instead of refused.
 *
 * Read-only mode has two kinds of write, and they are not the same thing:
 *
 *   - a write that is the tool's purpose. `cache_put`, `pro_fetch_import_bundle`, a file export. The
 *     caller asked for state to change, so refusing it with an error is the only honest answer.
 *   - a write that is an implementation detail of a read. `fetchUrl` caches every response it fetches,
 *     which means most fetch tools write to the cache without asking. Under read-only mode those writes
 *     are simply skipped: the fetch still happens and still returns its document, the next one is a
 *     cache miss, and nothing is lost that the caller can observe.
 *
 * Treating both alike would mean either refusing every fetch in read-only mode, which makes the mode
 * useless, or letting explicit writes through, which is the hole this guard exists to close. So the
 * distinction is made at the call site, where it is knowable, and it is named.
 */
export function canSkipSideEffect(): boolean {
  return readOnly();
}

function mutationAllowlist(): Set<string> {
  return new Set(
    (process.env.PRO_FETCH_MUTATION_ALLOWLIST ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
}
