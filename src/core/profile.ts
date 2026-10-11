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

/** Tools exposed under the `smart` profile.
 *
 * The design goal is a client's tool budget — commonly around ten — without giving up capability.
 * Each entry either runs many underlying tools behind one schema, or makes the rest of the registry
 * reachable. Together they cover the whole surface:
 *
 * - `pro_capability_call` — batch executor: many tools, one round trip
 * - `pro_capability_map`  — intent to tool discovery, with schemas
 * - `pro_fetch_tool_execute` — single-tool executor (the escape hatch)
 * - `pro_research_deep`   — the full research pipeline
 * - `pro_fetch_ingest`    — any URL to clean structured data
 * - `pro_audit_page`      — one page to every applicable extraction
 * - `pro_repo_audit`      — a repository to its complete report
 * - `pro_pr_review`       — a pull request to a full review
 * - `pro_site_scan`       — crawl and summarise a site
 * - `pro_data_pipeline`   — load, profile and transform a dataset
 *
 * Exactly ten entries, matching the tightest common client limit.
 */
export const SMART_TOOL_NAMES = new Set([
  'pro_capability_call',
  'pro_capability_map',
  'pro_fetch_tool_execute',
  'pro_research_deep',
  'pro_fetch_ingest',
  'pro_audit_page',
  'pro_repo_audit',
  'pro_pr_review',
  'pro_site_scan',
  'pro_data_pipeline',
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
