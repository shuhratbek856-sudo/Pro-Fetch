import { defineTool } from '../../core/tool.js';
import JSZip from 'jszip';
import { load } from 'cheerio';
import { result } from '../../core/format.js';
import { readBinarySource } from '../../core/binary-source.js';

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? '';
  let index = 0;
  for (const letter of letters) index = index * 26 + letter.charCodeAt(0) - 64;
  return Math.max(0, index - 1);
}

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

async function loadSheets(bytes: Buffer): Promise<Record<string, string[][]>> {
  const zip = await JSZip.loadAsync(bytes);
  const workbookXml = await zip.file('xl/workbook.xml')?.async('text');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text');
  if (!workbookXml || !relsXml) throw new Error('XLSX workbook metadata topilmadi.');
  const $rels = load(relsXml, { xmlMode: true });
  const relations = new Map<string, string>();
  $rels('Relationship').each((_index, node) => {
    relations.set($rels(node).attr('Id') ?? '', $rels(node).attr('Target') ?? '');
  });
  const $book = load(workbookXml, { xmlMode: true });
  const definitions = $book('sheet')
    .toArray()
    .map((node) => ({
      name: $book(node).attr('name') ?? 'Sheet',
      relation: $book(node).attr('r:id') ?? $book(node).attr('id') ?? '',
    }));
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('text');
  const shared = sharedXml
    ? load(sharedXml, { xmlMode: true })('si')
        .toArray()
        .map((node) => load(sharedXml, { xmlMode: true })(node).text())
    : [];
  const output: Record<string, string[][]> = {};
  for (const sheet of definitions) {
    const target = relations.get(sheet.relation);
    if (!target || /^https?:/i.test(target)) continue;
    const path = (target.startsWith('/') ? target.slice(1) : `xl/${target}`)
      .split('/')
      .reduce<string[]>((parts, segment) => {
        if (segment === '..') parts.pop();
        else if (segment && segment !== '.') parts.push(segment);
        return parts;
      }, [])
      .join('/');
    if (!path.startsWith('xl/worksheets/')) continue;
    const xml = await zip.file(path)?.async('text');
    if (!xml) continue;
    const $ = load(xml, { xmlMode: true });
    const rows: string[][] = [];
    $('sheetData > row').each((_rowIndex, rowNode) => {
      const row: string[] = [];
      $(rowNode)
        .children('c')
        .each((_cellIndex, cellNode) => {
          const cell = $(cellNode);
          const index = columnIndex(cell.attr('r') ?? 'A1');
          const type = cell.attr('t') ?? '';
          const raw = cell.children('v').first().text();
          row[index] =
            type === 's'
              ? (shared[Number(raw)] ?? '')
              : type === 'inlineStr'
                ? cell.find('is t').text()
                : type === 'b'
                  ? raw === '1'
                    ? 'true'
                    : 'false'
                  : raw;
        });
      rows.push(row.map((value) => value ?? ''));
    });
    output[sheet.name] = rows;
  }
  return output;
}

/**
 * pro_fetch_xlsx_to_csv — Convert an Excel sheet to CSV
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_xlsx_to_csv',
  description: 'Convert an Excel sheet to CSV',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "XLSX faylining URL'i" },
      base64: { type: 'string', description: "XLSX faylining base64 ma'lumoti" },
      sheet_name: { type: 'string', description: 'Eksport qilinadigan sheet nomi (default birinchi sheet)' },
      max_bytes: { type: 'number', description: 'Eng katta XLSX hajmi, byte (max 100 MiB)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const sheets = await loadSheets(await readBinarySource(input, 'XLSX to CSV'));
    const requested = typeof input.sheet_name === 'string' ? input.sheet_name : '';
    const entry = requested ? Object.entries(sheets).find(([name]) => name === requested) : Object.entries(sheets)[0];
    if (!entry) throw new Error(requested ? `XLSX sheet '${requested}' topilmadi.` : 'XLSX ichida sheet topilmadi.');
    return result(entry[1].map((row) => row.map(csvEscape).join(',')).join('\n'));
  },
});
