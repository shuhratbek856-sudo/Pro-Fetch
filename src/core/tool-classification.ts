/**
 * Single source of truth for how a tool is classified as mutating.
 *
 * These two answers used to be computed by two independent regexes — one in `defineTool()` for
 * the MCP `annotations`, another in `security-policy.ts` for `PRO_FETCH_READ_ONLY`. They drifted:
 * 44 tools were annotated write-capable without matching the read-only filter, and 2 tools that
 * the policy blocks (`cache_tune`, `knowledge_rebuild`) were advertised as `readOnlyHint: true`.
 * A client that trusts `readOnlyHint` to pre-approve a call would have auto-approved a tool that
 * changes server state.
 *
 * Both call sites now read from this module, so the annotation a model sees and the rule the
 * policy engine enforces cannot disagree.
 *
 * Intentionally dependency-free: it is imported by both `tool.ts` and `security-policy.ts`, and
 * must not create an import cycle between the registry and the policy engine.
 */

import { SINK_REACHING_TOOLS } from './mutation-sinks.generated.js';
/** Tool names that mutate state but do not match the generic verb pattern below. */
const EXPLICIT_MUTATION_TOOLS: readonly RegExp[] = [
  /^cache_(?:put|delete|clear)$/,
  /^session_(?:save|revoke)$/,
  /^api_key_set$/,
  /^cookie_jar_manage$/,
  /^crawl_(?:pause_resume|stop|control)$/,
  /^config_set$/,
  /^profile_switch$/,
  /^cache_tune$/,
  /^batch_schedule$/,
  /^archive_org_save$/,
  /^git_stash_pop$/,
  /^github_pr_merge$/,
  /^knowledge_(?:ingest|ingest_url|import|tag|update|delete|rebuild)$/,
  // Measured readOnlyHint:true despite side effects. These write bytes to disk (or, for the control
  // plane, dispatch arbitrary other tools) yet carry no generic mutation verb and are not picked up by
  // the generated sink table. A client that pre-approves readOnlyHint would otherwise silently allow
  // file writes / arbitrary execution. Names here are post-normalisation (only pro_fetch_/pro_research_
  // are stripped; pro_browser_/pro_media_ prefixes remain), hence the browser suffix match.
  /^tool_execute$/, // admin control plane: runs any tool
  /^(?:download_file|media_download)$/, // http/media: writes a file to the output root
  /^screenshot_(?:page|full_page)$/, // media: writes a PNG
  /browser_screenshot$/, // browser: writes a PNG (name keeps its pro_browser_ prefix)
];

/** Verb anywhere in a tool name that implies a write. */
const MUTATION_VERBS =
  /(?:^|_)(?:create|update|delete|remove|write|save|set|push|approve|close|reopen|revoke|upload|submit|send|schedule|pause|resume|stop|clear|mock|respond|tune|switch|edit|modify|post|put|patch|dispatch|cancel)(?:_|$)/i;

/**
 * Categories whose tools may write to a remote system purely because of what they call.
 *
 * `http` is deliberately excluded: most of its tools are plain GETs, and annotating every fetch
 * as destructive made the hint useless. HTTP writes are already caught by the verb pattern
 * (`post_*`, `put_*`) and, for the `method` argument, by the read-only gate in `assertToolAllowed`.
 */
const WRITE_CAPABLE_CATEGORIES: ReadonlySet<string> = new Set(['apitest', 'auth']);

/** Categories that reach the public internet or an external API. */
const REMOTE_CATEGORIES: ReadonlySet<string> = new Set([
  'http',
  'github',
  'search',
  'extract',
  'crawl',
  'media',
  'browser',
  'docs',
  'apitest',
  'auth',
  'research',
  'monitoring',
  'archive',
  'codehost',
  'security',
  'collaboration',
  'storage',
  'productivity',
]);

/**
 * The name-only rule, with the generated table deliberately excluded.
 *
 * Exported because `scripts/generate-mutation-sinks.mts` needs it: that script produces the table, so if
 * it asked `isMutationTool` it would already see the table and would write an empty one, erasing the data
 * on the next regeneration. It was measured doing exactly that - 13 tools became 0.
 */
export function isMutationToolByName(name: string): boolean {
  const normalized = name.replace(/^pro_(?:fetch|research)_/, '');
  return EXPLICIT_MUTATION_TOOLS.some((pattern) => pattern.test(normalized)) || MUTATION_VERBS.test(normalized);
}

