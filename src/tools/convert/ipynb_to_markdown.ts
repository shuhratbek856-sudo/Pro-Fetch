import { defineTool } from '../../core/tool.js';
import { result } from '../../core/format.js';
import { readTextSource } from '../../core/text-source.js';

type NotebookCell = {
  cell_type?: string;
  source?: string | string[];
  outputs?: Array<{ output_type?: string; text?: string | string[]; data?: Record<string, string | string[]> }>;
};

function sourceText(source: string | string[] | undefined): string {
  return Array.isArray(source) ? source.join('') : (source ?? '');
}

function fencedCode(source: string, language: string): string {
  const fence = '`'.repeat(Math.max(3, ...[...source.matchAll(/`+/g)].map((match) => match[0].length + 1)));
  return `${fence}${language}\n${source.replace(/\n+$/, '')}\n${fence}`;
}

/**
 * pro_fetch_ipynb_to_markdown — Convert a Jupyter notebook to Markdown with code and outputs
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_ipynb_to_markdown',
  description: 'Convert a Jupyter notebook to Markdown with code and outputs',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "Notebook faylining URL'i" },
      text: { type: 'string', description: 'Notebook JSON matni' },
      content: { type: 'string', description: 'Notebook JSON matni' },
      data: { type: 'string', description: 'Notebook JSON matni' },
      include_outputs: { type: 'boolean', description: "Cell outputs'ni qo‘shish (default true)" },
      max_output_chars: { type: 'number', description: 'Bitta output uchun maksimal belgi (1-20000)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const text = await readTextSource(input, 'Notebook to Markdown');
    let notebook: { nbformat?: number; cells?: NotebookCell[] };
    try {
      notebook = JSON.parse(text.replace(/^\uFEFF/, '')) as typeof notebook;
    } catch (error) {
      throw new Error('Notebook JSON parse xatosi: ' + (error instanceof Error ? error.message : String(error)));
    }
    if (!Array.isArray(notebook.cells)) throw new Error('Notebook cells array topilmadi.');
    const maxOutputValue = Number(input.max_output_chars ?? 5000);
    const maxOutput = Number.isFinite(maxOutputValue)
      ? Math.max(1, Math.min(20_000, Math.floor(maxOutputValue)))
      : 5000;
    const includeOutputs = input.include_outputs !== false;
    const markdown = notebook.cells
      .map((cell) => {
        const source = sourceText(cell.source);
        if (cell.cell_type === 'markdown') return source;
        if (cell.cell_type === 'raw') return source ? `> ${source.replace(/\n/g, '\n> ')}` : '';
        const cellParts = [fencedCode(source, 'python')];
        if (includeOutputs)
          for (const output of cell.outputs ?? []) {
            const outputText = sourceText(output.text) || sourceText(output.data?.['text/plain']);
            if (outputText) cellParts.push(fencedCode(outputText.slice(0, maxOutput), 'text'));
            else if (output.data?.['image/png']) cellParts.push('[Notebook output: PNG image omitted]');
          }
        return cellParts.join('\n\n');
      })
      .filter(Boolean)
      .join('\n\n');
    return result(`<!-- ipynb format ${notebook.nbformat ?? 'unknown'} -->\n\n${markdown}`);
  },
});
