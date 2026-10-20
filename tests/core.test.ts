import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { isPrivateIp, assertSafeUrl } from '../src/core/ssrf-guard.js';
import { take, resetBuckets } from '../src/core/ratelimit.js';
import { estimateTokens, chunkText, clipToTokens } from '../src/core/chunker.js';
import { htmlToText } from '../src/core/parser.js';
import { cache } from '../src/core/cache.js';
import { allowedCrawlHost } from '../src/core/crawl-tools.js';
import { downloadToBuffer, fetchFollowingSafeRedirects, fetchWithOptions } from '../src/core/http-client.js';
import { sanitizeToolError } from '../src/core/tool.js';

describe('SSRF himoyasi', () => {
  it('ichki IPv4 manzillarni bloklaydi', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.5')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIp('::ffff:10.0.0.5')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
  });

  it("ochiq IPv4 manzillarni o'tkazadi", () => {
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('93.184.216.34')).toBe(false);
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
  });

  it("localhost va noto'g'ri protokolni bloklaydi", async () => {
    await expect(assertSafeUrl('http://localhost:3000/x')).rejects.toThrow();
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toThrow();
  });
});

describe('safe HTTP redirects', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('blocks a redirect to loopback before making a second request', async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchFollowingSafeRedirects('http://93.184.216.34/start', { method: 'GET' })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('enforces binary size limits while streaming', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
    );
    await expect(downloadToBuffer('http://93.184.216.34/file', 2)).rejects.toThrow('max_bytes limitdan katta');
  });

  it('uses finite defaults when size options are NaN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bounded response')),
    );
    await expect(downloadToBuffer('http://93.184.216.34/file', Number.NaN)).resolves.toMatchObject({
      bytes: Buffer.from('bounded response'),
    });
    await expect(fetchWithOptions('http://93.184.216.34/text', { maxBytes: Number.NaN })).resolves.toMatchObject({
      text: 'bounded response',
      truncated: false,
    });
  });
});

describe('tool error secret redaction', () => {
  it('removes supplied credentials and common credential patterns from error text', () => {
    const message = sanitizeToolError(
      new Error(
        'request failed for https://user:pass@example.org/?token=querySecret with apiSecret Bearer abc.def-123',
      ),
      { api_key: 'apiSecret', token: 'querySecret' },
    );
    expect(message).not.toContain('apiSecret');
    expect(message).not.toContain('querySecret');
    expect(message).not.toContain('abc.def-123');
    expect(message).not.toContain('user:pass');
    expect(message).toContain('[REDACTED]');
  });
});

describe('crawl host scope', () => {
  it('uses registrable domains rather than a naive last-two-label comparison', () => {
    expect(allowedCrawlHost('news.example.co.uk', 'www.example.co.uk', { scope: 'same-domain' })).toBe(true);
    expect(allowedCrawlHost('93.184.216.34', '93.184.216.34', { scope: 'same-domain' })).toBe(true);
    expect(allowedCrawlHost('example.co.uk.attacker.test', 'www.example.co.uk', { scope: 'same-domain' })).toBe(false);
    expect(
      allowedCrawlHost('sub.docs.example.org', 'docs.example.org', { scope: 'same-host', includeSubdomains: true }),
    ).toBe(true);
    expect(allowedCrawlHost('other.example.org', 'docs.example.org', { scope: 'same-host' })).toBe(false);
    expect(allowedCrawlHost('external.test', 'docs.example.org', { scope: 'all' })).toBe(true);
  });
});

describe('rate-limit (token bucket)', () => {
  beforeEach(() => resetBuckets());

  it('limit ichida ruxsat beradi, ortida bloklaydi', () => {
    expect(take('test:a', 3, 60_000)).toBe(true);
    expect(take('test:a', 3, 60_000)).toBe(true);
    expect(take('test:a', 3, 60_000)).toBe(true);
    expect(take('test:a', 3, 60_000)).toBe(false);
  });

  it('har kalit alohida hisoblanadi', () => {
    take('test:b', 1, 60_000);
    expect(take('test:b', 1, 60_000)).toBe(false);
    expect(take('test:c', 1, 60_000)).toBe(true);
  });
});

describe('chunker', () => {
  it('token taxminini hisoblaydi', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('')).toBe(0);
  });

  it("matnni chunklarga bo'ladi", () => {
    expect(chunkText('a'.repeat(100), 1).length).toBe(25);
  });

  it('uzun matnni qisqartiradi', () => {
    const out = clipToTokens('x'.repeat(1000), 10);
    expect(out.length).toBeLessThan(1000);
    expect(out).toContain('qisqartirildi');
  });
});

describe('cache', () => {
  beforeEach(() => cache.clear());

  it("put/get ishlaydi va TTL tugaganda o'chadi", async () => {
    cache.put('k1', 'v1', 60_000);
    expect(cache.get('k1')?.value).toBe('v1');
    cache.put('k2', 'v2', 1);
    await new Promise((r) => setTimeout(r, 10));
    expect(cache.get('k2')).toBeUndefined();
  });

  it("search va keys prefix bo'yicha ishlaydi; delete esa aniq kalit bilan", () => {
    cache.put('a:1', 'hello world');
    cache.put('a:2', 'other');
    cache.put('b:1', 'third');
    expect(cache.search('hello')).toHaveLength(1);
    expect(cache.keys('a:')).toHaveLength(2);
    // Search/keys stay intentional prefix readers, but `delete` used a substring match too, so
    // revoking one cache entry silently removed every key containing it. Revocation is exact.
    expect(cache.delete('a:1')).toBe(1);
    expect(cache.keys('a:')).toHaveLength(1);
    expect(cache.delete('nothing:matches')).toBe(0);
  });
});

describe('parser', () => {
  it('HTML dan toza matn ajratadi', () => {
    const out = htmlToText('<h1>Salom</h1><p>Dunyo &amp; kod</p>');
    expect(out).toContain('Salom');
    expect(out).toContain('Dunyo & kod');
    expect(out).not.toContain('<');
  });
});
