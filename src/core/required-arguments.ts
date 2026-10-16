// Presence checking for tool arguments, driven by each tool's own `inputSchema.required`.
//
// This exists because `required` was a promise nobody kept. It is published to the MCP client as the
// tool's contract and read by the caller to build the call, but nothing in the dispatch path checked
// it, so every tool relied on its handler happening to validate its own inputs. Measured across the
// 200 tools registered from `SPECS` in `src/core/max-platform-tools.ts`, the behaviour was not
// consistent: `runGit` and `runSecurity` reported a missing argument, while `runCollaboration`,
// `runStorage` and `runProductivity` failed on a missing credential first and the caller never learned
// that the argument was absent. And in the github pack, `{}` on `pro_gh_repo_readme` built
// `/repos/undefined/undefined` and came back 404 - which reads as "this repository does not exist"
// rather than "you did not name one".
//
// The rule, in one place: an argument the tool declares required must be present and non-blank, and
// that is checked before anything else looks at the input. Ordering matters as much as the check -
// a caller should be told about the thing they got wrong in this call, not sent to fix credentials
// they may already have.
//
// Blank means blank. `owner: '   '` is truthy in JavaScript, so a naive presence test lets it through
// and it reaches the API as an empty path segment, producing the same 404 this check exists to stop.

import type { ToolDefinition } from './types.js';

/**
 * Matches a tool whose arguments are checked elsewhere and whose `required` is not a list of
 * top-level arguments.
 *
 * A composite that forwards a `calls` array validates each element, not the top-level object, so
 * asserting on the outer list would be wrong. Detection is on the shape rather than the name: the
 * schema declares an array of objects and nothing else the caller must supply.
 */
function isNestedCallTool(tool: Pick<ToolDefinition, 'inputSchema'>): boolean {
  const properties = (tool.inputSchema?.properties ?? {}) as Record<string, { type?: string }>;
  const entries = Object.entries(properties);
  if (entries.length !== 1) return false;
  const [key, schema] = entries[0];
  return key === 'calls' && schema?.type === 'array';
}

/**
 * Throw when an argument the tool declares required is absent or blank.
 *
 * Skips tools that express their requirement as alternatives - `anyOf`, meaning "url *or* content" -
 * because asserting every branch would reject a valid call that satisfied one of them.
 */
/**
 * Refuse an argument the schema does not declare.
 *
 * Every schema in this registry declares `additionalProperties: false`, and the declaration was
 * decorative: passing `totally_bogus_property: true` to 240 of 605 tools succeeded silently. That is
 * the worst failure mode available here, because the schema says in plain words that unknown arguments
 * are refused, a caller who misspells `max_tokens` as `max_tokns` gets a successful-looking result and
 * no reason to suspect the argument was never read. The same shape as the `pro_site_scan` composites
 * that reported 0/7 with `isError: false`.
 *
 * Reported as a single tool rather than a list, because the overwhelmingly common cause is one typo and
 * naming all of them would bury it.
 */
export function assertNoUnknownArguments(
  tool: Pick<ToolDefinition, 'name' | 'inputSchema'>,
  input: Record<string, unknown>,
): void {
  const schema = tool.inputSchema as
    { properties?: Record<string, unknown>; additionalProperties?: unknown } | undefined;
  if (!schema || schema.additionalProperties !== false) return;
  const declared = Object.keys(schema.properties ?? {});
  if (declared.length === 0) return;
  // The meta-executor forwards a payload shaped like `{ tool, arguments }`; those two keys are its own
  // envelope, not arguments to the inner tool.
  if (isNestedCallTool(tool)) return;

  const unknown = Object.keys(input).filter(
    (key) => !declared.includes(key) && key !== 'tool' && key !== 'arguments' && key !== 'label',
  );
  if (unknown.length === 0) return;

  // A close match is almost always the intended key, so naming it turns a dead end into a fix.
  const suggestions = unknown
    .map((key) => {
      const best = declared
        .map((candidate) => ({ candidate, distance: editDistance(key, candidate) }))
        .sort((a, b) => a.distance - b.distance)[0];
      return best && best.distance <= 2 ? `"${key}" -> "${best.candidate}"` : `"${key}"`;
    })
    .join(', ');

  throw new Error(
    `${tool.name}: e’lon qilinmagan argument: ${suggestions}. ` +
      `Ruxsat etilgan: ${declared.slice(0, 12).join(', ')}${declared.length > 12 ? ', …' : ''}.`,
  );
}

/** Levenshtein, bounded - only ever used to suggest a key a few characters away. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_unused, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

export function assertRequiredPresent(
  tool: Pick<ToolDefinition, 'name' | 'inputSchema'>,
  input: Record<string, unknown>,
): void {
  const schema = tool.inputSchema as { required?: unknown; anyOf?: unknown } | undefined;
  const required = Array.isArray(schema?.required) ? (schema.required as string[]) : null;
  if (!required || required.length === 0) return;
  // "url *or* content" is expressed as anyOf; asserting every branch would reject a call that
  // satisfied one of them.
  if (Array.isArray(schema?.anyOf) && (schema.anyOf as unknown[]).length > 0) return;
  if (isNestedCallTool(tool)) return;

  const missing: string[] = [];
  for (const key of required) {
    const value = input[key];
    if (value === undefined || value === null) missing.push(key);
    else if (typeof value === 'string' && value.trim() === '') missing.push(key);
  }

  if (missing.length) {
    // The caller-facing wrapper already prefixes the message with the tool name.
    throw new RequiredArgumentError(`majburiy argumentlar berilmadi: ${missing.join(', ')}.`);
  }
}

export class RequiredArgumentError extends Error {
  readonly code = 'MISSING_INPUT';
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = 'RequiredArgumentError';
  }
}
