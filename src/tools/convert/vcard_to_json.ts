import { defineTool } from '../../core/tool.js';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';

function parseVcards(text: string): Array<Record<string, string | string[]>> {
  const unfolded = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const contacts: Array<Record<string, string | string[]>> = [];
  let contact: Record<string, string | string[]> | undefined;
  for (const line of unfolded) {
    if (/^BEGIN:VCARD$/i.test(line)) {
      contact = {};
      continue;
    }
    if (/^END:VCARD$/i.test(line)) {
      if (contact) contacts.push(contact);
      contact = undefined;
      continue;
    }
    if (!contact) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const [rawName, ...rawParams] = line.slice(0, separator).split(';');
    const name = rawName.split('.').at(-1)!.toUpperCase();
    const value = line
      .slice(separator + 1)
      .replace(/\\n/gi, '\n')
      .replace(/\\,/g, ',')
      .replace(/\\;/g, ';')
      .replace(/\\\\/g, '\\');
    const previous = contact[name];
    if (previous === undefined) contact[name] = value;
    else if (Array.isArray(previous)) previous.push(value);
    else contact[name] = [previous, value];
    if (rawParams.length) contact[`${name}_PARAMS`] = rawParams.join(';');
  }
  return contacts;
}

/**
 * pro_fetch_vcard_to_json — Parse vCard contacts into JSON
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_vcard_to_json',
  description: 'Parse vCard contacts into JSON',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "vCard manba URL'i" },
      text: { type: 'string', description: 'vCard matni' },
      content: { type: 'string', description: 'vCard matni' },
      data: { type: 'string', description: 'vCard matni' },
    },
    required: ['url'],
  },
  async handler(input) {
    const text = await readTextSource(input, 'vCard to JSON');
    if (!/BEGIN:VCARD/i.test(text)) throw new Error('vCard BEGIN:VCARD yozuvi topilmadi.');
    return result(JSON.stringify(parseVcards(text), null, 2));
  },
});
