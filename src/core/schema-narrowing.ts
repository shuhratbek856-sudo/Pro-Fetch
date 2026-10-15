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
 * `runCodehost` and the other SPECS runners dispatch on a tool name built at runtime, so no tool file
 * exists to resolve and the whole runner is the only source available - narrowing per tool would
 * leave every tool in the pack advertising the runner's union. `media` used to sit here for the same
 * reason; `runMediaTool` switches on the tool name like `runBrowserTool` does, so
 * `src/core/source-resolver.ts` splits it per branch and media is narrowed like any other category.
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

/**
 * Whether the resolved source mentions a property at all.
 *
 * Loose on purpose: it matches the bare word anywhere, so keeping a property the code does not really
 * read is the failure mode. For narrowing that is the safe direction - a too-wide schema misleads,
 * a too-narrow one rejects a valid call - and `readsPropertyStrictly` covers the places where
 * precision is required. Exported so the invariant can be asserted with the same definition the
 * runtime and `npm run audit:schema` both use.
 */
export function readsProperty(source: string, property: string): boolean {
  const short = property.replace(/_number$/, '');
  for (const needle of [property, short, `input.${property}`, `p.${property}`, `'${property}'`]) {
    if (needle.includes('.') && !source.includes(needle)) continue;
    if (new RegExp(`(?<![\\w])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`).test(source)) return true;
  }
  return false;
}

/**
 * Whether the source reads a property the way real code does: by naming it as an argument.
 *
 * `readsProperty` is deliberately loose - it matches the bare word anywhere - because for the general
 * narrowing pass, keeping too much is the safe direction. Restating convert alternatives is not that
 * direction: `pro_fetch_pdf_to_text` declares `text`, and its description reads "Extract text from a
 * PDF", so the loose match kept a property the tool cannot use and the schema contradicted its own
 * `anyOf`.
 *
 * Exported so the invariant can be asserted in tests against the same definition the runtime uses,
 * rather than a second copy that could drift.
 */
export function readsPropertyStrictly(source: string, property: string): boolean {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    // `string(input, 'x')`, `num(input, 'x', ...)`, `bool(p, 'x')`
    new RegExp(`\\b(?:string|num|bool|objectInput)\\s*\\(\\s*(?:input|p)\\s*,\\s*'${escaped}'`),
    // `input.x`, `p.x`, `input['x']` - with a boundary, or `input.data` also matches the start of
    // `input.data_base64`. `readBinarySource` reads that one and not `data`, so `pro_fetch_pdf_to_text`
    // kept a `data` property its reader never looks at.
    new RegExp(`\\b(?:input|p)\\s*(?:\\.${escaped}(?!\\w)|\\[['"]${escaped}['"]\\])`),
    // A whole-object read that hands the property to a helper, as `sourceFrom(input)` does.
    new RegExp(`\\[['"]${escaped}['"]\\]`),
  ];
  return patterns.some((pattern) => pattern.test(source));
}

/**
 * Restate each convert tool's alternatives to the ones it actually accepts.
 *
 * `applyCategorySchema` gives all 32 convert tools the same five-way `anyOf`: url, text, content,
 * data, base64. But the category holds two different source readers, and their unions differ:
 *
 * - `readTextSource(input)` takes `text`, `content` or `data`, falling back to `url`. 21 tools use it.
 * - `readBinarySource(input)` takes `base64` (or `data_base64`), falling back to `url`. 11 tools use it.
 *
 * So every text tool was advertising `base64`, which it cannot read, and every binary tool was
 * advertising `text`/`content`/`data`, which it cannot read. With `additionalProperties: false` those
 * are not harmless: a caller who followed the schema and sent `base64` to `pro_fetch_json_to_yaml` was
 * rejected, having been told the schema accepted it.
 *
 * Which reader a tool uses is read from its own resolved source rather than from a hand-kept list, so
 * moving a tool between the two does not silently leave it advertising the wrong set.
 */
function restateConvertAlternatives(tool: ToolDefinition, source: string): void {
  const schema = tool.inputSchema as { properties?: Record<string, unknown>; anyOf?: unknown };
  if (!schema.properties) return;

  const binary = /\breadBinarySource\s*\(/.test(source);
  const text = /\breadTextSource\s*\(/.test(source);
  // Neither reader visible: leave whatever the category declared rather than guessing.
  if (binary === text) return;

  // `readBinarySource` reads `str(input, 'base64', 'data_base64')`, so both spellings are one input.
  // Only `base64` was declared, and with `additionalProperties: false` a conforming client could not
  // send the alias - verified by calling `pro_fetch_pdf_to_text` with `data_base64`, which reached the
  // PDF parser and failed on its content rather than on the argument.
  const alternatives = binary ? ['base64', 'data_base64', 'url'] : ['data', 'content', 'text', 'url'];
  schema.anyOf = alternatives.map((required) => ({ required: [required] }));

  const keep = new Set(alternatives);
  for (const property of Object.keys(schema.properties)) {
    if (keep.has(property)) continue;
    if (readsPropertyStrictly(source, property)) continue;
    delete schema.properties[property];
  }
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

    if (tool.category === 'convert') {
      restateConvertAlternatives(tool, source);
      narrowed++;
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
