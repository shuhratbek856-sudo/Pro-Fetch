// Shared schema contract for the GitHub pack.
//
// Every tool in this folder used to declare the same 17-18 property block copied from its siblings:
// owner, repo, path, ref, issue_number, pr_number, sha, base, head, state, per_page, page, query,
// user, org, gist_id, tag. Measured across the pack, 40 of the 49 tools read at most three of those,
// and all 49 declared `required: []`.
//
// Two defects follow from that, and both are user-visible rather than cosmetic:
//
//   1. A model handed a 17-property schema has no signal about which three matter, so it guesses and
//      omits what the tool actually needs.
//   2. With nothing required, `owner` and `repo` can both be absent. The handlers then build
//      `/repos/undefined/undefined/...`, GitHub answers 404, and the caller is told the repository
//      does not exist - a dead end that points away from the actual mistake.
//
// This module fixes the second defect directly and gives the first a single place to live, so a
// per-tool schema is now written as `ghSchema({...})` over a precise property set instead of a
// pasted block.

import type { JsonSchema } from '../../core/types.js';

/** Addressing pair shared by every repository-scoped tool in the pack. */
const OWNER = { type: 'string', description: 'Repository egasi (foydalanuvchi yoki tashkilot)' };
const REPO = { type: 'string', description: 'Repository nomi' };

/**
 * The vocabulary that more than one tool in this pack reads. A tool declares only the keys it
 * actually uses; `ghSchema` fills each one from here so the wording stays identical pack-wide.
 */
export const GH_PROPERTIES: Record<string, Record<string, unknown>> = {
  owner: OWNER,
  repo: REPO,
  path: { type: 'string', description: 'Fayl yoki papka yo‘li' },
  ref: { type: 'string', description: 'Branch, tag yoki SHA' },
  state: { type: 'string', description: 'open | closed | all' },
  per_page: { type: 'number', description: 'Sahifadagi natija soni (1–100, default 30)' },
  page: { type: 'number', description: 'Sahifa raqami, 1 dan boshlanadi' },
  query: { type: 'string', description: 'Qidiruv so‘rovi' },
  user: { type: 'string', description: 'Foydalanuvchi login' },
  org: { type: 'string', description: 'Tashkilot login' },
  tag: { type: 'string', description: 'Release yoki git tag nomi' },
  issue_number: { type: 'number', description: 'Issue raqami' },
  pr_number: { type: 'number', description: 'Pull request raqami' },
  sha: { type: 'string', description: 'Commit SHA' },
  base: { type: 'string', description: 'Taqqoslash bazasi (masalan main)' },
  head: { type: 'string', description: 'Taqqoslash boshi (masalan feature-branch)' },
  gist_id: { type: 'string', description: 'Gist ID' },
  // Not a GitHub addressing property: this is the composite output-budget knob every composite in
  // the smart profile exposes, and `pro_repo_audit` reads it through `detailMode`.
  detail: { type: 'string', description: 'Natijaning batafsilligi', enum: ['summary', 'full'] },
};

export type GhPropertyName = keyof typeof GH_PROPERTIES;

export interface GhSchema extends JsonSchema {
  type: 'object';
  properties: Record<string, Record<string, unknown>>;
  required: string[];
  additionalProperties: false;
}

/**
 * Build a GitHub tool schema from the properties the tool actually reads.
 *
 * `keys` are property names from `GH_PROPERTIES`. `required` defaults to `owner` and `repo` when the
 * tool declares both - that is the repository address every scoped endpoint needs - and to nothing
 * otherwise. A tool addressed some other way (`gist_id`, `org`, `user`) must pass its own list,
 * because defaulting it to the address pair would demand arguments it cannot use.
 *
 * Ordering is fixed as declaration order in `GH_PROPERTIES` rather than caller order, so two tools
 * that read the same keys emit byte-identical schemas and a diff shows only real changes.
 */
export function ghSchema(keys: readonly string[], required?: readonly string[]): GhSchema {
  const unknownKeys = keys.filter((key) => !(key in GH_PROPERTIES));
  if (unknownKeys.length) {
    // A typo here would silently drop a parameter the handler reads, so it fails loudly instead.
    throw new Error(
      `ghSchema: unknown GitHub propert${unknownKeys.length === 1 ? 'y' : 'ies'}: ${unknownKeys.join(', ')}`,
    );
  }

  const ordered = Object.keys(GH_PROPERTIES).filter((key) => keys.includes(key));
  const properties = Object.fromEntries(ordered.map((key) => [key, GH_PROPERTIES[key]]));

  const declaredAddress = ordered.includes('owner') && ordered.includes('repo');
  const requiredKeys = required ? [...required] : declaredAddress ? ['owner', 'repo'] : [];
  const unknownRequired = requiredKeys.filter((key) => !ordered.includes(key));
  if (unknownRequired.length) {
    throw new Error(
      `ghSchema: required propert${unknownRequired.length === 1 ? 'y' : 'ies'} not declared: ${unknownRequired.join(', ')}`,
    );
  }

  return { type: 'object', properties, required: requiredKeys, additionalProperties: false };
}
