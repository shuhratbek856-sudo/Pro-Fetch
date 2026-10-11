import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { allTools } from '../../core/tool.js';
import { currentProfile, isToolVisibleInProfile } from '../../core/profile.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { rankTools } from '../../core/intent-search.js';

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
    const includeSchema = p.include_schema !== false;
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
    });
  },
});
