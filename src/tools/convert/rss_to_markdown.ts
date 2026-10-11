import { defineTool } from '../../core/tool.js';
import { load } from 'cheerio';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';

/**
 * pro_fetch_rss_to_markdown — Fetch an RSS feed and render items as Markdown
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_rss_to_markdown',
  description: 'Fetch an RSS feed and render items as Markdown',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "RSS feed URL'i" },
      text: { type: 'string', description: 'RSS XML matni' },
      content: { type: 'string', description: 'RSS XML matni' },
      data: { type: 'string', description: 'RSS XML matni' },
      limit: { type: 'number', description: 'Eng ko‘p feed item (1-100)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const xml = await readTextSource(input, 'RSS to Markdown');
    const $ = load(xml, { xmlMode: true });
    if (!$('rss').length && !$('channel').length) throw new Error('Manba RSS channel emas.');
    const limitValue = Number(input.limit ?? 50);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(100, Math.floor(limitValue))) : 50;
    const channel = $('channel').first();
    const title = channel.children('title').first().text().trim();
    const description = channel.children('description').first().text().trim();
    const items = channel
      .children('item')
      .toArray()
      .slice(0, limit)
      .map((element) => {
        const item = $(element);
        const itemTitle = item.children('title').first().text().trim() || '(Untitled)';
        const link = item.children('link').first().text().trim();
        const date = item.children('pubDate').first().text().trim();
        const summary = item.children('description').first().text().trim();
        return `## ${itemTitle}\n${link ? `[Open item](${link})` : ''}${date ? `\n\n${date}` : ''}${summary ? `\n\n${summary}` : ''}`.trim();
      });
    return result([title ? `# ${title}` : '# RSS feed', description, ...items].filter(Boolean).join('\n\n'));
  },
});
