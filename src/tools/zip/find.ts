import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { bool, view } from '../../core/input.js';
import { readBinarySource } from '../../core/binary-source.js';
import { readEntry, readZip } from './_zip.js';

/** An entry larger than this is not scanned as text; a 40 MB binary is not a search hit. */
const MAX_TEXT_ENTRY = 8 * 1024 * 1024;

function toMatcher(needle: string, wholeWord: boolean): (line: string) => boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  const compiled = new RegExp(pattern, 'i');
  return (line) => compiled.test(line);
}

export default defineTool({
  name: 'pro_zip_find',
  description:
    'ZIP ichida qidirish: fayl nomi bo‘yicha va yoki matn bo‘yicha. Topilgan qatorlar raqam bilan ' +
    'birga beriladi. Katta yoki ikkilik fayllar skanlanmaydi va bu alohida hisoblanadi.',
  category: 'zip',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'ZIP fayl URL i' },
      base64: { type: 'string', description: 'ZIP fayl base64' },
      data_base64: { type: 'string', description: 'ZIP fayl base64 (boshqa yozuv)' },
      query: { type: 'string', description: 'Matn ichidan qidiriladigan so‘z' },
      name: { type: 'string', description: 'Fayl nomida qidiriladigan qism' },
      whole_word: { type: 'boolean', description: 'Butun so‘z bo‘yicha qidirish' },
      case_sensitive: { type: 'boolean', description: 'Katta-kichik harflarga sezgir' },
      max_results: { type: 'number', description: 'Ko‘pi bilan shuncha natija (standart 50)' },
      max_bytes: { type: 'number', description: 'Yuklab olish hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const query = String(p.query ?? '');
    const nameFilter = String(p.name ?? '');
    const wholeWord = bool(p, 'whole_word', false);
    const caseSensitive = bool(p, 'case_sensitive', false);
    const maxResultsValue = Number(p.max_results ?? 50);
    const maxResults = Math.max(1, Math.min(Number.isFinite(maxResultsValue) ? Math.floor(maxResultsValue) : 50, 500));

    if (!query && !nameFilter) {
      return fail('query yoki name kerak: qayerda qidirish kerakligi ko‘rsatilmagan.');
    }

    const data = await readBinarySource(input, 'ZIP faylni qidirish');
    if (data.length === 0) return fail('ZIP fayl bo‘sh.');

    let archive;
    try {
      archive = readZip(data);
    } catch (error) {
      return fail(`ZIP o‘qilmadi: ${(error as Error).message}`);
    }

    const lowerName = nameFilter.toLowerCase();
    const matchesLine = query ? toMatcher(query, wholeWord) : () => false;
    const results: Array<Record<string, unknown>> = [];
    const nameMatches: string[] = [];
    const unreadable: Array<{ name: string; reason: string }> = [];
    let scanned = 0;
    let skippedTooLarge = 0;

    for (const entry of archive.entries) {
      if (entry.is_directory) continue;
      const nameHit = nameFilter ? entry.name.toLowerCase().includes(lowerName) : false;
      if (nameHit && nameMatches.length < 500) nameMatches.push(entry.name);
      if (!nameHit && !query) continue;
      if (results.length >= maxResults) continue;
      if (entry.uncompressed_size > MAX_TEXT_ENTRY) {
        skippedTooLarge += 1;
        continue;
      }

      let content: Buffer;
      try {
        content = readEntry(data, entry, MAX_TEXT_ENTRY);
      } catch (error) {
        unreadable.push({ name: entry.name, reason: (error as Error).message });
        continue;
      }
      // A NUL byte in the first kilobyte is a binary file. Searching it would produce "matches"
      // inside compressed or binary data, which is worse than not looking.
      const probe = content.subarray(0, 1024);
      if (probe.includes(0)) continue;
      scanned += 1;

      const text = content.toString('utf8');
      const lines = text.split('\n');
      let hitsInEntry = 0;
      for (const [index, line] of lines.entries()) {
        if (results.length >= maxResults) break;
        const lineHit = query ? (caseSensitive ? line.includes(query) : matchesLine(line)) : true;
        if (!lineHit && !nameHit) continue;
        results.push({
          name: entry.name,
          line: index + 1,
          matched_by: nameHit && (query ? lineHit : true) ? (lineHit ? 'nom+matn' : 'nom') : 'matn',
          text: line.length > 300 ? line.slice(0, 300) + '…' : line,
        });
        hitsInEntry += 1;
      }
      if (hitsInEntry === 0 && nameHit) {
        results.push({ name: entry.name, line: 0, matched_by: 'nom', text: '(nom mos keldi)' });
      }
    }

    return jsonBlock('ZIP qidiruvi', {
      archive_entries: archive.entries.length,
      query: query || undefined,
      name: nameFilter || undefined,
      scanned_entries: scanned,
      skipped_binary_or_large: skippedTooLarge,
      name_matches: nameMatches.length > 0 ? nameMatches.slice(0, 50) : undefined,
      results: results.slice(0, maxResults),
      result_count: results.length,
      truncated: results.length >= maxResults ? 'natija chegarasi to‘ldi' : undefined,
      unreadable: unreadable.length > 0 ? unreadable.slice(0, 10) : undefined,
    });
  },
});
