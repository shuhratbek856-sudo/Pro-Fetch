import { defineTool } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { view } from '../../core/input.js';
import { allFamilies, displayUnitsInFamily, PREFIXES, type Family } from './_units.js';

export default defineTool({
  name: 'pro_units_list',
  description:
    'Birliklarni ro‘yxat qilish: oila bo‘yicha (uzunlik, massa, harorat, hajm, tezlik, bosim, energiya, ' +
    'quvvat, vaqt, ma’lumot, chastota, kuch, burchak, yo‘l sarfi) va har bir birlikning SI birlikka ' +
    'koefitsienti. Prefikslar ro‘yxati ham beriladi.',
  category: 'units',
  inputSchema: {
    type: 'object',
    properties: {
      family: { type: 'string', description: 'Faqat shu oila (standart: barchasi)' },
      detailed: { type: 'boolean', description: 'Koefitsient va prefiks imkoniyatini ham ko‘rsatish' },
      prefixes: { type: 'boolean', description: 'Faqat prefikslar ro‘yxatini chiqarish' },
    },
  },
  async handler(input) {
    const p = view(input);
    const detailed = p.detailed === true || String(p.detailed ?? '') === 'true';
    const onlyPrefixes = p.prefixes === true || String(p.prefixes ?? '') === 'true';

    if (onlyPrefixes) {
      return jsonBlock('SI prefikslar', {
        count: Object.keys(PREFIXES).length,
        decimal: Object.entries(PREFIXES)
          .filter(([, factor]) => Number.isInteger(Math.log10(factor)))
          .map(([prefix, factor]) => `${prefix} = 1e${Math.log10(factor)}`)
          .join(', '),
        // `da` (deca, 10) and `h` (hecto, 100) are the two most often left out of a prefix list.
        note: '`da` (deka, 10) va `h` (hekto, 100) ko‘pincha tushirib qoldiriladi — ular ham ro‘yxatda.',
        all: Object.entries(PREFIXES).map(([prefix, factor]) => ({ prefix, factor })),
      });
    }

    const wanted = String(p.family ?? '');
    const families = wanted ? [wanted as Family] : allFamilies();

    const blocks: Record<string, unknown> = {};
    for (const family of families) {
      const units = displayUnitsInFamily(family);
      if (units.length === 0) continue;
      blocks[family] = detailed
        ? units.map((unit) => ({
            symbol: unit.symbol,
            name: (unit.aliases ?? [])[0] ?? unit.symbol,
            // The coefficient is relative to the family's base unit, which is what makes a conversion
            // auditable rather than a black box.
            factor: unit.factor,
            affine_offset: unit.offset ?? undefined,
            prefixable: unit.prefixable,
          }))
        : units.map((unit) => unit.symbol);
    }

    if (Object.keys(blocks).length === 0) {
      return jsonBlock('Birliklar', {
        error: `"${wanted}" oilasi yo‘q`,
        families: allFamilies(),
      });
    }

    return jsonBlock('Birliklar', {
      families: Object.keys(blocks).length,
      total: Object.values(blocks).reduce<number>((sum, value) => sum + (value as unknown[]).length, 0),
      units: blocks,
    });
  },
});
