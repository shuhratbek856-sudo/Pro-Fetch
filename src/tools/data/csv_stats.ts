import { result, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_csv_stats — Compute summary statistics for CSV columns
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_csv_stats',
  description: 'Compute summary statistics for CSV columns',
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
    if (!text.trim()) return result("(CSV matn bo'sh)");
    const rows = text
      .trim()
      .split('\n')
      .map((l: string) => l.split(',').map((c: string) => c.trim().replace(/^"|"$/g, '')));
    const head = rows[0];
    const body = rows.slice(1);
    const out: Record<string, unknown> = {};
    head.forEach((h: string, i: number) => {
      const nums = body.map((r: string[]) => Number(r[i])).filter((n: number) => !Number.isNaN(n));
      if (nums.length)
        out[h] = {
          count: nums.length,
          min: nums.reduce((a, b) => (b < a ? b : a), nums[0]),
          max: nums.reduce((a, b) => (b > a ? b : a), nums[0]),
          mean: Number((nums.reduce((a: number, b: number) => a + b, 0) / nums.length).toFixed(2)),
        };
      else out[h] = { count: body.length, unique: new Set(body.map((r: string[]) => r[i])).size };
    });
    return jsonBlock('# CSV statistika (' + body.length + ' qator)', out);
  },
});
