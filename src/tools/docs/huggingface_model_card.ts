import { fetchUrl } from '../../core/fetcher.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { ghApi, ghErr } from '../github/_api.js';

/**
 * pro_fetch_huggingface_model_card — Read a HuggingFace model card
 * Pack: docs (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_huggingface_model_card',
  description: 'Read a HuggingFace model card',
  category: 'docs',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Model ID (masalan bert-base-uncased)' },
    },
    required: ['query'],
  },
  async handler(input) {
    const p = view(input);
    const id = String(p.query);
    const meta = await fetchWithOptions('https://huggingface.co/api/models/' + id);
    if (meta.status >= 400) return fail('Model topilmadi: ' + id);
    const card = await fetchUrl('https://huggingface.co/' + id + '/raw/main/README.md');
    return md(
      '# HuggingFace: ' +
        id +
        '\n\n' +
        (card.status < 400 ? card.markdown : 'Model card topilmadi') +
        '\n\n## Meta\n\n' +
        clipToTokens(meta.text, 1500),
    );
  },
});
