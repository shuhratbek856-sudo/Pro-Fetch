import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Agent, ProxyAgent } from 'undici';
import path from 'node:path';
import { assertSafeUrl, resolveSafeUrl } from './ssrf-guard.js';
import { cache } from './cache.js';
import { withNetworkConcurrency } from './network-gate.js';
import { USER_AGENT } from './version.js';

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
  cache?: boolean;
  cacheTtlMs?: number;
}

const UA = USER_AGENT;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const proxyAgents = new Map<string, ProxyAgent>();
const directAgents = new Map<string, Agent>();

function noProxyMatch(url: URL): boolean {
  const entries = (process.env.NO_PROXY ?? process.env.no_proxy ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return entries.some((entry) => {
    if (entry === '*') return true;
    const [rawHost, rawPort] = entry.startsWith('[')
      ? [entry.slice(1, entry.indexOf(']')), entry.includes(']:') ? entry.slice(entry.indexOf(']:') + 2) : '']
      : entry.split(':');
    const host = rawHost.replace(/^\./, '');
    const hostMatch =
      url.hostname.toLowerCase().replace(/^\[|\]$/g, '') === host || url.hostname.toLowerCase().endsWith('.' + host);
    const portMatch =
      !rawPort || rawPort === url.port || (!url.port && rawPort === (url.protocol === 'https:' ? '443' : '80'));
    return hostMatch && portMatch;
  });
}

function dispatcherFor(url: URL, addresses: Array<{ address: string; family: number }>): Agent | ProxyAgent {
  if (!noProxyMatch(url)) {
    const proxy =
      url.protocol === 'https:'
        ? (process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.ALL_PROXY ?? process.env.all_proxy)
        : (process.env.HTTP_PROXY ?? process.env.http_proxy ?? process.env.ALL_PROXY ?? process.env.all_proxy);
    if (proxy?.trim()) {
      // A remote proxy resolves the target hostname itself, so local DNS pinning cannot be
      // guaranteed across the proxy hop. Make that trust decision explicit rather than silent.
      if (process.env.PRO_FETCH_ALLOW_UNPINNED_PROXY_DNS !== 'true') {
        throw new Error(
          'PROXY_DNS_PINNING_UNAVAILABLE: proxy orqali DNS rebinding himoyasini kafolatlab bo‘lmaydi. Ishonchli proxy uchun PRO_FETCH_ALLOW_UNPINNED_PROXY_DNS=true ni ataylab yoqing yoki hostni NO_PROXY ga qo‘shing.',
        );
      }
      let parsed: URL;
      try {
        parsed = new URL(proxy);
      } catch {
        throw new Error('HTTP proxy URL noto‘g‘ri formatda.');
      }
      if (!['http:', 'https:'].includes(parsed.protocol))
        throw new Error('HTTP proxy faqat http:// yoki https:// formatida bo‘lishi kerak.');
      const key = parsed.toString();
      let proxyAgent = proxyAgents.get(key);
      if (!proxyAgent) {
        proxyAgent = new ProxyAgent(key);
        proxyAgents.set(key, proxyAgent);
      }
      return proxyAgent;
    }
  }
  const addressKey = addresses.map((item) => `${item.address}/${item.family}`).join(',');
  const key = `${url.hostname.toLowerCase()}|${url.port}|${addressKey}`;
  let agent = directAgents.get(key);
  if (!agent) {
    const pinnedLookup = ((hostname: string, options: unknown, callback: (...args: unknown[]) => void) => {
      const requestedFamily =
        options && typeof options === 'object' && 'family' in options
          ? Number((options as { family?: unknown }).family)
          : 0;
      const selected = requestedFamily ? addresses.filter((item) => item.family === requestedFamily) : addresses;
      const available = selected.length ? selected : addresses;
      const all =
        options && typeof options === 'object' && 'all' in options && Boolean((options as { all?: unknown }).all);
      if (all)
        callback(
          null,
          available.map((item) => ({ address: item.address, family: item.family })),
        );
      else callback(null, available[0]!.address, available[0]!.family);
    }) as never;
    agent = new Agent({ connect: { lookup: pinnedLookup } });
    directAgents.set(key, agent);
    if (directAgents.size > 96) {
      const oldestKey = directAgents.keys().next().value as string | undefined;
      if (oldestKey && oldestKey !== key) {
        const oldest = directAgents.get(oldestKey);
        directAgents.delete(oldestKey);
        void oldest?.close().catch(() => {});
      }
    }
  }
  return agent;
}

function boundedOption(value: number, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(Math.floor(value), max)) : fallback;
}

