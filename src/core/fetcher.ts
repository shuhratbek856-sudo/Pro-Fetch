import { fetchWithOptions } from './http-client.js';
import { assertSafeUrl } from './ssrf-guard.js';
import { take } from './ratelimit.js';
import { cache } from './cache.js';
import { canSkipSideEffect } from './read-only-guard.js';
import { clipToTokens, estimateTokens } from './chunker.js';
import { htmlToMarkdown } from './parser.js';
import { boundedEnv } from './bounded-env.js';

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
  // The cached value is the CLIPPED document, so the limit belongs in the key.
  //
  // Measured: a call that asked for 100 tokens left behind a 400-character document, and the next
  // call - which asked for 8000 - was served that document from the cache with `truncated: false`,
  // so nothing in the answer said the page had been cut down to a tenth of what was requested. The
  // key carries the effective limit now, and the limit is computed the same way `clipToTokens`
  // computes it, so the two cannot disagree about what was stored.
  const limit =
    opts.maxTokens !== undefined && Number.isFinite(opts.maxTokens) && opts.maxTokens > 0 ? opts.maxTokens : 8000;
  const key = 'fetch:' + url.toString() + '|t' + limit;
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
  const clipped = clipToTokens(raw, limit);
  const result: FetchResult = {
    // Where the answer actually came from after redirects, not the address it was asked with —
    // `url: url.toString()` was the request line, and a caller recording the result described the
    // wrong document when the origin redirected. The cache key stays the requested URL: that is
    // what a repeat lookup is about.
    url: res.url ?? url.toString(),
    status: res.status,
    contentType: res.contentType,
    markdown: clipped,
    tokens: estimateTokens(clipped),
    cached: false,
    truncated: res.truncated,
  };
  // Keshlash - yon ta s ir, maqsad emas. `fetchUrl` har javobni keshlaydi, demak read-only
  // rejimida ko pchtool yozuv qiladi. Keshlashni o tkazib yuborish to g ri: hujjat qaytadi,
  // keyingi so rov kesh bo lmaydi, chaqiruvchi uchun farq yo q. Aks holda read-only rejimi
  // butun fetch oilasini ishdan chiqarar edi.
  if (!canSkipSideEffect()) cache.put(key, JSON.stringify(result), 3_600_000);
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
  // A non-finite concurrency cannot become a worker count: `Math.max(1, Math.min(NaN, len))` is
  // NaN and `Array.from({ length: NaN })` is empty, so every URL was dropped silently and the
  // caller got an empty result for a successful-looking call. A bad value falls back to the
  // documented default instead of erasing the batch.
  const width = Number.isFinite(concurrency) ? concurrency : 10;
  // Never fan out wider than the server's own global concurrency limit, whatever the caller asked for.
  const cap = boundedEnv('PRO_FETCH_MAX_CONCURRENCY', 64, 1, 4096);
  const n = Math.max(1, Math.min(width, urls.length, cap));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}
