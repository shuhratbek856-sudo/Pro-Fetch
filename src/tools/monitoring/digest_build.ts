import { defineTool } from '../../core/tool.js';
import { cache } from '../../core/cache.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_digest_build — Build a digest of all watch events
 * Pack: monitoring (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_digest_build',
  description: 'Build a digest from supplied events and stored monitoring snapshots',
  category: 'monitoring',
  inputSchema: {
    type: 'object',
    properties: {
      items: { type: 'array', description: 'Digest ichiga qo‘shiladigan eventlar', items: {} },
      sources: { type: 'array', description: 'Digest manbalari', items: {} },
      text: { type: 'string', description: 'Qo‘shimcha digest matni' },
      title: { type: 'string', description: 'Digest sarlavhasi' },
      limit: { type: 'number', description: 'Eng ko‘p qator (1-100)' },
      include_stored: { type: 'boolean', description: 'Saqlangan monitoring holatlarini qo‘shish' },
    },
  },
  async handler(input) {
    const supplied = [
      ...(Array.isArray(input.items) ? input.items : []),
      ...(Array.isArray(input.sources) ? input.sources : []),
    ].map((item) => (typeof item === 'string' ? item : JSON.stringify(item)));
    const textItems =
      typeof input.text === 'string'
        ? input.text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        : [];
    const stored =
      input.include_stored === false
        ? []
        : cache.keys('monitor:').flatMap((key) => {
            const entry = cache.get(key);
            if (!entry) return [];
            let value = entry.value;
            try {
              value = JSON.stringify(JSON.parse(value));
            } catch {
              /* retain plain text snapshots */
            }
            return [`${key.split(':')[1] ?? 'watch'}: ${value.slice(0, 1200)}`];
          });
    const limitValue = Number(input.limit ?? 30);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(100, Math.floor(limitValue))) : 30;
    const entries = [...new Set([...supplied, ...textItems, ...stored])].slice(0, limit);
    return result(
      JSON.stringify(
        {
          title: typeof input.title === 'string' ? input.title : 'Monitoring digest',
          count: entries.length,
          entries,
          truncated: supplied.length + textItems.length + stored.length > limit,
        },
        null,
        2,
      ),
    );
  },
});
