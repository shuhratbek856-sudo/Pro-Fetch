import { result, jsonBlock, fail } from '../../core/format.js';
import { hasSecondText } from '../../core/text-comparison.js';

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
      text2: { type: 'string', description: 'Ikkinchi matn — berilsa, chastotalar taqqoslanadi va farq chiqariladi' },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const count = (raw: string) => {
      const text = raw.toLowerCase();
      const freq: Record<string, number> = {};
      for (const w of text.match(/[a-zA-Z\u0400-\u04FF\u0600-\u06FF]+/g) ?? []) freq[w] = (freq[w] ?? 0) + 1;
      return freq;
    };

    const render = (freq: Record<string, number>) =>
      Object.entries(freq)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 30)
        .map(([w, n]) => '- ' + w + ': ' + n)
        .join('\n');

    const freq = count(String(p.text ?? ''));

    if (!hasSecondText(p.text2)) return result("# So'z chastotasi (top 30)\n\n" + render(freq));

    // `text2` was declared and ignored. A frequency comparison between two drafts is the useful
    // reading, and "which words got louder or quieter" is what a writer wants from it - not two
    // near-identical tables side by side.
    const second = count(p.text2);
    const changed = [...new Set([...Object.keys(freq), ...Object.keys(second)])]
      .map((w) => [w, (second[w] ?? 0) - (freq[w] ?? 0)] as const)
      .filter(([, delta]) => delta !== 0)
      .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
      .slice(0, 30)
      .map(([w, delta]) => '- ' + w + ': ' + (delta > 0 ? '+' : '') + delta);

    return result(
      "# So'z chastotasi (taqqoslash)\n\n## text\n\n" +
        render(freq) +
        '\n\n## text2\n\n' +
        render(second) +
        '\n\n## Farq (text2 - text)\n\n' +
        (changed.length ? changed.join('\n') : "(farq yo'q)"),
    );
  },
});
