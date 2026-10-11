import { jsonBlock, fail } from '../../core/format.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_array_ops — Operate on a JSON array: unique, sort, reverse, flatten, chunk, first, last
 * Pack: data (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_array_ops',
  description: 'Operate on a JSON array: unique, sort, reverse, flatten, chunk, first, last',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'JSON array' },
      action: { type: 'string', description: 'unique|sort|reverse|flatten|chunk|first|last' },
      size: { type: 'number', description: 'chunk o‘lchami' },
      count: { type: 'number', description: 'first/last soni' },
      depth: { type: 'number', description: 'flatten chuqurligi' },
    },
    required: ['text', 'action'],
  },
  async handler(input) {
    const p = view(input);
    let arr: any[];
    try {
      arr = JSON.parse(String(p.text ?? '[]'));
    } catch {
      return fail('Yaroqsiz JSON.');
    }
    if (!Array.isArray(arr)) return fail('JSON array kerak.');
    const a = String(p.action || '').toLowerCase();
    let out: any;
    switch (a) {
      case 'unique':
        out = [...new Set(arr)];
        break;
      case 'sort':
        out = [...arr].sort((x, y) =>
          typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y)),
        );
        break;
      case 'reverse':
        out = [...arr].reverse();
        break;
      case 'flatten':
        out = arr.flat(Number.isFinite(Number(p.depth)) ? Number(p.depth) : Infinity);
        break;
      case 'chunk': {
        const s = Math.max(1, Number(p.size ?? 10));
        out = [];
        for (let i = 0; i < arr.length; i += s) out.push(arr.slice(i, i + s));
        break;
      }
      case 'first':
        out = arr.slice(0, Math.max(1, Number(p.count ?? 1)));
        break;
      case 'last':
        out = arr.slice(-Math.max(1, Number(p.count ?? 1)));
        break;
      default:
        return fail('action unique|sort|reverse|flatten|chunk|first|last.');
    }
    return jsonBlock('# Array ' + a, { count: out.length, result: out });
  },
});
