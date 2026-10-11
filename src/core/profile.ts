/**
 * Profile resolution and visibility rules.
 *
 * This module is intentionally dependency-free. `loader.ts` must import every tool index as a
 * side effect, so any `core/` module that imports `loader.ts` closes a cycle
 * (`security-policy` → `loader` → tool indexes → `core/tool` → `execution-engine` →
 * `security-policy`). ESM then evaluates one member of that cycle to `undefined`, which surfaced
 * as `defineTool is not a function` and `boundedEnv is not a function` at runtime.
 *
 * Keeping the rules here lets the policy engine read the active profile without pulling in the
 * whole registry. `loader.ts` re-exports everything here for existing callers.
 */

export type Profile = 'smart' | 'minimal' | 'standard' | 'full';

export const PROFILE_LEVELS: Record<Profile, number> = { smart: 0, minimal: 1, standard: 2, full: 3 };

export const SMART_TOOL_NAMES = new Set([
  'pro_fetch_tool_list_details',
  'pro_fetch_tool_execute',
  'pro_fetch_health_check',
  'pro_fetch_diagnostics',
  'pro_fetch_usage_stats',
]);

/** Category → minimum profile level that exposes it. Unlisted categories default to `full`. */
export const CATEGORY_LEVELS: Record<string, number> = {
  http: 1,
  convert: 1,
  admin: 1,
  github: 2,
  search: 2,
  extract: 2,
  auth: 2,
  git: 3,
  codehost: 3,
  devops: 3,
  database: 3,
  security: 3,
  knowledge: 3,
  collaboration: 3,
  storage: 3,
  productivity: 3,
};

export function levelOf(category: string): number {
  return CATEGORY_LEVELS[category] ?? 3;
}

/** The active profile, read fresh from the environment on every call. */
export function currentProfile(): Profile {
  const value = process.env.PRO_FETCH_PROFILE as Profile | undefined;
  return value && Object.prototype.hasOwnProperty.call(PROFILE_LEVELS, value) ? value : 'standard';
}

/** Whether a tool's schema is advertised under a profile. */
export function isToolVisibleInProfile(
  tool: { name: string; category: string },
  profile: Profile = currentProfile(),
): boolean {
  if (profile === 'smart') return SMART_TOOL_NAMES.has(tool.name);
  return levelOf(tool.category) <= PROFILE_LEVELS[profile];
}

/** A profile controls which tool *schemas* reach the model, not which tools may run.
 *
 * By design this is visibility, not authorization: the `smart` profile advertises 5 meta-tools,
 * and `pro_fetch_tool_execute` exists precisely to invoke the other 554 on demand. Blocking
 * hidden tools at dispatch would make `smart` useless.
 *
 * Authorization is a separate, enforced layer — `PRO_FETCH_ALLOWED_TOOLS`,
 * `PRO_FETCH_DENIED_TOOLS`, `PRO_FETCH_DENIED_CATEGORIES` and `PRO_FETCH_READ_ONLY`, all of
 * which run inside `assertToolAllowed` on every dispatch.
 *
 * Operators who want the profile itself to act as a hard allowlist can set
 * `PRO_FETCH_ENFORCE_PROFILE=true`. That mode is incompatible with `smart`, which depends on
 * reaching tools outside its own visible set.
 */
export function profileEnforced(): boolean {
  return process.env.PRO_FETCH_ENFORCE_PROFILE === 'true';
}
