import { defineTool } from '../../core/tool.js';
import { load } from 'cheerio';
import { result } from '../../core/format.js';
import { htmlToMarkdown } from '../../core/parser.js';
import { readTextSource } from '../../core/text-source.js';

/**
 * pro_fetch_readability_extract — Extract the main article content from a cluttered page
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_readability_extract',
  description: 'Extract the main article content from a cluttered page',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "Sahifa URL'i" },
      text: { type: 'string', description: 'HTML sahifa matni' },
      content: { type: 'string', description: 'HTML sahifa matni' },
      data: { type: 'string', description: 'HTML sahifa matni' },
    },
    required: ['url'],
  },
  async handler(input) {
    const html = await readTextSource(input, 'Readability extract');
    const $ = load(html);
    const title =
      $('meta[property="og:title"]').attr('content') ||
      $('title').first().text().trim() ||
      $('h1').first().text().trim();
    const candidates = $('article,main,[role="main"],section,div')
      .toArray()
      .map((element) => {
        const node = $(element);
        const text = node.text().replace(/\s+/g, ' ').trim();
        const links = node.find('a').text().replace(/\s+/g, ' ').trim().length;
        const density = text.length ? links / text.length : 1;
        const semanticBoost = /article|main|content|story|post/i.test(
          String(node.attr('id') ?? '') + ' ' + String(node.attr('class') ?? ''),
        )
          ? 300
          : 0;
        return { html: node.html() ?? '', text, score: text.length - density * 800 + semanticBoost };
      })
      .filter((candidate) => candidate.text.length >= 200)
      .sort((left, right) => right.score - left.score);
    const selected = candidates[0]?.html ?? $('body').html() ?? $.root().html() ?? '';
    const $content = load(selected);
    $content('script,style,noscript,nav,footer,aside,form,button,iframe').remove();
    const markdown = await htmlToMarkdown($content.html() ?? selected);
    return result(
      JSON.stringify({ title, wordCount: markdown.split(/\s+/).filter(Boolean).length, content: markdown }, null, 2),
    );
  },
});
