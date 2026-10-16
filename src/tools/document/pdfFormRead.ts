import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { PDFDocument } from 'pdf-lib';
import { readBinarySource } from '../../core/binary-source.js';
async function open(input: Record<string, unknown>, label: string): Promise<PDFDocument> {
  const bytes = await readBinarySource(input, label);
  // `updateMetadata: false` - pdf-lib otherwise rewrites ModDate on load, which changes a document the
  // caller asked to inspect rather than modify.
  return PDFDocument.load(bytes, { updateMetadata: false });
}

export const pdfFormRead = defineTool({
  name: 'pro_pdf_form_read',
  description: 'PDF ichidagi forma maydonlarini o‘qish: nom, tur, qiymat, holat.',
  category: 'document',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'PDF URL i' },
      base64: { type: 'string', description: 'PDF base64' },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    anyOf: [{ required: ['url'] }, { required: ['base64'] }],
  },
  async handler(input) {
    try {
      const pdf = await PDFDocument.load(await readBinarySource(input, 'PDF form read'), { updateMetadata: false });
      const fields = pdf
        .getForm()
        .getFields()
        .map((field) => {
          const record: Record<string, unknown> = {
            name: field.getName(),
            type: field.constructor.name.replace('PDF', ''),
          };
          if ('getText' in field) {
            try {
              record.value = (field as unknown as { getText(): string }).getText();
            } catch {
              record.value = null;
            }
          }
          if ('isChecked' in field) {
            try {
              record.checked = (field as unknown as { isChecked(): boolean }).isChecked();
            } catch {
              record.checked = null;
            }
          }
          if ('isReadOnly' in field) {
            record.read_only = (field as unknown as { isReadOnly(): boolean }).isReadOnly();
          }
          return record;
        });
      return jsonBlock('Forma maydonlari', { count: fields.length, fields });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});
