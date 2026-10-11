import { result, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_keyword_extract — Extract key terms from text
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_keyword_extract',
  description: 'Extract key terms from text',
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
    const stop = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'of',
      'to',
      'in',
      'is',
      'are',
      'was',
      'for',
      'on',
      'with',
      'as',
      'by',
      'at',
      'from',
      'that',
      'this',
      'it',
      'be',
      'va',
      'ham',
      'bilan',
      'uchun',
      'bir',
      'bu',
      'shu',
      'da',
      'di',
      'the'.length ? 'not' : 'not',
    ]);
    const freq: Record<string, number> = {};
    for (const w of text.match(/[a-zA-Z\u0400-\u04FF\u0600-\u06FF]{3,}/g) ?? []) {
      if (!stop.has(w)) freq[w] = (freq[w] ?? 0) + 1;
    }
    const top = Object.entries(freq)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 15);
    return result("# Kalit so'zlar\n\n" + top.map(([w, n]) => '- **' + w + '** — ' + n).join('\n'));
  },
});