export async function fetchFollowingSafeRedirects(
  rawUrl: string,
  init: RequestInit,
  maxRedirects = 5,
): Promise<{ response: Response; url: string; chain: string[] }> {
  let current = await assertSafeUrl(rawUrl);
  let requestInit: RequestInit = { ...init, redirect: 'manual' };
  const chain = [current.toString()];
  for (let hop = 0; ; hop++) {
    const resolution = await resolveSafeUrl(current.toString());
    current = resolution.url;
    const dispatcher = dispatcherFor(current, resolution.addresses);
    const response = await withNetworkConcurrency(current.hostname, () =>
      fetch(current, { ...requestInit, dispatcher } as RequestInit),
    );
    const location = response.headers.get('location');
    if (!REDIRECT_STATUSES.has(response.status) || !location) return { response, url: current.toString(), chain };
    if (hop >= maxRedirects) {
      await response.body?.cancel().catch(() => {});
      throw new Error('HTTP redirect limit exceeded (' + maxRedirects + ')');
    }
    let next: URL;
    try {
      next = await assertSafeUrl(new URL(location, current).toString());
    } catch (error) {
      await response.body?.cancel().catch(() => {});
      throw error;
    }
    await response.body?.cancel().catch(() => {});
    if (next.origin !== current.origin) {
      const headers = new Headers(requestInit.headers);
      for (const name of [
        'authorization',
        'cookie',
        'proxy-authorization',
        'x-api-key',
        'api-key',
        'x-auth-token',
        'x-subscription-token',
        'x-goog-api-key',
      ])
        headers.delete(name);
      if (
        current.protocol === 'https:' &&
        next.protocol === 'http:' &&
        process.env.PRO_FETCH_ALLOW_HTTPS_DOWNGRADE !== 'true'
      ) {
        throw new Error('HTTPS dan HTTP ga xavfsiz downgrade redirect bloklandi.');
      }
      requestInit = { ...requestInit, headers };
    }
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) &&
        String(requestInit.method ?? 'GET').toUpperCase() === 'POST')
    ) {
      const headers = new Headers(requestInit.headers);
      for (const name of ['content-type', 'content-length', 'content-encoding', 'transfer-encoding'])
        headers.delete(name);
      requestInit = { ...requestInit, method: 'GET', body: undefined, headers };
    }
    current = next;
    chain.push(current.toString());
  }
}

export interface HttpResult {
  status: number;
  contentType: string;
  headers: Record<string, string>;
  text: string;
  truncated: boolean;
}

export interface BinaryResult {
  status: number;
  headers: Record<string, string>;
  url: string;
  bytes: Buffer;
}

/**
 * Downloads of the same URL that are already in flight.
 *
 * A composite fans its steps out concurrently, so `pro_fetch_ingest` has the PDF converter, the CSV
 * converter and the archiver all requesting the same URL at the same moment. Each re-downloaded the
 * file: the same bytes, from the same host, several times over — which is slow and rude to whoever
 * is being fetched from.
 *
 * Only concurrent requests share. Nothing is retained once a download settles, so there is no cache
 * to go stale, no large buffer held in memory, and a later request still gets a fresh copy. The entry
 * is removed in a `finally` block, so a failed download does not poison the URL for the next attempt.
 */
const inFlightDownloads = new Map<string, Promise<BinaryResult>>();

export async function downloadToBuffer(
  url: string,
  maxBytes = 50 * 1024 * 1024,
  timeoutMs = 30_000,
): Promise<BinaryResult> {
  // The key includes the bounds: a 1 MiB request must not be handed the 50 MiB buffer of a
  // concurrent request for the same address, because the smaller caller asked for less.
  const key = `${maxBytes}|${timeoutMs}|${url}`;
  const existing = inFlightDownloads.get(key);
  if (existing) return existing;

  const started = downloadToBufferDirectly(url, maxBytes, timeoutMs);
  inFlightDownloads.set(key, started);
  try {
    return await started;
  } finally {
    // Guard against deleting a newer entry: the map holds one promise per key, and a re-entrant
    // call could have replaced it.
    if (inFlightDownloads.get(key) === started) inFlightDownloads.delete(key);
  }
}

