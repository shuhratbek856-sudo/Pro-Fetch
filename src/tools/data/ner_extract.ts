import { result, jsonBlock, fail } from '../../core/format.js';
import { hasSecondText } from '../../core/text-comparison.js';

/**
 * pro_fetch_ner_extract — Extract named entities such as people orgs and places
 * Pack: data (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_ner_extract',
  description: 'Extract named entities such as people orgs and places',
  category: 'data',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Kirish matni' },
      text2: {
        type: 'string',
        description: 'Ikkinchi matn — berilsa, ikkala matnning obyektlari topiladi va farqi chiqariladi',
      },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    // `text2` was declared and ignored. Entity extraction over a second text is the obvious use -
    // the same heuristic run twice - so the tool now reports which entities appear in one, the other,
    // or both.
    const extract = (text: string) => {
      const people = new Set<string>();
      const orgs = new Set<string>();
      for (const m of text.match(/\b([A-Z][a-zA-Z'\u0400-\u04FF]+(?: [A-Z][a-zA-Z'\u0400-\u04FF]+)+)\b/g) ?? [])
        people.add(m);
      for (const m of text.match(/\b([A-Z][\w&.-]+(?: (?:Inc|Corp|LLC|Ltd|GmbH|LLP|Co|Foundation|Group|Labs?))+)\b/g) ??
        [])
        orgs.add(m);
      return { people: [...people].slice(0, 20), orgs: [...orgs].slice(0, 20) };
    };

    const first = extract(String(p.text ?? ''));

    if (!hasSecondText(p.text2)) return jsonBlock('# NER (heuristik)', first);

    const second = extract(p.text2);
    const firstNames = new Set([...first.people, ...first.orgs]);
    const secondNames = new Set([...second.people, ...second.orgs]);

    return jsonBlock('# NER (heuristik, taqqoslash)', {
      text: first,
      text2: second,
      only_in_text: [...firstNames].filter((name) => !secondNames.has(name)),
      only_in_text2: [...secondNames].filter((name) => !firstNames.has(name)),
      shared: [...firstNames].filter((name) => secondNames.has(name)),
    });
  },
});
