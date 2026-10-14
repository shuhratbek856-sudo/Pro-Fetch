import { result, jsonBlock, fail } from '../../core/format.js';
import { hasSecondText, measureOrCompare } from '../../core/text-comparison.js';

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
      text2: {
        type: 'string',
        description: 'Ikkinchi matn — berilsa, til aniqlanadi va matnlar bir xil tilimi solishtiriladi',
      },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    // `text2` was declared and ignored. Detecting a second text and saying whether the two agree is
    // the obvious use, and it is the same detection applied twice rather than invented semantics.
    const detect = (text: string) => {
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
      return { scripts: counts, likely_languages: langHits.map(([l]) => l) };
    };

    const { result: detected, comparison } = measureOrCompare(
      String(p.text ?? ''),
      hasSecondText(p.text2) ? p.text2 : undefined,
      detect,
    );
    if (!comparison) return jsonBlock('# Til aniqlash', detected);

    // Detection yields arrays, so there is no numeric delta to report. What a caller comparing two
    // texts wants to know is whether they came out the same, so state that instead.
    const first = ((detected.likely_languages as string[]) ?? []).join(',') || '(aniqlanmadi)';
    const second = (comparison.second.likely_languages as string[]).join(',') || '(aniqlanmadi)';
    return jsonBlock('# Til aniqlash (taqqoslash)', {
      text: detected,
      [comparison.label]: comparison.second,
      same_language: first === second,
    });
  },
});
