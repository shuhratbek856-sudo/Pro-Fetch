import { defineTool } from '../../core/tool.js';
import { load } from 'cheerio';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';

/**
 * pro_fetch_html_to_text — Convert HTML to plain text without markup
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_html_to_text',
  description: 'Convert HTML to plain text without markup',
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
    const html = await readTextSource(input, 'HTML to text');
    const $ = load(html);
    $('script,style,noscript,template,svg,canvas,iframe').remove();
    $('br').replaceWith('\n');
    $('p,div,section,article,li,h1,h2,h3,h4,h5,h6,tr').each((_index, node) => {
      $(node).append('\n');
    });
    const text = $.root()
      .text()
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return result(text);
  },
});
