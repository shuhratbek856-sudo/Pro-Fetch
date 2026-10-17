import { defineTool } from '../../core/tool.js';
import { jsonBlock } from '../../core/format.js';
import { arr, strOrEmpty, view } from '../../core/input.js';
import { fail } from '../../core/format.js';
import { soundex } from './_phonetics.js';

export default defineTool({
  name: 'pro_phonetics_soundex',
  description:
    'Nomlarga US Census Soundex kodi berish va bir xil kodli nomlarni guruhlash. "Robert" va "Rupert" ' +
    'ikkalasi R163 bo‘ladi. Ro‘yxat berilsa, guruhlar va eng katta guruhlar chiqadi.',
  category: 'phonetics',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Bitta nom' },
      names: { type: 'array', items: { type: 'string' }, description: 'Nomlar ro‘yxati' },
      group: { type: 'boolean', description: 'Bir xil kodli nomlarni guruhlash' },
      min_group: { type: 'number', description: 'Faqat shu yekundan katta guruhlar (standart 2)' },
    },
    anyOf: [{ required: ['name'] }, { required: ['names'] }],
  },
  async handler(input) {
    const p = view(input);
    const list = arr(p, 'names').map((item) => String(item));
    const single = strOrEmpty(p, 'name');
    const wanted = single ? [single] : list;

    // `fail`, not `jsonBlock` with an `error` key. The schema publishes `anyOf: [name, names]`, so an
    // empty call is a refusal, and a refusal that arrives as `isError: false` tells the caller the call
    // succeeded. `tests/all-tools.test.ts` encodes exactly that contract and caught this.
    if (wanted.length === 0) return fail('name yoki names kerak.');
    if (wanted.length > 5000) return fail(`5000 dan ortiq nom berildi (${wanted.length}).`);

    const group = p.group === true || String(p.group ?? '') === 'true' || wanted.length > 1;
    const minGroup = Math.max(2, Number(p.min_group ?? 2) || 2);

    const coded = wanted.map((name) => ({ name, code: soundex(name) }));
    const blank = coded.filter((entry) => entry.code === '');

    const result: Record<string, unknown> = {
      count: coded.length,
      items: coded.slice(0, 500),
      // A name with no letters produces no code. Saying so beats an empty string that looks like a
      // code the caller might match against.
      uncodeable: blank.length > 0 ? blank.slice(0, 20).map((entry) => entry.name) : undefined,
    };

    if (group) {
      const buckets = new Map<string, string[]>();
      for (const entry of coded) {
        if (!entry.code) continue;
        const bucket = buckets.get(entry.code) ?? [];
        bucket.push(entry.name);
        buckets.set(entry.code, bucket);
      }
      const all = [...buckets.entries()]
        .map(([code, names]) => ({ code, names, size: names.length }))
        .sort((a, b) => b.size - a.size);
      result.groups = all;
      result.matching_groups = all.filter((entry) => entry.size >= minGroup).length;
      result.matches = all.filter((entry) => entry.size >= minGroup).slice(0, 100);
    }

    return jsonBlock(group ? 'Soundex guruhlari' : `Soundex: ${wanted[0]}`, result);
  },
});
