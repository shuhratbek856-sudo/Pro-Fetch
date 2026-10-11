import { result, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_language_detect — Detect the language or languages of a text
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_language_detect',
  description: 'Detect the language or languages of a text',
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
    const scripts: Array<[string, RegExp]> = [
      ['cyrillic', /[\u0400-\u04FF]/g],
      ['latin', /[a-zA-Z]/g],
      ['arabic', /[\u0600-\u06FF]/g],
      ['cjk', /[\u4e00-\u9fff]/g],
    ];
    const counts = scripts
      .map(([n, re]) => [n, (text.match(re) ?? []).length] as [string, number])
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1]);
    const hints: Record<string, string[]> = {
      uz: ['va', 'bilan', 'uchun', 'ham'],
      ru: ['и', 'в', 'на', 'что'],
      en: ['the', 'and', 'with', 'for'],
    };
    const lower = ' ' + text.toLowerCase() + ' ';
    const langHits = Object.entries(hints)
      .map(([l, ws]) => [l, ws.filter((w) => lower.includes(' ' + w + ' ')).length] as [string, number])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
    return jsonBlock('# Til aniqlash', { scripts: counts, likely_languages: langHits.map(([l]) => l) });
  },
});
