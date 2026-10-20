import { defineTool } from '../../core/tool.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_case_convert — Convert text case: camel, snake, kebab, pascal, title or sentence
 * Pack: i18n (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_case_convert',
  description: 'Convert text case: camel, snake, kebab, pascal, title or sentence',
  category: 'i18n',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Matn' },
      format: { type: 'string', description: 'camel|snake|kebab|pascal|title|sentence' },
    },
    required: ['text', 'format'],
  },
  async handler(input) {
    const p = view(input);
    // Unicode-aware word boundaries. `[^A-Za-z0-9]+` treated every Cyrillic, Turkish or CJK letter
    // as a separator, so `case_convert("Привет мир", snake)` returned an empty string - the words
    // were 'separated' out of existence. `\p{L}\p{N}` keeps any real letter or digit.
    const words = String(p.text ?? '')
      .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    // Spread instead of charAt(0): astral letters (ඤ, 𝕏) are two code units and charAt would
    // capitalise half of them.
    const cap = (w: string) => [...w][0]!.toUpperCase() + [...w].slice(1).join('').toLowerCase();
    const f = String(p.format).toLowerCase();
    let out: string;
    switch (f) {
      case 'camel':
        out = words.map((w, i) => (i ? cap(w) : w.toLowerCase())).join('');
        break;
      case 'pascal':
        out = words.map(cap).join('');
        break;
      case 'snake':
        out = words.map((w) => w.toLowerCase()).join('_');
        break;
      case 'kebab':
        out = words.map((w) => w.toLowerCase()).join('-');
        break;
      case 'title':
        out = words.map(cap).join(' ');
        break;
      case 'sentence':
        out = words.length
          ? cap(words[0]) +
            ' ' +
            words
              .slice(1)
              .map((w) => w.toLowerCase())
              .join(' ')
          : '';
        break;
      default:
        return fail('format camel|snake|kebab|pascal|title|sentence.');
    }
    return result(out);
  },
});
