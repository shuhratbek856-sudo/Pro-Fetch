import { fetchWithOptions } from './http-client.js';
import { assertSafeUrl } from './ssrf-guard.js';

export type TextToolInput = Record<string, unknown>;

export async function readTextSource(input: TextToolInput, label: string): Promise<string> {
  for (const key of ['text', 'content', 'data']) {
    const value = input[key];
    if (typeof value === 'string') return value;
  }
  const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
  if (!rawUrl) throw new Error(`${label}: text, content, data yoki url kiriting.`);
  const safeUrl = await assertSafeUrl(rawUrl);
  const response = await fetchWithOptions(safeUrl.toString(), {
    timeoutMs: Number(input.timeout_ms ?? 15_000),
    maxBytes: Number(input.max_bytes ?? 2 * 1024 * 1024),
    retries: 1,
  });
  if (response.status < 200 || response.status >= 300) throw new Error(`${label}: manba HTTP ${response.status}.`);
  if (response.truncated) throw new Error(`${label}: manba max_bytes limitdan oshdi.`);
  return response.text;
}
