import { defineTool } from '../../core/tool.js';
import { load } from 'cheerio';
import { result } from '../../core/format.js';
import { htmlToMarkdown } from '../../core/parser.js';
import { readTextSource } from '../../core/text-source.js';

/**
 * pro_fetch_html_to_markdown — Convert raw HTML to clean Markdown
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_html_to_markdown',
  description: 'Convert raw HTML to clean Markdown',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "HTML manba URL'i" },
      text: { type: 'string', description: 'HTML manba matni' },
      content: { type: 'string', description: 'HTML manba matni' },
      data: { type: 'string', description: 'HTML manba matni' },
    },
    required: ['url'],
  },
  async handler(input) {
    const html = await readTextSource(input, 'HTML to Markdown');
    const $ = load(html);
    $('script,style,noscript,template,svg,canvas,iframe,nav,footer,aside').remove();
    const content =
      $('article').first().html() ?? $('main').first().html() ?? $('body').html() ?? $.root().html() ?? '';
    return result(await htmlToMarkdown(content));
  },
});
