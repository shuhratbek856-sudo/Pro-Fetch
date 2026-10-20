import { fetchWithOptions, downloadToBuffer } from '../../core/http-client.js';
import { md, fail } from '../../core/format.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import { randomBytes } from 'node:crypto';

/**
 * pro_fetch_post_multipart — Send POST request with multipart form-data
 * Pack: http (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_post_multipart',
  description: 'Send POST request with multipart form-data',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil' },
      fields: { type: 'object', description: 'Maydonlar' },
      file_url: { type: 'string', description: 'Yuklanadigan fayl URL (ixtiyoriy)' },
      filename: { type: 'string', description: 'Fayl nomi' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const url = String(p.url ?? '');
    if (!url) return fail('url parametri kerak.');
    const encoder = new TextEncoder();

    // Names become header lines, so a quote or a CRLF in a caller-supplied name would end the
    // field early or smuggle extra headers into the part. Values are body text and may carry
    // CRLF legitimately; only the boundary itself would corrupt them, and the boundary is random.
    const headerSafe = (value: unknown): string =>
      String(value ?? '')
        .replace(/[\r\n"]/g, ' ')
        .trim();

    const fields = p.fields && typeof p.fields === 'object' ? (p.fields as Record<string, unknown>) : {};
    const fieldTexts: string[] = [];
    for (const [key, rawValue] of Object.entries(fields)) {
      const name = headerSafe(key);
      if (!name) continue;
      const value = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
      fieldTexts.push(value);
    }

    // The file used to be fetched and spliced in as TEXT: every byte the declared charset could
    // not decode became U+FFFD, so a PNG or a PDF arrived at the target as mush no receiver can
    // recover. Bytes travel as bytes from here on.
    let fileBytes: Buffer | undefined;
    let mediaType = '';
    let filename = '';
    if (p.file_url) {
      filename = headerSafe(p.filename ?? '');
      if (!filename) return fail('file_url berildi, lekin filename bo‘sh.');
      const file = await downloadToBuffer(String(p.file_url), 64 * 1024 * 1024);
      if (file.status >= 400) return fail('file_url javobi HTTP ' + file.status);
      fileBytes = file.bytes;
      mediaType = (file.headers['content-type'] ?? '').split(';')[0]?.trim() || 'application/octet-stream';
    }

    if (fieldTexts.length === 0 && !fileBytes) return fail('fields yoki file_url+filename kerak.');

    // A random boundary present in none of the content; one roll is near-certainly enough, but
    // the check is cheap and a collision would corrupt the upload silently.
    let boundary = '';
    for (let roll = 0; roll < 3; roll++) {
      boundary = 'profetch-' + randomBytes(16).toString('hex');
      const inFields = fieldTexts.some((value) => value.includes(boundary));
      const inFile = fileBytes ? fileBytes.includes(boundary) : false;
      if (!inFields && !inFile) break;
    }

    const parts: Uint8Array[] = [];
    for (const [key, rawValue] of Object.entries(fields)) {
      const name = headerSafe(key);
      if (!name) continue;
      const value = typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue);
      parts.push(encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
    }
    if (fileBytes) {
      parts.push(
        concatBytes(
          encoder.encode(
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mediaType}\r\n\r\n`,
          ),
          fileBytes,
          encoder.encode('\r\n'),
        ),
      );
    }
    parts.push(encoder.encode(`--${boundary}--\r\n`));

    const r = await fetchWithOptions(url, {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=' + boundary },
      // A byte array keeps every part byte-exact; a string here would re-encode the file's
      // bytes through UTF-16 and destroy binary content again.
      body: concatBytes(...parts),
    });
    const note = r.status >= 400 ? '\n\n⚠️ HTTP ' + r.status + ' — javob xato ko‘rsatadi.' : '';
    return md('# POST (multipart) ' + url + ' (HTTP ' + r.status + ')\n\n' + r.text + note);
  },
});

/** One allocation holding every part back to back. */
function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
