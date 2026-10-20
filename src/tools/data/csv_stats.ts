import { result, jsonBlock, fail } from '../../core/format.js';

/**
 * pro_fetch_csv_stats — Compute summary statistics for CSV columns
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { parseCsvRows } from '../convert/_csv.js';
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
    // A shared parser, not a split. Measured: a quoted field containing a comma was cut in half, and
    // a quoted field containing a newline became two records, so a column silently lost values.
    const rows = parseCsvRows(text);
    const head = rows[0]!;
    const body = rows.slice(1);
    const out: Record<string, unknown> = {};
    head.forEach((h: string, i: number) => {
      // A blank cell is missing, not zero. `Number('')` is 0 rather than NaN, so the old filter let it
      // through: measured, a column with one missing value reported count 3, min 0 and mean 13.33
      // where the answer was count 2, min 10 and mean 20. A missing value and a real zero must not
      // look the same.
      const nums = body
        .map((r: string[]) => r[i]?.trim() ?? '')
        .filter((cell: string) => cell.length > 0)
        .map((cell: string) => Number(cell))
        .filter((n: number) => Number.isFinite(n));
      if (nums.length) {
        // Reduced rather than spread: `Math.min(...nums)` passes every element as an argument, and
        // a wide column overflows the call stack.
        const min = nums.reduce((a, b) => (b < a ? b : a));
        const max = nums.reduce((a, b) => (b > a ? b : a));
        out[h] = {
          count: nums.length,
          missing: body.length - nums.length,
          min,
          max,
          mean: Number((nums.reduce((a: number, b: number) => a + b, 0) / nums.length).toFixed(2)),
        };
      } else out[h] = { count: body.length, unique: new Set(body.map((r: string[]) => r[i])).size };
    });
    return jsonBlock('# CSV statistika (' + body.length + ' qator)', out);
  },
});
