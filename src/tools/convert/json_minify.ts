import { hasUnsafeInteger, minifyJsonText } from './_json-text.js';
import { defineTool } from '../../core/tool.js';
import { readTextSource } from '../../core/text-source.js';
import { result, fail } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_json_minify — Minify JSON by removing whitespace
 * Pack: convert (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_json_minify',
  description: 'Minify JSON by removing whitespace',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manba URL' },
      text: { type: 'string', description: 'Manba matni' },
      content: { type: 'string', description: 'Manba matni' },
      data: { type: 'string', description: 'Manba matni' },
    },
    required: [],
  },
  async handler(input) {
    const p = view(input);
    const raw = await readTextSource(input, 'JSON minify');
    // Validated by parsing, but *minified* from the text. Measured: parsing and re-serialising
    // collapsed a duplicate key, rounded an integer beyond 2^53, and reordered integer-like keys �
    // a minifier that changes the document is not a minifier.
    try {
      JSON.parse(raw);
    } catch {
      return fail('Yaroqli JSON bo‘lishi kerak.');
    }
    const minified = minifyJsonText(raw);
    return result(
      hasUnsafeInteger(raw)
        ? minified +
            String.fromCharCode(10) +
            String.fromCharCode(10) +
            'Manba matnida 2^53 dan katta butun son bor: JavaScript uni aniq saqlay olmaydi, ' +
            'shuning uchun qiymat o‘zgarishi mumkin.'
        : minified,
    );
  },
});
