import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { allTools } from '../../core/tool.js';
import { currentProfile, isToolVisibleInProfile } from '../../core/profile.js';
import { num, strOrEmpty, view } from '../../core/input.js';

/**
 * pro_capability_map — Find the right tool without a round trip per guess
 * Pack: smart-composite (pro-fetch)
 *
 * `tool_list_details` returns tools ranked by keyword overlap. That misses the common case: the
 * model knows what it wants to *do* ("turn this PDF into markdown", "search arxiv for papers")
 * but not what the tool is called. This maps intent phrases to concrete tools and, critically,
 * reports whether each is reachable under the active profile — so the model is never handed a name
 * it cannot invoke.
 */
export default defineTool({
  name: 'pro_capability_map',
  description:
    'Map a task in plain language to the exact Pro-Fetch tools that can do it, grouped by category, ' +
    'with full input schemas and a note on whether each tool is reachable under the current profile. ' +
    'Use this first when you know the goal but not the tool name.',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
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

    const terms = tokenize(task);
    const scored = allTools()
      .filter((tool) => !category || tool.category.toLowerCase() === category)
      .map((tool) => ({ tool, score: scoreTool(tool, terms) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
      .slice(0, limit);

    if (scored.length === 0) {
      return fail(
        `"${task}" uchun mos tool topilmadi. Boshqa so‘zl bilan urinib ko‘ring yoki category parametridan foydalaning.`,
      );
    }

    const grouped = new Map<string, typeof scored>();
    for (const entry of scored) {
      const bucket = grouped.get(entry.tool.category) ?? [];
      bucket.push(entry);
      grouped.set(entry.tool.category, bucket);
    }

    return jsonBlock(`Capability map: ${task}`, {
      profile,
      matched: scored.length,
      how_to_call: [
        'Har bir tool `pro_capability_call` bilan bir chaqiruvda yoki `pro_fetch_tool_execute` bilan alohida chaqiriladi.',
        '`direct` = to‘g‘ridan-to‘g‘ri chaqirsa bo‘ladi; `via_composite` = shu profilda ko‘rinmaydi, lekin kompozit orqali ishlaydi.',
        'Ikkalasi ham `pro_capability_call` orqali bajariladi — batch ichida xato bo‘lsa qolganlari davom etadi.',
      ].join(' '),
      categories: [...grouped.entries()].map(([cat, entries]) => ({
        category: cat,
        tools: entries.map(({ tool, score }) => ({
          name: tool.name,
          description: tool.description,
          relevance: score,
          // Whether the tool can be invoked directly under this profile. Everything is reachable
          // through `pro_capability_call` regardless, so this is a routing hint, not a restriction.
          direct: isToolVisibleInProfile(tool, profile),
          ...(includeSchema ? { inputSchema: tool.inputSchema } : {}),
        })),
      })),
    });
  },
});

/** Split a task into lowercase tokens, dropping stop words that add noise. */
function tokenize(task: string): string[] {
  const stop = new Set([
    'the',
    'a',
    'an',
    'for',
    'to',
    'of',
    'in',
    'on',
    'and',
    'or',
    'with',
    'from',
    'bu',
    'uchun',
    'bilan',
    'va',
    'ham',
  ]);
  return task
    .toLowerCase()
    .split(/[^a-z0-9а-я]+/i)
    .filter((token) => token.length > 2 && !stop.has(token));
}

/**
 * Score a tool against the task tokens.
 *
 * Weighting matters: an exact word-boundary hit in the description is a stronger signal than a
 * substring anywhere, and matching the tool's own category or name suffix is stronger still.
 */
function scoreTool(
  tool: { name: string; category: string; description: string; inputSchema?: { properties?: Record<string, unknown> } },
  terms: string[],
): number {
  const name = tool.name.toLowerCase();
  const category = tool.category.toLowerCase();
  const description = tool.description.toLowerCase();
  const schema = JSON.stringify(tool.inputSchema?.properties ?? {}).toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (name.includes(term)) score += name.includes('_' + term) || name.startsWith(term) ? 10 : 6;
    if (category.includes(term)) score += 5;
    if (new RegExp(`\\b${escapeRegExp(term)}`).test(description)) score += 4;
    else if (description.includes(term)) score += 2;
    if (schema.includes(term)) score += 1;
  }
  return score;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Names of every registered tool, for callers that just want an inventory. */
export function inventory(): string[] {
  return allTools().map((tool) => tool.name);
}
