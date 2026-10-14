// Narrow the category vocabulary each tool advertises down to the properties it actually reads.
//
// The problem this addresses is not cosmetic. `CATEGORY_SCHEMA_CATEGORIES` gives every tool in a
// category the same property list, so `pro_fetch_crawl_speed` - which reads a concurrency setting and
// a delay - advertises `selector`, `xpath`, `include_subdomains`, `output_path` and a dozen others.
// With `additionalProperties: false` that padding does not merely add noise: it invites a caller to
// pass arguments the tool cannot honour, and there is no way for the caller to tell from the schema
// which are real.
//
// Measured with `npm run audit:schema`: 179 of 552 audited tools declared at least one property their
// code never reads. The github category was fixed by hand with `ghSchema`; this does the same for the
// categories that were padded, in one place, driven by the same measurement.
//
// Safety, because removing a property that *is* read would break a working tool:
//
//   - Only properties from the category vocabulary are considered. A tool's own declared properties
//     and everything in `required` are never touched.
//   - Only tools whose source resolves are narrowed. An unresolved tool keeps its full vocabulary,
//     which is the safe direction: a too-wide schema is misleading, a too-narrow one is broken.
//   - Anything named in an `anyOf` alternative is kept, because removing it would reject a call that
//     satisfies a different branch.
//   - The resolution follows one delegation hop and the declarations that sit between branches, the
//     two things an earlier attempt at this got wrong. `npm test` is the backstop: every tool a test
//     calls with an argument would now fail validation if the narrowing removed it.
//
// Deliberately not done: dropping properties for the nine SPECS packs (git, codehost, devops,
// database, security, knowledge, collaboration, storage, productivity). Those share one runner per
// pack, so every tool in a pack would keep the union of what that runner reads - and each tool's own
// required list is already correct there.

import { allTools } from './tool.js';
import type { ToolDefinition } from './types.js';

/** Categories whose schemas `applyCategorySchema` pads. Mirrors tool.ts; kept separate to avoid a cycle. */
const CATEGORY_PADDED = new Set([
  'apitest',
  'archive',
  'auth',
  'browser',
  'convert',
  'crawl',
  'extract',
  'i18n',
  'media',
  'monitoring',
  'research',
  'search',
  'git',
  'codehost',
  'devops',
  'database',
  'security',
  'knowledge',
  'collaboration',
  'storage',
  'productivity',
]);

/**
 * Packs whose one runner serves many tools, so per-tool narrowing would be the runner's union.
 *
 * `runMediaTool` is here for the same reason as `runCodehost`: it dispatches all 15 media tools on
 * the tool name, so the source that "reads `selector`" is shared, and narrowing per tool would leave
 * every media tool advertising the union of all fifteen. Splitting those dispatchers is the only way
 * to narrow them, and that is a larger change than this pass.
 */
const SHARED_RUNNER_CATEGORIES = new Set([
  'git',
  'codehost',
  'devops',
  'database',
  'security',
  'knowledge',
  'collaboration',
  'storage',
  'productivity',
  'media',
]);

/** Injected per tool by `source-resolver`. Kept out of this module so resolution stays testable. */
type Resolver = (toolName: string, category: string) => string | undefined;

let resolveSource: Resolver | undefined;

/**
 * Supply the source resolver.
 *
 * It is injected rather than imported because this module is loaded from `loader.ts`, which imports
 * every tool index; a static import here would close a cycle back through `core/tool.ts`.
 */
export function setSourceResolver(resolver: Resolver): void {
  resolveSource = resolver;
}

function readsProperty(source: string, property: string): boolean {
  const short = property.replace(/_number$/, '');
  for (const needle of [property, short, `input.${property}`, `p.${property}`, `'${property}'`]) {
    if (needle.includes('.') && !source.includes(needle)) continue;
    if (new RegExp(`(?<![\\w])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`).test(source)) return true;
  }
  return false;
}

/** Narrow every eligible tool in place. Returns how many were changed and why the rest were not. */
export function narrowCategorySchemas(): { narrowed: number; skipped: number } {
  if (!resolveSource) {
    // No resolver wired up: keep every schema as declared. Failing open is the safe direction here.
    return { narrowed: 0, skipped: allTools().filter((t) => CATEGORY_PADDED.has(t.category)).length };
  }

  let narrowed = 0;
  let skipped = 0;

  for (const tool of allTools() as ToolDefinition[]) {
    if (!CATEGORY_PADDED.has(tool.category)) continue;
    if (SHARED_RUNNER_CATEGORIES.has(tool.category)) {
      skipped++;
      continue;
    }

    const schema = tool.inputSchema as {
      properties?: Record<string, unknown>;
      required?: string[];
      anyOf?: Array<{ required?: string[] }>;
    };
    const properties = schema.properties;
    if (!properties || Object.keys(properties).length === 0) {
      skipped++;
      continue;
    }

    const source = resolveSource(tool.name, tool.category);
    if (!source) {
      // Unresolved: leave the full vocabulary rather than guess.
      skipped++;
      continue;
    }

    const keep = new Set<string>(schema.required ?? []);
    for (const alternative of schema.anyOf ?? []) for (const key of alternative.required ?? []) keep.add(key);

    for (const property of Object.keys(properties)) {
      if (keep.has(property)) continue;
      if (readsProperty(source, property)) continue;
      delete properties[property];
    }

    if (Object.keys(properties).length !== 0) narrowed++;
  }

  return { narrowed, skipped };
}
