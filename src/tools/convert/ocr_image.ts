import { defineTool } from '../../core/tool.js';
import { result } from '../../core/format.js';
import { readBinarySource } from '../../core/binary-source.js';
import { nativeMediaAvailable } from '../../core/media-tools.js';

/**
 * pro_fetch_ocr_image — Run OCR on an image and return detected text
 * Pack: convert (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_ocr_image',
  description: 'Run OCR on an image and return detected text',
  category: 'convert',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "Rasm faylining URL'i" },
      base64: { type: 'string', description: "Rasm faylining base64 ma'lumoti" },
      language: { type: 'string', description: 'Tesseract til kodi (default eng)' },
      max_bytes: { type: 'number', description: 'Eng katta rasm hajmi, byte (max 100 MiB)' },
    },
    required: ['url'],
  },
  async handler(input) {
    // Loaded lazily: `tesseract.js` ships a platform-specific binary, and a static import made
    // it part of the module graph of every tool in the registry.
    const tesseract = await import('tesseract.js').catch((error: unknown) => {
      throw new Error(
        `tesseract.js yuklanmadi: bu platform uchun binary topilmadi, \`npm ci\` bilan qayta o‘rnating (${error instanceof Error ? error.message.split('\n')[0] : String(error)})`,
      );
    });
    const image = await readBinarySource(input, 'Image OCR', 50 * 1024 * 1024);
    const language = typeof input.language === 'string' && input.language.trim() ? input.language.trim() : 'eng';
    const worker = await tesseract.createWorker(language);
    try {
      const recognition = await worker.recognize(image);
      return result(
        JSON.stringify(
          { language, text: recognition.data.text.trim(), confidence: recognition.data.confidence },
          null,
          2,
        ),
      );
    } finally {
      await worker.terminate();
    }
  },
});
