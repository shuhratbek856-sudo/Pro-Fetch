import { result, jsonBlock, fail } from '../../core/format.js';
import { hasSecondText, measureOrCompare } from '../../core/text-comparison.js';

/**
 * pro_fetch_readability_score — Compute Flesch readability metrics of a text
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_readability_score',
  description: 'Compute Flesch readability metrics of a text',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Kirish matni' },
      text2: {
        type: 'string',
        description: 'Ikkinchi matn — berilsa, Flesch o‘lchovi ham uni o‘lchaydi va farqni chiqaradi',
      },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    // `text2` was declared and ignored. Comparing two drafts on one scale is the obvious use, and it
    // needs no invented semantics: the same formula applied to the second text.
    const measure = (text: string) => {
      const sentences = text.split(/[.!?]+/).filter((s) => s.trim()).length || 1;
      const words = text.split(/\s+/).filter(Boolean);
      const syllables = words.reduce((s, w) => s + Math.max(1, (w.toLowerCase().match(/[aeiouy]+/g) ?? []).length), 0);
      const flesch = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syllables / Math.max(1, words.length));
      return {
        words: words.length,
        sentences,
        syllables,
        flesch: Number(flesch.toFixed(1)),
        level: flesch > 60 ? 'oson' : flesch > 30 ? "o'rtacha" : 'qiyin',
      };
    };

    const { result: measured, comparison } = measureOrCompare(
      String(p.text ?? ''),
      hasSecondText(p.text2) ? p.text2 : undefined,
      measure,
    );

    if (!comparison) return jsonBlock('# Readability (Flesch)', measured);
    return jsonBlock('# Readability (Flesch, taqqoslash)', {
      text: measured,
      [comparison.label]: comparison.second,
      ...(comparison.delta ? { delta: comparison.delta } : {}),
    });
  },
});
