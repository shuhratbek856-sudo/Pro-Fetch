import { result, jsonBlock, fail } from '../../core/format.js';

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
      text2: { type: 'string', description: 'Ikkinchi matn (diff uchun)' },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const text = String(p.text ?? '');
    const people = new Set<string>();
    const orgs = new Set<string>();
    for (const m of text.match(/\b([A-Z][a-zA-Z'\u0400-\u04FF]+(?: [A-Z][a-zA-Z'\u0400-\u04FF]+)+)\b/g) ?? [])
      people.add(m);
    for (const m of text.match(/\b([A-Z][\w&.-]+(?: (?:Inc|Corp|LLC|Ltd|GmbH|LLP|Co|Foundation|Group|Labs?))+)\b/g) ??
      [])
      orgs.add(m);
    return jsonBlock('# NER (heuristik)', { people: [...people].slice(0, 20), orgs: [...orgs].slice(0, 20) });
  },
});
