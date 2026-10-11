import { defineTool } from '../../core/tool.js';
import { readTextSource } from '../../core/text-source.js';
import { result, fail } from '../../core/format.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_markdown_to_html — Convert simple Markdown to HTML
 * Pack: convert (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_markdown_to_html',
  description: 'Convert simple Markdown to HTML',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manba URL' },
      text: { type: 'string', description: 'Manba matni' },
      content: { type: 'string', description: 'Manba matni' },
      data: { type: 'string', description: 'Manba matni' },
    },
    required: [],
  },
  async handler(input) {
    const p = view(input);
    const md = await readTextSource(input, 'Markdown to HTML');
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = md.split(/\r?\n/);
    const out: string[] = [];
    let inList = false;
    const inline = (s: string) =>
      esc(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
    for (const line of lines) {
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      const li = line.match(/^\s*[-*]\s+(.*)$/);
      if (h) {
        if (inList) {
          out.push('</ul>');
          inList = false;
        }
        out.push('<h' + h[1].length + '>' + inline(h[2]) + '</h' + h[1].length + '>');
      } else if (li) {
        if (!inList) {
          out.push('<ul>');
          inList = true;
        }
        out.push('<li>' + inline(li[1]) + '</li>');
      } else {
        if (inList) {
          out.push('</ul>');
          inList = false;
        }
        if (line.trim()) out.push('<p>' + inline(line) + '</p>');
      }
    }
    if (inList) out.push('</ul>');
    return result(out.join('\n'));
  },
});
