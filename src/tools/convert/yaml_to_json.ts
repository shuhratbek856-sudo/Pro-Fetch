import { defineTool } from '../../core/tool.js';
import { parseDocument } from 'yaml';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';

/**
 * pro_fetch_yaml_to_json — Convert YAML to JSON
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_yaml_to_json',
  description: 'Convert YAML to JSON',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "YAML manba URL'i" },
      text: { type: 'string', description: 'YAML matni' },
      content: { type: 'string', description: 'YAML matni' },
      data: { type: 'string', description: 'YAML matni' },
    },
    required: ['url'],
  },
  async handler(input) {
    const text = (await readTextSource(input, 'YAML to JSON')).replace(/^\uFEFF/, '');
    const document = parseDocument(text, { uniqueKeys: true, prettyErrors: false, strict: true, logLevel: 'silent' });
    if (document.errors.length) {
      throw new Error(
        'YAML parse xatosi: ' +
          document.errors
            .slice(0, 3)
            .map((error) => error.message)
            .join('; '),
      );
    }
    const value = document.toJS({ maxAliasCount: 100 });
    return result(JSON.stringify(value ?? null, null, 2));
  },
});
