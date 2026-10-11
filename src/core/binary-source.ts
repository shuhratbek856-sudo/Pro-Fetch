import { downloadToBuffer } from './http-client.js';
import { assertSafeUrl } from './ssrf-guard.js';

export type BinaryToolInput = Record<string, unknown>;

export async function readBinarySource(
  input: BinaryToolInput,
  label: string,
  defaultMaxBytes = 100 * 1024 * 1024,
): Promise<Buffer> {
  const maxBytesValue = Number(input.max_bytes ?? defaultMaxBytes);
  const maxBytes = Number.isFinite(maxBytesValue)
    ? Math.max(1, Math.min(defaultMaxBytes, Math.floor(maxBytesValue)))
    : defaultMaxBytes;
  const encoded =
    typeof input.base64 === 'string' ? input.base64 : typeof input.data_base64 === 'string' ? input.data_base64 : '';
  if (encoded) {
    const normalized = encoded.replace(/\s+/g, '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized))
      throw new Error(`${label}: base64 qiymati noto‘g‘ri.`);
    const bytes = Buffer.from(normalized, 'base64');
    if (bytes.byteLength > maxBytes) throw new Error(`${label}: fayl max_bytes limitdan katta.`);
    return bytes;
  }
  const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
  if (!rawUrl) throw new Error(`${label}: url yoki base64 kerak.`);
  const safeUrl = await assertSafeUrl(rawUrl);
  return (await downloadToBuffer(safeUrl.toString(), maxBytes, Number(input.timeout_ms ?? 30_000))).bytes;
}
