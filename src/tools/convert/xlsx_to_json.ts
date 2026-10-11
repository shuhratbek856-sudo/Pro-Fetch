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

async function workbookRows(bytes: Buffer): Promise<Record<string, string[][]>> {
  const zip = await JSZip.loadAsync(bytes);
  const workbookXml = await zip.file('xl/workbook.xml')?.async('text');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('text');
  if (!workbookXml || !relsXml) throw new Error('XLSX workbook.xml yoki workbook relationships topilmadi.');
  const $rels = load(relsXml, { xmlMode: true });
  const relationships = new Map<string, string>();
  $rels('Relationship').each((_index, element) => {
    relationships.set($rels(element).attr('Id') ?? '', $rels(element).attr('Target') ?? '');
  });
  const $workbook = load(workbookXml, { xmlMode: true });
  const sheetDefs = $workbook('sheet')
    .toArray()
    .map((element) => ({
      name: $workbook(element).attr('name') ?? 'Sheet',
      relation: $workbook(element).attr('r:id') ?? $workbook(element).attr('id') ?? '',
    }));
  if (!sheetDefs.length) throw new Error('XLSX workbook ichida sheet topilmadi.');
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('text');
  const shared = sharedXml
    ? load(sharedXml, { xmlMode: true })('si')
        .toArray()
        .map((item) => load(sharedXml, { xmlMode: true })(item).text())
    : [];
  const output: Record<string, string[][]> = {};
  for (const sheet of sheetDefs) {
    const target = relationships.get(sheet.relation);
    if (!target || target.startsWith('http:') || target.startsWith('https:')) continue;
    const normalized = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const sheetPath = normalized
      .split('/')
      .reduce<string[]>((parts, part) => {
        if (part === '..') parts.pop();
        else if (part && part !== '.') parts.push(part);
        return parts;
      }, [])
      .join('/');
    if (!sheetPath.startsWith('xl/worksheets/')) continue;
    const xml = await zip.file(sheetPath)?.async('text');
    if (!xml) continue;
    const $ = load(xml, { xmlMode: true });
    const rows: string[][] = [];
    $('sheetData > row').each((_rowIndex, rowElement) => {
      const row: string[] = [];
      $(rowElement)
        .children('c')
        .each((_cellIndex, cellElement) => {
          const cell = $(cellElement);
          const index = columnIndex(cell.attr('r') ?? 'A1');
          const type = cell.attr('t') ?? '';
          const raw = cell.children('v').first().text();
          let value = raw;
          if (type === 's') value = shared[Number(raw)] ?? '';
          else if (type === 'inlineStr') value = cell.find('is t').text();
          else if (type === 'b') value = raw === '1' ? 'true' : 'false';
          else if (type !== 'e' && raw !== '' && Number.isFinite(Number(raw))) value = String(Number(raw));
          row[index] = value;
        });
      rows.push(row.map((value) => value ?? ''));
    });
    output[sheet.name] = rows;
  }
  return output;
}

/**
 * pro_fetch_xlsx_to_json — Convert an Excel sheet to JSON rows
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_xlsx_to_json',
  description: 'Convert an Excel sheet to JSON rows',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "XLSX faylining URL'i" },
      base64: { type: 'string', description: "XLSX faylining base64 ma'lumoti" },
      max_bytes: { type: 'number', description: 'Eng katta XLSX hajmi, byte (max 100 MiB)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const sheets = await workbookRows(await readBinarySource(input, 'XLSX to JSON'));
    const output = Object.fromEntries(
      Object.entries(sheets).map(([name, rows]) => {
        const [rawHeaders = [], ...dataRows] = rows;
        const duplicates = new Map<string, number>();
        const headers = rawHeaders.map((header, index) => {
          const base = header.trim() || `column_${index + 1}`;
          const count = (duplicates.get(base) ?? 0) + 1;
          duplicates.set(base, count);
          return count === 1 ? base : `${base}_${count}`;
        });
        return [
          name,
          dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))),
        ];
      }),
    );
    return result(JSON.stringify(output, null, 2));
  },
});
