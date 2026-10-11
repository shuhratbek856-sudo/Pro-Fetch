import { result, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_word_frequency — Word frequency counts with stopwords removed
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_word_frequency',
  description: 'Word frequency counts with stopwords removed',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Kirish matni' },
      text2: { type: 'string', description: 'Ikkinchi matn (diff uchun)' },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const text = String(p.text ?? '').toLowerCase();
    const freq: Record<string, number> = {};
    for (const w of text.match(/[a-zA-Z\u0400-\u04FF\u0600-\u06FF]+/g) ?? []) freq[w] = (freq[w] ?? 0) + 1;
    const top = Object.entries(freq)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 30);
    return result("# So'z chastotasi (top 30)\n\n" + top.map(([w, n]) => '- ' + w + ': ' + n).join('\n'));
  },
});
