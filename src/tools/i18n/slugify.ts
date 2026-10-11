import { defineTool } from '../../core/tool.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_slugify — Convert text to a URL-friendly slug
 * Pack: i18n (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_slugify',
  description: 'Convert text to a URL-friendly slug',
  category: 'i18n',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Matn' },
      format: { type: 'string', description: 'Separator (bo‘shliq -> -)' },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const sep = String(p.format ?? '-');
    const slug = String(p.text ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, sep)
      .replace(new RegExp('^' + sep + '+|' + sep + '+$', 'g'), '');
    return result(slug);
  },
});
