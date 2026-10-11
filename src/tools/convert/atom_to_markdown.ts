import { defineTool } from '../../core/tool.js';
import { load } from 'cheerio';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';

/**
 * pro_fetch_atom_to_markdown — Fetch an Atom feed and render items as Markdown
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_atom_to_markdown',
  description: 'Fetch an Atom feed and render items as Markdown',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "Atom feed URL'i" },
      text: { type: 'string', description: 'Atom XML matni' },
      content: { type: 'string', description: 'Atom XML matni' },
      data: { type: 'string', description: 'Atom XML matni' },
      limit: { type: 'number', description: 'Eng ko‘p feed entry (1-100)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const xml = await readTextSource(input, 'Atom to Markdown');
    const $ = load(xml, { xmlMode: true });
    const feed = $('feed').first();
    if (!feed.length) throw new Error('Manba Atom feed emas.');
    const limitValue = Number(input.limit ?? 50);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(100, Math.floor(limitValue))) : 50;
    const title = feed.children('title').first().text().trim();
    const subtitle = feed.children('subtitle').first().text().trim();
    const entries = feed
      .children('entry')
      .toArray()
      .slice(0, limit)
      .map((element) => {
        const entry = $(element);
        const entryTitle = entry.children('title').first().text().trim() || '(Untitled)';
        const link =
          entry
            .children('link')
            .toArray()
            .map((node) => $(node))
            .find((node) => node.attr('rel') === 'alternate' || !node.attr('rel'))
            ?.attr('href') ?? '';
        const date =
          entry.children('updated').first().text().trim() || entry.children('published').first().text().trim();
        const summary = entry.children('summary,content').first().text().trim();
        return `## ${entryTitle}\n${link ? `[Open entry](${link})` : ''}${date ? `\n\n${date}` : ''}${summary ? `\n\n${summary}` : ''}`.trim();
      });
    return result([title ? `# ${title}` : '# Atom feed', subtitle, ...entries].filter(Boolean).join('\n\n'));
  },
});
