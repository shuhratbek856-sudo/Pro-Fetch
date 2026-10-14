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
