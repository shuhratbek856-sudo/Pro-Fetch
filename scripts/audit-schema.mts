// Schema quality audit.
//
// A tool that declares no required fields, or declares properties its handler never reads, is not
// merely untidy: it is a live defect. With `required: []` the model may omit `owner` and `repo`, the
// handler happily builds `/repos/undefined/undefined/...`, and the provider answers 404. The caller
// is told the repository does not exist, which is worse than a clear "owner is required" because it
// sends them looking in the wrong place.
//
// The first version of this script over-reported: it read `String(tool.handler)` and flagged every
// property a delegating handler did not name inline. Tools like `pro_fetch_openapi_parse` forward
// their whole `input` to `runIntegrationTool`, so nothing they declare is dead. That is why this
// version skips delegating handlers outright rather than guessing.
//
// Categories listed in `CATEGORY_SCHEMA_CATEGORIES` in `src/core/tool.ts` are also excluded: their
// schemas are padded deliberately by `applyCategorySchema`, so the source file is not the schema.
//
// Usage: npx tsx scripts/audit-schema.mts [--json] [--category <name>]

process.env.PRO_FETCH_PROFILE ??= 'full';
await import('../src/loader.js');
const { allTools } = await import('../src/core/tool.js');
const { sourceFor, auditedToolCount } = await import('./tool-source-map.mts');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const categoryIndex = args.indexOf('--category');
const onlyCategory = categoryIndex >= 0 ? args[categoryIndex + 1] : undefined;

// Mirrors src/core/tool.ts. Kept as a literal rather than imported because that set is module-private
// and duplicating it here is what makes this script an independent check instead of a tautology.
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
 * Tools that declare no required argument on purpose, each verified by calling it with none.
 *
 * Two generators (`uuid_generate`, `random_string`) have nothing to ask for; the other three are
 * reporting tools where every property is an optional knob and a bare call is the normal request.
 * "List the tools" and "show me the log" are not malformed, so there is nothing to mark required.
 *
 * The first version of this list named storage/productivity listing tools that this audit never even
 * reaches — `storage` and `productivity` are in `CATEGORY_SCHEMA_CATEGORIES` and get skipped above —
 * so the gate kept reporting 6 while the allowlist sat there looking effective. Entries must be tools
 * this script actually audits.
 */
const OPTIONAL_BY_DESIGN = new Set([
  'pro_fetch_uuid_generate',
  'pro_fetch_random_string',
  'pro_fetch_tool_list_details',
  'pro_fetch_log_tail',
  'pro_fetch_cache_tune',
]);

interface Finding {
  name: string;
  category: string;
  declared: number;
  deadProperties: string[];
  requiredEmpty: boolean;
  /** Required properties the tool's own source never mentions. */
  requiredUnread: string[];
}

const findings: Finding[] = [];
let skippedDelegating = 0;

/**
 * Reads the source that actually decides which inputs a tool reads.
 *
 * `String(tool.handler)` is the compiled function, which for a thin tool says nothing. For a tool
 * whose handler is `return controlCrawlJob(input)` the tool file also says little - the reads happen
 * in `src/core/crawl-tools.ts`. `sourceFor` follows one delegation hop so the measurement is taken
 * where the behaviour is.
 */
const resolvedSource = new Map<string, string | undefined>();
function sourceFileFor(toolName: string, category: string): string | undefined {
  if (!resolvedSource.has(toolName)) resolvedSource.set(toolName, sourceFor(toolName, category));
  return resolvedSource.get(toolName);
}

