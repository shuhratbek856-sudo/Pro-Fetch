import { result, jsonBlock, fail } from '../../core/format.js';
import { hasSecondText, measureOrCompare } from '../../core/text-comparison.js';

/**
 * pro_fetch_text_stats — Basic text statistics such as words sentences and reading time
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_text_stats',
  description: 'Basic text statistics such as words sentences and reading time',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Kirish matni' },
      text2: {
        type: 'string',
        description: 'Ikkinchi matn — berilsa, statistika ham uni o‘lchaydi va farqni chiqaradi',
      },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const measure = (value: string) => {
      const words = value.split(/\s+/).filter(Boolean).length;
      const sentences = value.split(/[.!?]+/).filter((s) => s.trim()).length;
      return {
        characters: value.length,
        words,
        sentences,
        reading_time_min: Number((words / 200).toFixed(1)),
      };
    };

    // `text2` was declared and ignored. It now measures the same way when supplied, so a caller can
    // compare two drafts instead of calling the tool twice and doing the subtraction by hand.
    const { result: measured, comparison } = measureOrCompare(
      String(p.text ?? ''),
      hasSecondText(p.text2) ? p.text2 : undefined,
      measure,
    );

    if (!comparison) return jsonBlock('# Matn statistikasi', measured);

    return jsonBlock('# Matn statistikasi (taqqoslash)', {
      text: measured,
      [comparison.label]: comparison.second,
      ...(comparison.delta ? { delta: comparison.delta } : {}),
    });
  },
});
