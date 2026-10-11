import { result, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_diff_text — Line by line diff of two texts
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_diff_text',
  description: 'Line by line diff of two texts',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Birinchi matn' },
      text2: { type: 'string', description: 'Ikkinchi matn' },
    },
    required: ['text', 'text2'],
  },
  async handler(input) {
    const p = view(input);
    const a = String(p.text ?? '').split('\n');
    const b = String(p.text2 ?? '').split('\n');
    const setB = new Set(b);
    const setA = new Set(a);
    const removed = a.filter((l) => l.trim() && !setB.has(l)).slice(0, 100);
    const added = b.filter((l) => l.trim() && !setA.has(l)).slice(0, 100);
    return result(
      '# Matn diff\n\n## Olib tashlangan\n\n' +
        (removed.map((l) => '- ' + l).join('\n') || "(yo'q)") +
        "\n\n## Qo'shilgan\n\n" +
        (added.map((l) => '+ ' + l).join('\n') || "(yo'q)"),
    );
  },
});
