import { defineTool } from '../../core/tool.js';
import JSZip from 'jszip';
import path from 'node:path';
import { load } from 'cheerio';
import { result } from '../../core/format.js';
import { htmlToText } from '../../core/parser.js';
import { readBinarySource } from '../../core/binary-source.js';

function packagePath(base: string, target: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//'))
    throw new Error('EPUB remote spine resources qo‘llab-quvvatlanmaydi.');
  const decoded = decodeURIComponent(target.split('#')[0].split('?')[0]);
  const joined = path.posix.normalize(path.posix.join(base, decoded)).replace(/^\//, '');
  if (joined === '..' || joined.startsWith('../')) throw new Error('EPUB package ichidan tashqariga yo‘l taqiqlangan.');
  return joined;
}

/**
 * pro_fetch_epub_to_text — Extract text from an EPUB e-book
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_epub_to_text',
  description: 'Extract text from an EPUB e-book',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "EPUB faylining URL'i" },
      base64: { type: 'string', description: "EPUB faylining base64 ma'lumoti" },
      max_bytes: { type: 'number', description: 'Eng katta EPUB hajmi, byte (max 100 MiB)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const zip = await JSZip.loadAsync(await readBinarySource(input, 'EPUB to text'));
    const containerXml = await zip.file('META-INF/container.xml')?.async('text');
    if (!containerXml) throw new Error('EPUB container.xml topilmadi.');
    const rootfile = load(containerXml, { xmlMode: true })('rootfile').first().attr('full-path');
    if (!rootfile) throw new Error('EPUB rootfile path topilmadi.');
    const packageXml = await zip.file(packagePath('', rootfile))?.async('text');
    if (!packageXml) throw new Error('EPUB package document topilmadi.');
    const $package = load(packageXml, { xmlMode: true });
    const packageDirectory = path.posix.dirname(rootfile);
    const manifest = new Map<string, string>();
    $package('manifest item').each((_index, node) => {
      manifest.set($package(node).attr('id') ?? '', $package(node).attr('href') ?? '');
    });
    const chapters: string[] = [];
    for (const item of $package('spine itemref').toArray()) {
      const id = $package(item).attr('idref') ?? '';
      const href = manifest.get(id);
      if (!href) continue;
      const chapterPath = packagePath(packageDirectory, href);
      const chapter = await zip.file(chapterPath)?.async('text');
      if (!chapter) continue;
      const $chapter = load(chapter);
      $chapter('script,style,noscript,nav').remove();
      chapters.push(htmlToText($chapter('body').html() ?? chapter));
    }
    if (!chapters.length) throw new Error('EPUB spine ichidan o‘qiladigan chapter topilmadi.');
    return result(chapters.join('\n\n'));
  },
});
