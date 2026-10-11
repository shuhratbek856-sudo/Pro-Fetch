import { defineTool } from '../../core/tool.js';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';

function rtfText(source: string): string {
  if (!source.trimStart().startsWith('{\\rtf')) throw new Error('RTF hujjati {\\rtf header bilan boshlanishi kerak.');
  let output = '';
  let depth = 0;
  let skipGroup = false;
  let fallbackSkip = 0;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (character === '{') {
      depth++;
      if (source[index + 1] === '\\' && source[index + 2] === '*') skipGroup = true;
      continue;
    }
    if (character === '}') {
      depth = Math.max(0, depth - 1);
      if (!depth) skipGroup = false;
      continue;
    }
    if (skipGroup || character === '\r' || character === '\n') continue;
    if (character !== '\\') {
      if (fallbackSkip) fallbackSkip--;
      else output += character;
      continue;
    }
    const next = source[++index];
    if (!next) break;
    if (next === '\\' || next === '{' || next === '}') {
      if (!fallbackSkip) output += next;
      continue;
    }
    if (next === "'") {
      const hex = source.slice(index + 1, index + 3);
      if (/^[\da-f]{2}$/i.test(hex)) {
        if (!fallbackSkip) output += new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(hex, 16)]));
        index += 2;
      }
      continue;
    }
    if (!/[a-z]/i.test(next)) {
      if (next === '~' && !fallbackSkip) output += '\u00a0';
      else if (next === '-' && !fallbackSkip) output += '\u00ad';
      continue;
    }
    let word = next;
    while (/[a-z]/i.test(source[index + 1] ?? '')) word += source[++index];
    let parameter = '';
    if (source[index + 1] === '-') parameter += source[++index];
    while (/\d/.test(source[index + 1] ?? '')) parameter += source[++index];
    if (source[index + 1] === ' ') index++;
    if (word === 'u') {
      const code = Number(parameter);
      if (!fallbackSkip) output += String.fromCharCode(code < 0 ? code + 65536 : code);
      fallbackSkip = 1;
    } else if (!fallbackSkip && ['par', 'line'].includes(word)) output += '\n';
    else if (!fallbackSkip && word === 'tab') output += '\t';
    else if (!fallbackSkip && word === 'emdash') output += '\u2014';
    else if (!fallbackSkip && word === 'endash') output += '\u2013';
    else if (!fallbackSkip && word === 'bullet') output += '\u2022';
  }
  return output
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * pro_fetch_rtf_to_text — Convert RTF to plain text
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_rtf_to_text',
  description: 'Convert RTF to plain text',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "RTF manba URL'i" },
      text: { type: 'string', description: 'RTF matni' },
      content: { type: 'string', description: 'RTF matni' },
      data: { type: 'string', description: 'RTF matni' },
    },
    required: ['url'],
  },
  async handler(input) {
    return result(rtfText(await readTextSource(input, 'RTF to text')));
  },
});
