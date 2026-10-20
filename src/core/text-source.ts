import { fetchWithOptions } from './http-client.js';
import { assertSafeUrl } from './ssrf-guard.js';

export type TextToolInput = Record<string, unknown>;

/**
 * Options for `readTextSource`.
 *
 * `allowTruncated` exists for text *extraction*, not parsing. Converting a page's HTML to text over a
 * cut-off response still yields the part that arrived, and the caller is told in the output that it
 * is partial. It is off by default because a caller parsing CSV or JSON needs to know the content was
 * cut - a partial parse is wrong data, not less data.
 */
export interface ReadTextOptions {
  allowTruncated?: boolean;
}

export async function readTextSource(
  input: TextToolInput,
  label: string,
  options: ReadTextOptions = {},
): Promise<string> {
  for (const key of ['text', 'content', 'data']) {
    const value = input[key];
    // An empty string is not a source. `text: ''` used to win over a url the same call carried:
    // the loop returned immediately on the type check, so every parser behind this helper — CSV,
    // JSON, statistics, language — answered "0 items" for the real document at the other key.
    if (typeof value === 'string' && value.length > 0) return value;
  }
  const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
  if (!rawUrl) throw new Error(`${label}: text, content, data yoki url kiriting.`);
  const safeUrl = await assertSafeUrl(rawUrl);
  const response = await fetchWithOptions(safeUrl.toString(), {
    timeoutMs: Number(input.timeout_ms ?? 30_000),
    // 8 MiB, up from 2. A modern marketing page is not enormous by any measure - Google's own
    // retrieval-augmented-generation use-case page measures 2.16 MiB - so a 2 MiB ceiling rejected
    // pages that are entirely reasonable to read. Reported from `pro_research_deep`, where the step
    // failed as "HTML to text: manba max_bytes limitdan oshdi".
    //
    // Truncation is still an error rather than a silent short read: a caller parsing CSV or JSON needs
    // to know the content was cut, because a partial parse is wrong data rather than less data.
    maxBytes: Number(input.max_bytes ?? 16 * 1024 * 1024),
    retries: 1,
  });
  if (response.status < 200 || response.status >= 300) throw new Error(`${label}: manba HTTP ${response.status}.`);
  if (response.truncated) {
    if (!options.allowTruncated) throw new Error(`${label}: manba max_bytes limitdan oshdi.`);
    // Reported rather than silent: the caller can tell a short read from a complete one.
    return response.text + `\n\n[${label}: manba max_bytes limitdan oshdi - matn qisqartirilgan]`;
  }
  return response.text;
}
