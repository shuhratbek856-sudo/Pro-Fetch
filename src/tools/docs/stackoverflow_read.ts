import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_stackoverflow_read — Read a Stack Overflow question and answers
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_stackoverflow_read',
  description: 'Read a Stack Overflow question and answers',
  category: 'docs',
  inputSchema: {
    type: 'object',
    properties: {
      question_id: { type: 'string', description: 'Savol ID' },
    },
    required: ['question_id'],
  },
  async handler(input) {
    const p = view(input);
    const id = encodeURIComponent(String(p.question_id));
    const q = await fetchWithOptions(
      'https://api.stackexchange.com/2.3/questions/' +
        id +
        '?order=desc&sort=activity&site=stackoverflow&filter=withbody',
    );
    const a = await fetchWithOptions(
      'https://api.stackexchange.com/2.3/questions/' +
        id +
        '/answers?order=desc&sort=votes&site=stackoverflow&filter=withbody',
    );
    const qj = JSON.parse(q.text || '{}');
    const aj = JSON.parse(a.text || '{}');
    if (!qj.items?.length) return fail('Savol topilmadi: ' + p.question_id);
    const q0 = qj.items[0];
    return md(
      '# ' +
        q0.title +
        '\n\n' +
        clipToTokens(q0.body ?? '', 3000) +
        '\n\n## Javoblar\n\n' +
        (aj.items ?? []).map((x: any, i: number) => i + 1 + '. ' + clipToTokens(x.body ?? '', 2000)).join('\n\n'),
    );
  },
});
