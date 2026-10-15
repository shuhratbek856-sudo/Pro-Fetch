// Simple and MAX mode.
//
// Simple is the default and behaves exactly as before: 5 000 calls per batch, the usual concurrency,
// the usual timeouts. Nothing in this file changes simple mode - it only supplies the ceiling that
// MAX mode raises.
//
// MAX mode exists for one job the default cannot do: reading a whole repository, or any other sweep
// whose size is counted in the thousands rather than the dozens. Such a batch is refused by the simple
// ceiling. MAX mode raises the ceiling to 9 999 999 999 and relies on a queue rather than on fan-out -
// see the chunking in `pro_capability_call`.
//
// Three things MAX mode does NOT touch, deliberately:
//
//   1. the SSRF guard           - private addresses, .internal, localhost
//   2. the protocol allowlist   - no file:, no gopher:
//   3. credentials in URLs      - no http://user:pass@host
//   4. DNS pinning              - the connection stays on the address that was checked
//   5. the output sandbox       - PRO_FETCH_OUTPUT_ROOT containment
//   6. symlink escape detection - junctions and symlinks are followed and rejected
//   7. credential layering      - .env and *_FILE, values never inlined
//
// Items 1-7 are not capacity limits. They stop this process from reaching things it was not meant to
// reach, and no amount of local capacity makes that safer - it only makes it faster.
//
// What MAX mode changes is capacity: how many calls one batch may hold, how many run at once, how long
// a tool may take, and how large a response may be. Those four are what stop a large job, and lifting
// them cannot reach anything a single small call could not already reach.

/** Raised ceiling for MAX mode. Ten nines: far above any real workload, low enough to stay a number. */
export const MAX_MODE_CEILING = 9_999_999_999;

/** Ceiling for simple mode, and the default everywhere. */
export const SIMPLE_CEILING = 5000;

/**
 * The batch ceiling for the current mode.
 *
 * `PRO_FETCH_MAX_BATCH` still wins when set, so a caller can hold MAX mode back deliberately - the
 * ceiling is a tool the user controls, not a switch that only goes one way.
 */
export function batchCeiling(): number {
  const explicit = Number(process.env.PRO_FETCH_MAX_BATCH);
  if (Number.isFinite(explicit) && explicit >= 1) return explicit;
  return maxMode() ? MAX_MODE_CEILING : 5000;
}

/** True when MAX mode is selected. Simple is the default. */
export function maxMode(): boolean {
  const mode = (process.env.PRO_FETCH_MODE ?? '').trim().toLowerCase();
  return mode === 'max' || mode === 'full' || mode === 'unlimited';
}

/** A one-line description of the active mode, for tool descriptions and diagnostics. */
export function modeSummary(): string {
  return maxMode()
    ? 'MAX rejim: barcha quvvat chegaralari yechilgan, navbat orqali bajariladi. ' +
        'SSRF, sandbox va kalit himoyalari o‘lchov emas — ular o‘zgartirilmaydi.'
    : 'Simple rejim (standart): 5000 tagacha bir chaqiruvda.';
}
