/**
 * Numeric environment parsing with a bounded range.
 *
 * This lives apart from `security-policy.ts` on purpose. `security-policy` needs to read the
 * active profile from `loader.ts`, and `loader.ts` imports every tool index, which imports
 * `core/tool.ts`, which imports `execution-engine.ts` — which needs `boundedEnv`. Keeping
 * `boundedEnv` inside `security-policy` therefore closed an import cycle and made the module
 * evaluate to `undefined` at load time ("boundedEnv is not a function").
 *
 * `boundedEnv` has no dependency on the policy rules, so it belongs in its own leaf module that
 * both `security-policy` and the concurrency gates can import without creating a cycle.
 */

import { MAX_MODE_CEILING, maxMode } from './mode.js';

/**
 * Capacity limits MAX mode deliberately does not lift.
 *
 * Every other number this module reads bounds how much work *this* process can do, so raising it makes
 * a job faster and reaches nothing new. This one bounds how many requests go to a *single remote host*.
 * Raised to a billion, a batch stops being a workload and becomes a denial-of-service aimed at somebody
 * else's server - and unlike the rest, the damage lands outside the machine running the request.
 *
 * It is listed by name rather than hidden in a comment so that changing this decision is a visible,
 * greppable edit instead of something a reader has to reconstruct.
 */
const HELD_IN_MAX_MODE = new Set<string>(['PRO_FETCH_MAX_PER_HOST_CONCURRENCY']);

/** Read a positive integer from the environment, clamped to `[min, max]`.
 *
 * Returns `fallback` when the variable is unset, non-numeric, zero, or negative — so a typo in
 * `.env` degrades to a safe default instead of disabling a limit.
 *
 * MAX mode lifts the clamp and the default. The clamp mattered more: it was the real restriction,
 * because a `PRO_FETCH_MAX_CONCURRENCY` above the maximum was silently discarded, so raising the
 * default alone would have changed nothing for anyone who set the variable. The default is lifted too
 * so an operator who sets nothing still gets a working number rather than a queue with no width.
 */
export function boundedEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  const explicit = Number.isFinite(parsed) && parsed > 0;
  const held = HELD_IN_MAX_MODE.has(name);

  if (!maxMode() || held) {
    return explicit ? Math.max(min, Math.min(Math.floor(parsed), max)) : fallback;
  }
  if (explicit) return Math.max(min, Math.min(Math.floor(parsed), MAX_MODE_CEILING));
  return Math.max(fallback, Math.min(max * 16, 512));
}
