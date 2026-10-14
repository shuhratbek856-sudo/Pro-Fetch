import { result, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_text_summarize — Produce an extractive summary of a long text
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_text_summarize',
  description: 'Produce an extractive summary of a long text',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Kirish matni' },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const text = String(p.text ?? '');
    const sentences = text.match(/[^.!?]+[.!?]+/g)?.map((s) => s.trim()) ?? [];
    if (sentences.length <= 3) return result('# Xulosa\n\n' + text);
    const freq: Record<string, number> = {};
    for (const w of text.toLowerCase().match(/[a-zA-Z\u0400-\u04FF]{4,}/g) ?? []) freq[w] = (freq[w] ?? 0) + 1;
    const scored = sentences.map((s, i) => {
      const ws = s.toLowerCase().match(/[a-zA-Z\u0400-\u04FF]{4,}/g) ?? [];
      return { i, s, score: ws.reduce((sum, w) => sum + (freq[w] ?? 0), 0) / Math.max(1, ws.length) };
    });
    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .sort((a, b) => a.i - b.i)
      .map((x) => '- ' + x.s);
    return result('# Xulosa (' + sentences.length + ' gapdan 5)\n\n' + top.join('\n'));
  },
});
