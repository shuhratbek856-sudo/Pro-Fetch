import { defineTool } from '../../core/tool.js';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';

function parseMbox(
  text: string,
): Array<{ fromLine: string; headers: Record<string, string | string[]>; body: string }> {
  const messages: Array<{ fromLine: string; headers: Record<string, string | string[]>; body: string }> = [];
  let current: string[] = [];
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/(?=^From .+$)/m)
    .filter((block) => block.trim());
  for (const block of blocks) {
    const lines = block.split('\n');
    const fromLine = /^From /.test(lines[0]) ? lines.shift()! : '';
    const separator = lines.findIndex((line) => line === '');
    const headerLines = (separator < 0 ? lines : lines.slice(0, separator)).map((line) =>
      line.replace(/^\s+/, (indent) => (indent ? ' ' : '')),
    );
    const bodyLines = separator < 0 ? [] : lines.slice(separator + 1);
    const headers: Record<string, string | string[]> = {};
    for (const line of headerLines) {
      if (/^[ \t]/.test(line) && current.length) current[current.length - 1] += ' ' + line.trim();
      else current.push(line);
    }
    for (const line of current) {
      const index = line.indexOf(':');
      if (index < 1) continue;
      const key = line.slice(0, index).trim().toLowerCase();
      const value = line.slice(index + 1).trim();
      const previous = headers[key];
      if (previous === undefined) headers[key] = value;
      else if (Array.isArray(previous)) previous.push(value);
      else headers[key] = [previous, value];
    }
    current = [];
    messages.push({
      fromLine,
      headers,
      body: bodyLines
        .map((line) => line.replace(/^>+From /, (match) => match.slice(1)))
        .join('\n')
        .trimEnd(),
    });
  }
  return messages;
}

/**
 * pro_fetch_mbox_to_text — Parse an mbox email archive into text entries
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_mbox_to_text',
  description: 'Parse an mbox email archive into text entries',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "Mbox manba URL'i" },
      text: { type: 'string', description: 'Mbox matni' },
      content: { type: 'string', description: 'Mbox matni' },
      data: { type: 'string', description: 'Mbox matni' },
    },
    required: ['url'],
  },
  async handler(input) {
    return result(JSON.stringify(parseMbox(await readTextSource(input, 'Mbox to text')), null, 2));
  },
});
