import { fetchWithOptions } from './http-client.js';
import { assertSafeUrl } from './ssrf-guard.js';
import { take } from './ratelimit.js';
import { cache } from './cache.js';
import { clipToTokens, estimateTokens } from './chunker.js';
import { htmlToMarkdown } from './parser.js';

export interface FetchResult {
  url: string;
  status: number;
  contentType: string;
  markdown: string;
  tokens: number;
  cached: boolean;
  truncated: boolean;
}
export interface FetchUrlOptions {
  maxTokens?: number;
  useCache?: boolean;
  timeoutMs?: number;
}

export async function fetchUrl(rawUrl: string, opts: FetchUrlOptions = {}): Promise<FetchResult> {
  const url = await assertSafeUrl(rawUrl);
  const key = 'fetch:' + url.toString();
  if (opts.useCache !== false) {
    const hit = cache.get(key);
    if (hit) {
      const parsed = JSON.parse(hit.value) as Omit<FetchResult, 'cached'>;
      return { ...parsed, cached: true };
    }
  }
  if (!take('domain:' + url.hostname)) {
    throw new Error('Rate limit tugadi (domain): ' + url.hostname);
  }
  const res = await fetchWithOptions(url.toString(), { timeoutMs: opts.timeoutMs });
  const isHtml = res.contentType.includes('text/html') || res.contentType.includes('application/xhtml');
  const raw = isHtml ? await htmlToMarkdown(res.text) : res.text;
  const clipped = clipToTokens(raw, opts.maxTokens ?? 8000);
  const result: FetchResult = {
    url: url.toString(),
    status: res.status,
    contentType: res.contentType,
    markdown: clipped,
    tokens: estimateTokens(clipped),
    cached: false,
    truncated: res.truncated,
  };
  cache.put(key, JSON.stringify(result), 3_600_000);
  return result;
}

export async function fetchBatch(
  urls: string[],
  concurrency = 10,
  opts: FetchUrlOptions = {},
): Promise<Array<{ ok: boolean; url: string; result?: FetchResult; error?: string }>> {
  const results: Array<{ ok: boolean; url: string; result?: FetchResult; error?: string }> = [];
  let i = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const idx = i++;
      if (idx >= urls.length) return;
      const u = urls[idx];
      try {
        results[idx] = { ok: true, url: u, result: await fetchUrl(u, opts) };
      } catch (err) {
        results[idx] = { ok: false, url: u, error: err instanceof Error ? err.message : String(err) };
      }
    }
  }
  const n = Math.max(1, Math.min(concurrency, urls.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}
