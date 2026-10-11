import { defineTool } from '../../core/tool.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_reading_time — Estimate reading time and word count of text
 * Pack: i18n (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_reading_time',
  description: 'Estimate reading time and word count of text',
  category: 'i18n',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Matn' },
      format: { type: 'string', description: 'WPM (son, standart 200)' },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const wpm = Math.max(60, Number(p.format ?? 200)) || 200;
    const words = String(p.text ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const minutes = words.length / wpm;
    return jsonBlock('# Reading time', {
      words: words.length,
      characters: String(p.text ?? '').length,
      wpm,
      minutes: Math.round(minutes * 10) / 10,
      seconds: Math.round(minutes * 60),
    });
  },
});