async function downloadToBufferDirectly(
  url: string,
  maxBytes = 50 * 1024 * 1024,
  timeoutMs = 30_000,
): Promise<BinaryResult> {
  maxBytes = boundedOption(maxBytes, 50 * 1024 * 1024, 1, 512 * 1024 * 1024);
  timeoutMs = boundedOption(timeoutMs, 30_000, 100, 10 * 60_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { response, url: finalUrl } = await fetchFollowingSafeRedirects(url, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new Error('Download HTTP ' + response.status);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel().catch(() => {});
            throw new Error('Fayl max_bytes limitdan katta: ' + maxBytes);
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
    }
    return {
      status: response.status,
      headers: responseHeadersForTool(response),
      url: finalUrl,
      bytes: Buffer.concat(chunks, size),
    };
  } finally {
    clearTimeout(timer);
  }
}

function cacheSafeForRequest(url: URL, headers: Headers): boolean {
  if ([...headers.keys()].some((key) => /authorization|cookie|token|api[-_]?key|secret|subscription/i.test(key)))
    return false;
  for (const key of url.searchParams.keys())
    if (/token|key|secret|auth|password|session|signature|credential/i.test(key)) return false;
  return true;
}

function cacheKeyForRequest(url: URL, headers: Headers): string {
  const vary = ['accept', 'accept-language'].map((name) => `${name}:${headers.get(name) ?? ''}`).join('|');
  return 'http-get:' + createHash('sha256').update(`${url.toString()}|${vary}`).digest('hex');
}

function responseHeadersForTool(response: Response): Record<string, string> {
  const headers = Object.fromEntries(response.headers);
  for (const key of Object.keys(headers)) {
    if (
      /^(?:set-cookie2?|authorization|proxy-authorization|x-api-key|x-auth-token|x-subscription-token|x-goog-api-key)$/i.test(
        key,
      )
    )
      delete headers[key];
  }
  return headers;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(delay) && delay >= 0) return Math.min(30_000, delay);
  }
  return Math.min(8_000, 350 * 2 ** attempt + Math.floor(Math.random() * 250));
}

function httpCacheTtl(response: Response, explicitTtl?: number): number {
  const configured = Number(process.env.PRO_FETCH_HTTP_CACHE_TTL_MS);
  const desired = explicitTtl ?? (Number.isFinite(configured) && configured > 0 ? configured : 60_000);
  const bounded = boundedOption(desired, 60_000, 1_000, 24 * 60 * 60_000);
  const cacheControl = response.headers.get('cache-control') ?? '';
  const maxAge = /(?:^|,)\s*(?:s-maxage|max-age)=(\d+)/i.exec(cacheControl);
  if (maxAge) {
    const seconds = Number(maxAge[1]);
    if (seconds <= 0) return 0;
    return Math.max(1, Math.min(bounded, seconds * 1000));
  }
  const expires = response.headers.get('expires');
  if (expires) {
    const remaining = Date.parse(expires) - Date.now();
    if (Number.isFinite(remaining) && remaining > 0) return Math.max(1, Math.min(bounded, remaining));
  }
  return bounded;
}