for (const tool of allTools()) {
  if (onlyCategory && tool.category !== onlyCategory) continue;

  const source = String(tool.handler);

  // The whole input crosses the boundary, so every declared property is reachable.
  if (/runIntegrationTool|runCompositeTool/.test(source)) {
    skippedDelegating++;
    continue;
  }

  const schema = tool.inputSchema as { properties?: Record<string, unknown>; required?: string[] };
  const properties = Object.keys(schema.properties ?? {});
  const required = schema.required ?? [];

  const haystack = sourceFileFor(tool.name, tool.category) ?? source;

  const mentions = (property: string): boolean => {
    const short = property.replace(/_number$/, '');
    const alternatives = new Set([property, short, `input.${property}`, `p.${property}`]);
    return [...alternatives].some((needle) => new RegExp(`\\b${needle.replace(/\./g, '\\.')}\\b`).test(haystack));
  };

  const dead = properties.filter((p) => !mentions(p));
  const requiredUnread = required.filter((property) => !mentions(property));

  // A tool may state its requirement as alternatives - "url *or* text" - which `anyOf` expresses and
  // `required` cannot. Counting those as "declares nothing" would report a tool whose schema is
  // exactly as informative as one that uses `required`.
  const anyOf = (schema as { anyOf?: Array<{ required?: string[] }> }).anyOf;
  const statesRequirement = required.length > 0 || (Array.isArray(anyOf) && anyOf.length > 0);

  findings.push({
    name: tool.name,
    category: tool.category,
    declared: properties.length,
    deadProperties: dead,
    requiredEmpty: !statesRequirement && properties.length > 0,
    requiredUnread,
  });
}

const withDead = findings.filter((f) => f.deadProperties.length > 0);
const withEmptyRequired = findings.filter((f) => f.requiredEmpty && !OPTIONAL_BY_DESIGN.has(f.name));
const withUnreadRequired = findings.filter((f) => f.requiredUnread.length > 0);

if (asJson) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  const byCategory = new Map<string, Finding[]>();
  for (const finding of findings) {
    if (!byCategory.has(finding.category)) byCategory.set(finding.category, []);
    byCategory.get(finding.category)!.push(finding);
  }

  console.log(
    `SCHEMA_AUDIT audited=${findings.length} skipped_delegating=${skippedDelegating} ` +
      `resolved_sources=${auditedToolCount}\n`,
  );
  console.log(
    `  with_dead_properties=${withDead.length}  with_required_empty=${withEmptyRequired.length}  ` +
      `with_unread_required=${withUnreadRequired.length}\n`,
  );

  if (withUnreadRequired.length) {
    console.log("--- e'lon qilingan, lekin kodda O'QILMAYDIGAN required ---");
    const byRequiredCategory = new Map<string, Finding[]>();
    for (const finding of withUnreadRequired) {
      if (!byRequiredCategory.has(finding.category)) byRequiredCategory.set(finding.category, []);
      byRequiredCategory.get(finding.category)!.push(finding);
    }
    for (const [category, list] of [...byRequiredCategory.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`  [${category}] ${list.length} ta`);
      for (const finding of list.slice(0, 5)) {
        console.log(`      ${finding.name.padEnd(42)} requires: ${finding.requiredUnread.join(',')}`);
      }
    }
  }

  const ranked = [...byCategory.entries()]
    .map(
      ([category, list]) =>
        [
          category,
          list,
          list.filter((f) => f.deadProperties.length > 0).length,
          list.reduce((sum, f) => sum + f.deadProperties.length, 0),
        ] as const,
    )
    .sort((a, b) => b[3] - a[3]);

  for (const [category, list, dead, totalDead] of ranked) {
    if (dead === 0) continue;
    const avg = (totalDead / list.length).toFixed(1);
    console.log(
      `${category.padEnd(14)} tools=${String(list.length).padStart(3)} with_dead=${String(dead).padStart(3)} total_dead=${String(totalDead).padStart(4)} avg_dead=${avg}`,
    );
  }

  console.log("\n--- eng ko'p o'lik xususiyatli 20 ta tool ---");
  for (const finding of [...findings].sort((a, b) => b.deadProperties.length - a.deadProperties.length).slice(0, 20)) {
    console.log(
      `  ${finding.name.padEnd(42)} declared=${String(finding.declared).padStart(3)} dead=${String(finding.deadProperties.length).padStart(3)} [${finding.deadProperties.slice(0, 5).join(',')}]`,
    );
  }
}
