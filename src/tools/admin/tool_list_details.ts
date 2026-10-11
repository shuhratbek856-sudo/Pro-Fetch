import { allTools, usageStats } from '../../core/tool.js';
import { isToolVisibleInProfile, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_tool_list_details — List all tools grouped by category with profile status
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
export default defineTool({
  name: 'pro_fetch_tool_list_details',
  description: 'List all tools grouped by category with profile status',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Tool nomi, vazifasi yoki kalit so‘z bo‘yicha qidirish' },
      category: { type: 'string', description: 'Kategoriya filtri, masalan github, search, crawl yoki browser' },
      limit: { type: 'number', description: 'Natijalar limiti (1-50, standart 15)' },
      include_schema: { type: 'boolean', description: "Topilgan tool uchun input schema'ni ham qaytarish" },
    },
  },
  async handler(input) {
    const query = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
    const category = typeof input.category === 'string' ? input.category.trim().toLowerCase() : '';
    const limitRaw = Number(input.limit ?? 15);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.floor(limitRaw))) : 15;
    const includeSchema = input.include_schema === true;
    const tools = allTools();
    const prof = currentProfile();
    const enabledCount = tools.filter((tool) => isToolVisibleInProfile(tool, prof)).length;

    if (query || category) {
      const terms = query.split(/[^a-z0-9_-]+/i).filter(Boolean);
      const ranked = tools
        .filter((tool) => !category || tool.category.toLowerCase() === category)
        .map((tool) => {
          const haystack = `${tool.name} ${tool.category} ${tool.description}`.toLowerCase();
          let score = 0;
          for (const term of terms) {
            if (tool.name.toLowerCase() === term || tool.name.toLowerCase().includes(term)) score += 8;
            if (tool.category.toLowerCase() === term) score += 6;
            if (tool.description.toLowerCase().includes(term)) score += 3;
            if (haystack.includes(term)) score += 1;
          }
          return { tool, score, enabled: isToolVisibleInProfile(tool, prof) };
        })
        .filter((item) => !query || item.score > 0)
        .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))
        .slice(0, limit)
        .map(({ tool, score, enabled }) => ({
          name: tool.name,
          category: tool.category,
          description: tool.description,
          enabled_in_current_profile: enabled,
          score,
          ...(includeSchema ? { inputSchema: tool.inputSchema } : {}),
        }));
      return result(
        JSON.stringify({ profile: prof, matched: ranked.length, totalTools: tools.length, tools: ranked }, null, 2),
      );
    }

    const cats: Record<string, { count: number; enabled: boolean }> = {};
    for (const tool of tools) {
      const entry = (cats[tool.category] ??= { count: 0, enabled: isToolVisibleInProfile(tool, prof) });
      entry.count++;
    }
    const categories = Object.entries(cats)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cat, value]) => ({ category: cat, ...value }));
    return result(
      JSON.stringify(
        {
          profile: prof,
          activeTools: enabledCount,
          totalTools: tools.length,
          categories,
          hint: "Muayyan vazifa uchun query va ixtiyoriy category bering. include_schema=true schema'ni ham qaytaradi.",
        },
        null,
        2,
      ),
    );
  },
});
