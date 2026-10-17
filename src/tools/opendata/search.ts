import { defineTool } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { searchCatalog } from './_opendata.js';

export default defineTool({
  name: 'pro_opendata_search',
  description:
    'Socrata ochiq ma’lumot katalogida qidirish (data.gov, NY, Chicago, LA va boshqa portallar). ' +
    'Har bir natija domeni, id va permalinki bilan - keyingi qadamlarda aynan shular kerak.',
  category: 'opendata',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Qidiruv so‘zi (bo‘sh bo‘lsa, domen bo‘yicha ro‘yxat)' },
      domain: { type: 'string', description: 'Faqat shu domen: data.cityofnewyork.us' },
      type: {
        type: 'string',
        enum: ['dataset', 'chart', 'metric', 'story', 'map'],
        description: 'Nima qidiriladi (standart: dataset)',
      },
      limit: { type: 'number', description: 'Qancha natija (standart 10, ko‘pi bilan 50)' },
      offset: { type: 'number', description: 'Qayerdan boshlash' },
      columns: { type: 'boolean', description: 'Ustunlar ro‘yxatini ham kiritish' },
    },
  },
  async handler(input) {
    const p = view(input);
    const query = strOrEmpty(p, 'query');
    const domain = strOrEmpty(p, 'domain');
    const type = strOrEmpty(p, 'type') || 'dataset';
    const withColumns = p.columns === true || String(p.columns ?? '') === 'true';
    const limit = Math.max(1, Math.min(num(p, 'limit', 10) || 10, 50));
    const offset = Math.max(0, num(p, 'offset', 0));

    if (!query && !domain) {
      return jsonBlock('Socrata katalog', {
        total: 0,
        results: [],
        hint: 'Kamida query yoki domain bering - ikkalasi ham bo‘sh bo‘lsa, butun katalogni o‘qib bo‘lmaydi.',
      });
    }

    const found = await searchCatalog({ query, domains: domain || undefined, limit, offset, type });
    if (!found.ok) return jsonBlock('Socrata katalog', { error: found.message });

    return jsonBlock(`Socrata: "${query || domain}"`, {
      query: query || undefined,
      domain: domain || undefined,
      type,
      // The catalog's own total, not the page length.
      total: found.total,
      returned: found.results.length,
      offset,
      results: found.results.map((result) => ({
        id: result.id,
        name: result.name,
        domain: result.domain,
        permalink: result.permalink,
        updated_at: result.updated_at,
        download_count: result.download_count,
        categories: result.categories,
        description: result.description || undefined,
        columns:
          withColumns && result.columns
            ? result.columns.map((column) => `${column.name} (${column.data_type_name})`)
            : undefined,
      })),
    });
  },
});
