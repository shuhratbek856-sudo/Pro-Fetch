import { defineTool } from '../../core/tool.js';
import JSZip from 'jszip';
import { load } from 'cheerio';
import { result } from '../../core/format.js';
import { readBinarySource } from '../../core/binary-source.js';

function xmlAttribute(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.match(new RegExp(`(?:^|\\s)${escaped}=["']([^"']*)["']`))?.[1] ?? '';
}

/**
 * pro_fetch_pptx_to_text — Extract text from PowerPoint slides
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_pptx_to_text',
  description: 'Extract text from PowerPoint slides',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "PPTX faylining URL'i" },
      base64: { type: 'string', description: "PPTX faylining base64 ma'lumoti" },
      max_bytes: { type: 'number', description: 'Eng katta PPTX hajmi, byte (max 100 MiB)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const zip = await JSZip.loadAsync(await readBinarySource(input, 'PPTX to text'));
    const presentationXml = await zip.file('ppt/presentation.xml')?.async('text');
    const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')?.async('text');
    if (!presentationXml || !relsXml) throw new Error('PPTX presentation metadata topilmadi.');
    const relationships = new Map<string, string>();
    for (const relation of relsXml.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g))
      relationships.set(xmlAttribute(relation[0], 'Id'), xmlAttribute(relation[0], 'Target'));
    const slides = [...presentationXml.matchAll(/<(?:\w+:)?sldId\b[^>]*>/g)];
    const output: string[] = [];
    for (let index = 0; index < slides.length; index++) {
      const relationId = xmlAttribute(slides[index][0], 'r:id');
      const target = relationships.get(relationId);
      if (!target || /^https?:/i.test(target)) continue;
      const slidePath = target.startsWith('/') ? target.slice(1) : `ppt/${target}`;
      const normalized = slidePath
        .split('/')
        .reduce<string[]>((parts, item) => {
          if (item === '..') parts.pop();
          else if (item && item !== '.') parts.push(item);
          return parts;
        }, [])
        .join('/');
      if (!normalized.startsWith('ppt/slides/')) continue;
      const slideXml = await zip.file(normalized)?.async('text');
      if (!slideXml) continue;
      const paragraphs = [...slideXml.matchAll(/<(?:\w+:)?p\b[^>]*>([\s\S]*?)<\/(?:\w+:)?p>/g)]
        .map((paragraph) =>
          [...paragraph[1].matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
            .map((node) => load(node[1], { xmlMode: true }).text())
            .join(''),
        )
        .filter(Boolean);
      output.push(`## Slide ${index + 1}\n\n${paragraphs.join('\n')}`);
    }
    if (!output.length) throw new Error('PPTX ichidan slide matni topilmadi.');
    return result(output.join('\n\n'));
  },
});