export async function fetchWithOptions(url: string, opts: FetchOptions = {}): Promise<HttpResult> {
  const { method = 'GET', headers = {}, body } = opts;
  const timeoutMs = boundedOption(
    opts.timeoutMs ?? (Number(process.env.PRO_FETCH_TIMEOUT_MS) || 15_000),
    15_000,
    100,
    10 * 60_000,
  );
  const maxBytes = boundedOption(
    opts.maxBytes ?? (Number(process.env.PRO_FETCH_MAX_BYTES) || 2 * 1024 * 1024),
    2 * 1024 * 1024,
    1,
    512 * 1024 * 1024,
  );
  const requestedRetries = boundedOption(opts.retries ?? 2, 2, 0, 5);
  const normalizedMethod = method.toUpperCase();
  const retryableMethod = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE', 'TRACE']).has(normalizedMethod);
  const retries = retryableMethod ? requestedRetries : 0;
  const outgoingHeaders = new Headers({ 'user-agent': UA, ...headers });
  const safeUrl = await assertSafeUrl(url);
  const cacheable = normalizedMethod === 'GET' && opts.cache !== false && cacheSafeForRequest(safeUrl, outgoingHeaders);
  const cacheKey = cacheable ? cacheKeyForRequest(safeUrl, outgoingHeaders) : '';
  let stalePayload: HttpResult | undefined;
  if (cacheable) {
    const cached = cache.getStale(cacheKey);
    if (cached) {
      try {
        const payload = JSON.parse(cached.value) as HttpResult;
        if (payload && typeof payload.status === 'number' && typeof payload.text === 'string') {
          if (cached.expiresAt >= Date.now()) return payload;
          stalePayload = payload;
          const etag = payload.headers?.etag;
          const lastModified = payload.headers?.['last-modified'];
          if (etag) outgoingHeaders.set('if-none-match', etag);
          if (lastModified) outgoingHeaders.set('if-modified-since', lastModified);
        }
      } catch {
        cache.delete(cacheKey);
      }
    }
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const { response: res } = await fetchFollowingSafeRedirects(safeUrl.toString(), {
        method: normalizedMethod,
        headers: outgoingHeaders,
        body,
        signal: controller.signal,
      });
      if (res.status === 304 && stalePayload && cacheable) {
        const refreshed: HttpResult = {
          ...stalePayload,
          headers: { ...stalePayload.headers, ...responseHeadersForTool(res) },
        };
        const cacheControl304 = res.headers.get('cache-control') ?? '';
        const ttl = httpCacheTtl(res, opts.cacheTtlMs);
        if (ttl > 0 && !/no-store|private|no-cache/i.test(cacheControl304))
          cache.put(cacheKey, JSON.stringify(refreshed), ttl, { type: 'http', status: refreshed.status });
        else cache.delete(cacheKey);
        await res.body?.cancel().catch(() => {});
        clearTimeout(timer);
        return refreshed;
      }
      if (retryableMethod && attempt < retries && [429, 500, 502, 503, 504].includes(res.status)) {
        const delay = retryDelay(res, attempt);
        await res.body?.cancel().catch(() => {});
        clearTimeout(timer);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      let text = '';
      let received = 0;
      let truncated = false;
      const decoder = new TextDecoder();
      if (res.body) {
        const reader = res.body.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const previousSize = received;
            received += value.byteLength;
            const available = Math.max(0, maxBytes - previousSize);
            if (available) text += decoder.decode(value.subarray(0, available), { stream: true });
            if (received > maxBytes) {
              truncated = true;
              await reader.cancel().catch(() => {});
              break;
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
      text += decoder.decode();
      const result: HttpResult = {
        status: res.status,
        contentType: res.headers.get('content-type') ?? '',
        headers: responseHeadersForTool(res),
        text,
        truncated,
      };
      const cacheControl = res.headers.get('cache-control') ?? '';
      const ttl = httpCacheTtl(res, opts.cacheTtlMs);
      if (
        cacheable &&
        ttl > 0 &&
        !result.truncated &&
        res.status >= 200 &&
        res.status < 400 &&
        !/no-store|private|no-cache/i.test(cacheControl) &&
        !res.headers.has('set-cookie')
      ) {
        cache.put(cacheKey, JSON.stringify(result), ttl, { type: 'http', status: result.status });
      }
      clearTimeout(timer);
      return result;
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const code = controller.signal.aborted
        ? 'HTTP_TIMEOUT'
        : /ENOTFOUND|EAI_AGAIN|DNS/i.test(rawMessage)
          ? 'DNS_ERROR'
          : /TLS|certificate|SSL/i.test(rawMessage)
            ? 'TLS_ERROR'
            : 'HTTP_NETWORK_ERROR';
      lastErr = Object.assign(
        new Error(controller.signal.aborted ? `HTTP_TIMEOUT: request ${timeoutMs} ms ichida tugamadi` : rawMessage),
        { code, retryable: true },
      );
      clearTimeout(timer);
      if (attempt < retries) {
        const delay = Math.min(8_000, 350 * 2 ** attempt + Math.floor(Math.random() * 250));
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function downloadToFile(
  url: string,
  filePath: string,
  maxBytes = 512 * 1024 * 1024,
): Promise<{ status: number; bytes: number }> {
  const downloaded = await downloadToBuffer(url, maxBytes);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, downloaded.bytes);
  return { status: downloaded.status, bytes: downloaded.bytes.byteLength };
}

export async function traceRedirects(url: string, maxHops = 10): Promise<string[]> {
  const safe = await fetchFollowingSafeRedirects(url, { method: 'GET' }, maxHops);
  await safe.response.body?.cancel().catch(() => {});
  return safe.chain;
}
