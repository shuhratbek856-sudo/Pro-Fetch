import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import path from 'node:path';

/**
 * pro_fetch_fetch_batch — Fetch many URLs in parallel and return combined results
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
import { boundedEnv } from '../../core/bounded-env.js';
export default defineTool({
  name: 'pro_fetch_fetch_batch',
  description: 'Fetch many URLs in parallel and return combined results',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      urls: { type: 'array', description: "URL ro'yxati" },
      concurrency: { type: 'number', description: 'Paralellik (default 10)' },
    },
    required: ['urls'],
  },
  async handler(input) {
    const p = view(input);
    const urls: string[] = (Array.isArray(p.urls) ? p.urls : []).map(String);
    if (!urls.length) return fail("urls bo'sh");
    // A non-numeric concurrency reached the fetch loop as NaN: `Array.from({ length: NaN })` has
    // length 0, so zero workers ran, every URL was silently dropped and the tool answered with an
    // empty result for a call that fetched nothing. Type errors fail the call instead.
    const rawConcurrency = (p as Record<string, unknown>).concurrency;
    if (rawConcurrency !== undefined && (typeof rawConcurrency !== 'number' || !Number.isFinite(rawConcurrency))) {
      return fail("concurrency son bo'lishi kerak, tushgan: " + String(rawConcurrency));
    }
    // Cap the batch so one response cannot grow past what the MCP transport / client can hold.
    const maxUrls = boundedEnv('PRO_FETCH_MAX_BATCH', 5000, 1, 1_000_000);
    if (urls.length > maxUrls) {
      return fail(`Bir batch’da ${maxUrls} tagacha URL (yuborilgan: ${urls.length}). Ro‘yxatni bo‘ling.`);
    }
    // Never honour a wider fan-out than the server’s own global concurrency limit.
    const cap = boundedEnv('PRO_FETCH_MAX_CONCURRENCY', 64, 1, 4096);
    const requested = typeof rawConcurrency === 'number' ? rawConcurrency : 10;
    const concurrency = Math.max(1, Math.min(requested, cap));
    const results = await fetchBatch(urls, concurrency);
    const parts = results.map((r: any, i: number) =>
      r.ok ? '## ' + urls[i] + '\n\n' + clipToTokens(r.result.markdown, 1500) : '## ' + urls[i] + '\n\n⚠️ ' + r.error,
    );
    return result(parts.join('\n\n---\n\n'));
  },
});
