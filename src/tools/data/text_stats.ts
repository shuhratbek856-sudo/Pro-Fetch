import { result, jsonBlock, fail } from '../../core/format.js';

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
      text2: { type: 'string', description: 'Ikkinchi matn (diff uchun)' },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const text = String(p.text ?? '');
    const words = text.split(/\s+/).filter(Boolean).length;
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim()).length;
    return jsonBlock('# Matn statistikasi', {
      characters: text.length,
      words,
      sentences,
      reading_time_min: Number((words / 200).toFixed(1)),
    });
  },
});
