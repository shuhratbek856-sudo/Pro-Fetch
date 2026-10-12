/**
 * Shared source resolution for extractors.
 *
 * An extractor needs the page content. There are two ways to get it: ask the caller for it, or fetch
 * it. When a caller already holds the content — which is the case for every composite, and for any
 * batch that fetches once and then analyses — re-fetching is pure waste: an extra network round trip
 * and an extra load on someone else's server.
 *
 * This helper makes "reuse what you were given" the default path:
 *
 * ```ts
 * const source = await sourceFrom(p);   // uses p.text when present, otherwise fetches p.url
 * const emails = source.text.match(...)  // both paths have the same shape
 * ```
 *
 * The returned shape always matches `HttpResult`, so existing code that reads `.text` and
 * `.contentType` keeps working unchanged whether the content came from the caller or the network.
 */

import { fetchWithOptions, type FetchOptions } from './http-client.js';
import type { HttpResult } from './http-client.js';

export interface SourceRequest {
  url?: unknown;
  text?: unknown;
  max_bytes?: unknown;
}

/** Synthetic result for inline content, so callers see one shape regardless of the path taken. */
function fromInline(text: string, contentType = 'text/html'): HttpResult {
  return {
    status: 200,
    contentType,
    headers: { 'content-type': contentType },
    text,
    truncated: false,
  };
}

/**
 * Resolve an extractor's input into content.
 *
 * Inline `text` takes precedence. This is the whole point: passing content you already have must
 * never trigger a network request.
 */
export async function sourceFrom(request: SourceRequest, options: FetchOptions = {}): Promise<HttpResult> {
  const inline = typeof request.text === 'string' ? request.text : '';
  const url = typeof request.url === 'string' ? request.url.trim() : '';

  if (inline) return fromInline(inline);
  if (!url) {
    throw new Error('MISSING_INPUT: url yoki text talab qilinadi.');
  }

  const maxBytes = typeof request.max_bytes === 'number' ? request.max_bytes : undefined;
  return fetchWithOptions(url, { ...options, ...(maxBytes ? { maxBytes } : {}) });
}

/** Whether a request would hit the network, without performing it. */
export function needsNetwork(request: SourceRequest): boolean {
  return (
    !(typeof request.text === 'string' && request.text) && typeof request.url === 'string' && request.url.trim() !== ''
  );
}