/** Whether a tool may change local or remote state. */
export function isMutationTool(name: string): boolean {
  if (isMutationToolByName(name)) return true;
  // A name is a guess about a body, and this one was wrong often enough to matter:
  // `pro_fetch_import_bundle` writes every supplied key into the cache, was classified read-only, was
  // advertised to models as `readOnlyHint: true`, and passed `PRO_FETCH_READ_ONLY` - the call completed
  // without an error and the cache had a new entry. Thirteen tools reached a write sink with no verb in
  // their name; they are listed in a table generated from the handlers themselves, and
  // `tests/security-boundaries.test.ts` fails if that table no longer matches the code.
  //
  // The *enforcement* does not depend on this table. `read-only-guard.ts` asks at each sink, so a tool
  // added tomorrow is covered by writing to a sink rather than by remembering to update a list.
  return Object.hasOwn(SINK_REACHING_TOOLS, name);
}

/** The write sinks a tool is known to reach, for a diagnostics report. Empty for most tools. */
export function mutationSinksOf(name: string): readonly string[] {
  return SINK_REACHING_TOOLS[name] ?? [];
}

/**
 * Actions of a multi-action tool that change state, and the ones that do not.
 *
 * ## Why a list, when everything else here is derived
 *
 * `browser_action` dispatches 26 behaviours from one tool name. Read-only mode could not see inside it:
 * `assertToolAllowed` classified by name, and the name says nothing about which of the 26 ran. Measured:
 * all eleven state-changing actions passed, including `cookies_set`, which writes a cookie and touches
 * no filesystem sink - so the sink-level guard added elsewhere cannot catch it either.
 *
 * This is the same dispatch problem as an HTTP `method`, and the policy engine already handles that
 * case for `method`. It is handled here instead, in one place, so the answer to "does this action
 * change anything" is not written twice.
 *
 * ## How the line is drawn
 *
 * An action is a mutation if it submits, deletes, uploads, downloads, or destroys state that existed
 * before the call. Navigating, reading and hovering are what the server is for and are not mutations.
 * `select` is on the reading side because it changes a control's value without submitting; `press` is not,
 * because typing can submit on its own.
 *
 * `READ_ONLY_ACTIONS` is the complement of `MUTATING_ACTIONS`, computed rather than listed twice, so a
 * new action cannot end up in neither. `tests/security-boundaries.test.ts` checks that set against every
 * action the browser handler actually implements.
 */
const MUTATING_ACTION_LIST: readonly string[] = [
  'cookies_set',
  'clear_cookies',
  'set_headers',
  'close_tab',
  'close_all',
  'close_session',
  'upload_file',
  'download',
  'handle_dialog',
  'press',
  'drag',
];

export const MUTATING_ACTIONS: ReadonlySet<string> = new Set(MUTATING_ACTION_LIST);

/** Actions that only observe or navigate. */
export const READ_ONLY_ACTIONS: ReadonlySet<string> = new Set(
  [
    'back',
    'forward',
    'reload',
    'get_url',
    'get_title',
    'get_html',
    'get_text',
    'get_state',
    'hover',
    'select',
    'cookies_get',
    'list_tabs',
    'list_sessions',
    'new_tab',
    'switch_tab',
  ].filter((action) => !MUTATING_ACTIONS.has(action)),
);

/**
 * Whether the `action` argument of a multi-action tool is a state change.
 *
 * Returns `true` for an action that is in neither set, because an unknown action should not be trusted
 * to be harmless. That is the difference between a list that is wrong in the safe direction and one that
 * is wrong in the dangerous one.
 */
export function isMutatingAction(action: string): boolean {
  return !READ_ONLY_ACTIONS.has(action);
}

/** Whether the tool belongs to a category that reaches an external system. */
export function isRemoteCategory(category: string): boolean {
  return REMOTE_CATEGORIES.has(category);
}

/** MCP tool annotations, derived from the same rules that `assertToolAllowed` enforces. */
export function deriveAnnotations(
  name: string,
  category: string,
): {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
} {
  const destructive = WRITE_CAPABLE_CATEGORIES.has(category) || isMutationTool(name);
  return {
    title: name,
    readOnlyHint: !destructive,
    destructiveHint: destructive,
    idempotentHint: !destructive,
    openWorldHint: isRemoteCategory(category),
  };
}
