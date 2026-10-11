import { result, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_dedupe_text — Remove near-duplicate passages from a text set
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_dedupe_text',
  description: 'Remove near-duplicate passages from a text set',
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
    const lines = String(p.text ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const seen: string[] = [];
    const dupes: string[] = [];
    for (const l of lines) {
      if (
        seen.some((s) => {
          const sa = new Set(s.split(' '));
          const sb = new Set(l.split(' '));
          const inter = [...sb].filter((w) => sa.has(w)).length;
          return inter / Math.max(1, Math.min(sa.size, sb.size)) > 0.8;
        })
      )
        dupes.push(l);
      else seen.push(l);
    }
    return result('# Dedupe (' + dupes.length + ' takror)\n\n## Qolgan\n\n' + seen.join('\n'));
  },
});
