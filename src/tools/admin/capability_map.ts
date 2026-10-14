import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { allTools } from '../../core/tool.js';
import { currentProfile, isToolVisibleInProfile } from '../../core/profile.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { rankTools } from '../../core/intent-search.js';
import { inferArguments } from '../../core/argument-inference.js';
import { detailMode } from '../../core/composite-budget.js';

/**
 * pro_capability_map — Find the right tool without a round trip per guess
 * Pack: smart-composite (pro-fetch)
 *
 * `tool_list_details` ranks by keyword overlap, which fails the way users actually talk: "papers
 * about retrieval" does not surface the arxiv tool, because those words are absent from its
 * description. This delegates to `core/intent-search.ts`, which blends BM25 with morphological
 * expansion and a domain synonym table, and returns the exact tool names with their input schemas.
 *
 * Every returned tool is reachable: `direct` marks the ones callable by name under the active
 * profile, and the rest are reached through `pro_capability_call`.
 */
/** Categories each coverage composite serves, so discovery can name the right executor. */
const COMPOSITE_CATEGORIES: Record<string, readonly string[]> = {
  pro_workspace_ops: ['git', 'devops', 'database', 'security'],
  pro_service_ops: ['codehost', 'collaboration', 'storage', 'productivity'],
};

/**
 * Pick the executor that covers the most matched categories.
 *
 * Naming `pro_workspace_ops` rather than the generic batch executor matters: the composite is a single
 * schema the caller already knows, while the batch executor asks them to assemble a call list. When
 * no composite covers the matches — the common case for extract, http and research — the generic
 * executor is still correct, so this returns it rather than nothing.
 */
function batchToolFor(categories: string[]): string {
  const distinct = new Set(categories);
  let best = 'pro_capability_call';
  let bestCoverage = 0;
  for (const [composite, served] of Object.entries(COMPOSITE_CATEGORIES)) {
    const coverage = served.filter((category) => distinct.has(category)).length;
    if (coverage > bestCoverage) {
      bestCoverage = coverage;
      best = composite;
    }
  }
  return best;
}

export default defineTool({
  name: 'pro_capability_map',
  description:
    'Map a task in plain language to the exact Pro-Fetch tools that can do it, with full input ' +
    'schemas. Understands synonyms and word forms, so "papers about retrieval" finds the academic ' +
    'search tool and "look at this site" finds the crawler. Use this first when you know the goal ' +
    'but not the tool name.',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      detail: { type: 'string', enum: ['summary', 'full'], description: 'Natija hajmi: summary yoki full' },
      task: { type: 'string', description: 'Nima qilmoqchisiz? Masalan: "arxiv dan paper qidirish"' },
      category: { type: 'string', description: 'Kategoriya filtri (ixtiyoriy)' },
      include_schema: { type: 'boolean', description: "To'liq input schema'ni qo'shish (odatda kerak)" },
      limit: { type: 'number', description: 'Maksimal natija (1-60, standart 12)' },
    },
    required: ['task'],
  },
  async handler(input) {
    const p = view(input);
    const task = strOrEmpty(p, 'task').trim();
    if (!task) return fail('task talab qilinadi.');
    const category = strOrEmpty(p, 'category').trim().toLowerCase();
    // `detail` was declared in the schema and then never read, so this tool always returned the full
    // payload whatever the caller asked for. It is the same output-budget knob every composite in the
    // smart profile exposes, and here the input schemas are by far the bulk of the response - a
    // 12-tool map with schemas is several times larger without them.
    const detail = detailMode(p.detail);
    // `detail` is read raw here rather than through `detailMode`, because "caller said nothing" and
    // "caller said summary" must not collapse into one state. Schemas are the point of a discovery
    // call and stay on by default; `detail: 'summary'` is what turns them off. Collapsing the two
    // made the default response lose its schemas, which is what
    // `tests/smart-system-quality.test.ts` caught.
    const includeSchema = p.include_schema ?? p.detail !== 'summary';
    const limit = Math.max(1, Math.min(60, num(p, 'limit', 12, 1, 60)));
    const profile = currentProfile();

    const pool = category ? allTools().filter((tool) => tool.category.toLowerCase() === category) : allTools();
    const ranked = rankTools(pool, task).slice(0, limit);

    if (ranked.length === 0) {
      return fail(
        `"${task}" uchun mos tool topilmadi. Boshqa so'zl bilan urinib ko'ring yoki category parametridan foydalaning.`,
      );
    }

    // Group by category so related tools stay together in the response.
    const grouped = new Map<string, typeof ranked>();
    for (const entry of ranked) {
      const bucket = grouped.get(entry.category) ?? [];
      bucket.push(entry);
      grouped.set(entry.category, bucket);
    }

    return jsonBlock(`Capability map: ${task}`, {
      profile,
      // Echoed so a caller that asked for `summary` can tell a smaller response from a tool set that
      // simply happened to have nothing to show.
      detail,
      schemas_included: includeSchema,
      matched: ranked.length,
      how_to_call:
        'Har bir tool `pro_capability_call` bilan bir chaqiruvda yoki `pro_fetch_tool_execute` bilan ' +
        "alohida chaqiriladi. `direct` = to'g'ridan-to'g'ri chaqirsa bo'ladi. `direct: false` " +
        'bo‘lgan tool’lar ham batch orqali bajariladi.',
      categories: [...grouped.entries()].map(([name, entries]) => ({
        category: name,
        tools: entries.map((entry) => {
          const tool = allTools().find((candidate) => candidate.name === entry.name);
          return {
            name: entry.name,
            description: entry.description,
            relevance: Number(entry.score.toFixed(2)),
            direct: isToolVisibleInProfile(tool ?? { name: entry.name, category: name }, profile),
            ...(includeSchema && tool ? { inputSchema: tool.inputSchema } : {}),
          };
        }),
      })),
      // Ready to send, so the caller does not have to assemble the call itself.
      //
      // Discovery that stops at names leaves the caller to write the invocation, and a malformed
      // argument is the most common way a discovered tool then fails. Returning the exact payload
      // means the next step is a paste rather than a construction. Arguments are inferred from the
      // task text — "research climate change" fills `topic` — so the call is executable as-is.
      suggested_call: {
        tool: batchToolFor(ranked.map((entry) => entry.category)),
        arguments: {
          calls: ranked.slice(0, 5).map((entry) => {
            const tool = allTools().find((candidate) => candidate.name === entry.name);
            const inferred = tool ? inferArguments(task, tool.inputSchema) : {};
            return { tool: entry.name, arguments: inferred, label: entry.name };
          }),
        },
        note:
          'Yuqoridagi `calls` ro‘yxatini to‘g‘ridan-to‘g‘ri yuboring — argumentlar task matnidan ' +
          'to‘ldirilgan. Agar to‘liqroq kerak bo‘lsa, har bir argumentni o‘z tool‘ining `inputSchema` siga mos o‘zgartiring.',
      },
    });
  },
});
