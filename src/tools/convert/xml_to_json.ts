import { defineTool } from '../../core/tool.js';
import { DOMParser } from '@xmldom/xmldom';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';

type XmlValue = string | Record<string, unknown>;
type XmlNode = { nodeType: number; nodeValue: string | null; nextSibling: XmlNode | null };
type XmlElement = {
  attributes: { length: number; item(index: number): { name: string; value: string } | null };
  firstChild: XmlNode | null;
  nodeName: string;
};

function convertElement(element: XmlElement): XmlValue {
  const attributes: Record<string, string> = {};
  for (let index = 0; index < element.attributes.length; index++) {
    const attribute = element.attributes.item(index);
    if (attribute) attributes[attribute.name] = attribute.value;
  }
  const children: XmlElement[] = [];
  let text = '';
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) children.push(node as unknown as XmlElement);
    else if (node.nodeType === 3 || node.nodeType === 4) text += node.nodeValue ?? '';
  }
  const cleanText = text.trim();
  if (!children.length && !Object.keys(attributes).length) return cleanText;
  const output: Record<string, unknown> = {};
  if (Object.keys(attributes).length) output['@attributes'] = attributes;
  if (cleanText) output['#text'] = cleanText;
  for (const child of children) {
    const value = convertElement(child);
    if (Object.prototype.hasOwnProperty.call(output, child.nodeName)) {
      const previous = output[child.nodeName];
      output[child.nodeName] = Array.isArray(previous) ? [...previous, value] : [previous, value];
    } else output[child.nodeName] = value;
  }
  return output;
}

/**
 * pro_fetch_xml_to_json — Convert XML to JSON
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_xml_to_json',
  description: 'Convert XML to JSON',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "XML manba URL'i" },
      text: { type: 'string', description: 'XML matni' },
      content: { type: 'string', description: 'XML matni' },
      data: { type: 'string', description: 'XML matni' },
    },
    required: ['url'],
  },
  async handler(input) {
    const text = (await readTextSource(input, 'XML to JSON')).replace(/^\uFEFF/, '').trim();
    if (!text) throw new Error('XML hujjati bo‘sh.');
    const errors: string[] = [];
    const document = new DOMParser({
      onError: (level, message) => {
        errors.push(`${level}: ${message}`);
      },
    }).parseFromString(text, 'application/xml');
    if (errors.length || !document.documentElement || document.documentElement.nodeName === 'parsererror') {
      throw new Error('XML well-formed emas: ' + errors.slice(0, 3).join('; '));
    }
    return result(
      JSON.stringify({ [document.documentElement.nodeName]: convertElement(document.documentElement) }, null, 2),
    );
  },
});
