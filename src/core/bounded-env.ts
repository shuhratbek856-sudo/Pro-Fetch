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

/** Read a positive integer from the environment, clamped to `[min, max]`.
 *
 * Returns `fallback` when the variable is unset, non-numeric, zero, or negative — so a typo in
 * `.env` degrades to a safe default instead of disabling a limit.
 */
export function boundedEnv(name: string, fallback: number, min: number, max: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(min, Math.min(Math.floor(parsed), max)) : fallback;
}
