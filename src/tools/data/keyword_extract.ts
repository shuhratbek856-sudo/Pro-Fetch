import { result, jsonBlock, fail } from '../../core/format.js';
import { hasSecondText } from '../../core/text-comparison.js';

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
      text2: {
        type: 'string',
        description: 'Ikkinchi matn — berilsa, kalit so‘zlar taqqoslanadi va har biriga xos so‘zlar chiqariladi',
      },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const collect = (raw: string) => {
      const text = raw.toLowerCase();
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
      return freq;
    };

    const render = (freq: Record<string, number>) =>
      Object.entries(freq)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 15)
        .map(([w, n]) => '- **' + w + '** — ' + n)
        .join('\n');

    const first = collect(String(p.text ?? ''));

    if (!hasSecondText(p.text2)) return result("# Kalit so'zlar\n\n" + render(first));

    // `text2` was declared and ignored. Which keywords belong to one text but not the other is the
    // question a second input actually raises here, so report that rather than two ranking tables.
    const second = collect(p.text2);
    const firstWords = new Set(Object.keys(first));
    const secondWords = new Set(Object.keys(second));
    const only = (from: Record<string, number>, other: Set<string>) =>
      Object.entries(from)
        .filter(([w]) => !other.has(w))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([w, n]) => '- **' + w + '** — ' + n)
        .join('\n');

    return result(
      "# Kalit so'zlar (taqqoslash)\n\n## text\n\n" +
        render(first) +
        '\n\n## text2\n\n' +
        render(second) +
        '\n\n## Faqat textda\n\n' +
        (only(first, secondWords) || '(yo‘q)') +
        '\n\n## Faqat text2da\n\n' +
        (only(second, firstWords) || '(yo‘q)'),
    );
  },
});
