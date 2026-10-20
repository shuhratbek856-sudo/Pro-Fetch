/**
 * Regression pins for audit batch 4 — the HTTP/client fixes: credential stripping by
 * name pattern on cross-origin redirects, one call-level timeout budget across retries,
 * a bounded redirect trace, an explicit-proxy path that leaves no global dispatcher
 * behind, the binary-safe multipart upload, and the SSE BOM/EOF event recovery.
 *
 * Fetch is stubbed at the client boundary (the SSRF guard rejects loopback, so real
 * local servers are unreachable); the stub captures `init`, which is the contract the
 * client hands to undici.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProxyAgent } from 'undici';
import '../src/loader.js';
import { dispatch } from '../src/core/tool.js';
import { dispatcherFor, fetchWithOptions, traceRedirects } from '../src/core/http-client.js';

process.env.PRO_FETCH_PROFILE = 'full';

const ok = (res: { isError?: boolean }) => res.isError !== true;
const textOf = (res: { content?: Array<{ text?: string }> }) =>
  (res.content ?? []).map((item) => item.text ?? '').join('');

type CapturedInit = { headers: Headers; body?: unknown; dispatcher?: unknown; signal?: AbortSignal };
let captured: CapturedInit[] = [];
let responses: Array<(init: CapturedInit, input: string) => Response | Promise<Response>> = [];

const stubFetch = () => {
  captured = [];
  vi.stubGlobal('fetch', (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const capturedInit = { ...init, headers: new Headers(init?.headers ?? {}) } as CapturedInit;
    captured.push(capturedInit);
    const step = responses[captured.length - 1];
    return typeof step === 'function'
      ? await step(capturedInit, String(input instanceof Request ? input.url : input))
      : step;
  }) as typeof fetch);
};

const hangOnAbort = (init: CapturedInit): Promise<never> =>
  new Promise((_, reject) => {
    init.signal?.addEventListener('abort', () => {
      const error = new Error('This operation was aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });

afterEach(() => {
  captured = [];
  responses = [];
  vi.unstubAllGlobals();
});

describe('cross-origin redirects strip credentials by pattern, not by a name list', () => {
  it('removes a vendor credential header the old 8-name list missed', async () => {
    responses = [
      () => new Response(null, { status: 302, headers: { location: 'http://93.184.216.34:8443/cand' } }),
      () => new Response('cand body', { status: 200 }),
    ];
    stubFetch();
    const r = await fetchWithOptions('http://93.184.216.34/redir', {
      headers: { authorization: 'Bearer SECRET', 'x-gitlab-token': 'gl-1', 'x-ok-header': 'keep-me' },
      retries: 0,
    });
    expect(r.status).toBe(200);
    expect(captured).toHaveLength(2);
    const seen = captured[1]?.headers;
    expect(seen?.get('authorization')).toBeNull();
    // `x-gitlab-token` matches none of the previous fixed names and reached the new origin.
    expect(seen?.get('x-gitlab-token')).toBeNull();
    expect(seen?.get('x-ok-header')).toBe('keep-me');
  });
});

describe('the timeout is one call-level budget across retries', () => {
  it('a hanging server aborts inside the budget instead of timing out per attempt', async () => {
    responses = [(init) => hangOnAbort(init)];
    stubFetch();
    const started = Date.now();
    let message = '';
    try {
      await fetchWithOptions('http://93.184.216.34/hang', { timeoutMs: 1200, retries: 2 });
    } catch (error) {
      message = (error as Error).message;
    }
    const wall = Date.now() - started;
    // The previous per-attempt timer spent 1200 ms twice plus backoff (~4.6 s total).
    expect(wall).toBeLessThan(2500);
    expect(message).toContain('HTTP_TIMEOUT');
    // Nothing raced past the budget to open a second attempt.
    expect(captured.length).toBeLessThanOrEqual(2);
  });
});

describe('the redirect trace is bounded', () => {
  it('traceRedirects honours its timeout against a server that never answers', async () => {
    responses = [(init) => hangOnAbort(init)];
    stubFetch();
    const started = Date.now();
    let message = '';
    try {
      await traceRedirects('http://93.184.216.34/hang', 10, 700);
    } catch (error) {
      message = (error as Error).message;
    }
    const wall = Date.now() - started;
    expect(wall).toBeLessThan(1800);
    expect(message).toContain('HTTP_TIMEOUT');
  });

  it('pro_fetch_redirect_trace fails honestly when the chain hangs within timeout_ms', async () => {
    responses = [(init) => hangOnAbort(init)];
    stubFetch();
    const res = await dispatch('pro_fetch_redirect_trace', { url: 'http://93.184.216.34/hang', timeout_ms: 700 });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain('HTTP_TIMEOUT');
  });
});

describe('the explicit proxy is a shared per-request ProxyAgent, not global state', () => {
  it('dispatcherFor hands back one ProxyAgent for the same proxy URL', () => {
    const addresses = [{ address: '93.184.216.34', family: 4 as const }];
    const first = dispatcherFor(new URL('http://93.184.216.34/'), addresses, 'http://user:pass@proxy.internal:8080');
    const second = dispatcherFor(new URL('http://93.184.216.34/'), addresses, 'http://user:pass@proxy.internal:8080');
    expect(first).toBeInstanceOf(ProxyAgent);
    expect(first).toBe(second);
  });

  it('a proxied request hands undici the ProxyAgent at the client boundary', async () => {
    responses = [() => new Response('proxy-route proof', { status: 200 })];
    stubFetch();
    await fetchWithOptions('http://93.184.216.34/via-proxy', { proxy: 'http://proxy.internal:8080', retries: 0 });
    expect(captured[0]?.dispatcher).toBeInstanceOf(ProxyAgent);
  });

  it('pro_fetch_fetch_with_proxy routes via dispatch and masks proxy credentials', async () => {
    responses = [() => new Response('tool proxy ok', { status: 200 })];
    stubFetch();
    const res = await dispatch('pro_fetch_fetch_with_proxy', {
      url: 'http://93.184.216.34/x',
      proxy: 'http://user:pass@proxy.internal:8080',
    });
    const text = textOf(res);
    expect(ok(res)).toBe(true);
    expect(text).toContain('tool proxy ok');
    expect(text).toContain('proxy.internal:8080');
    // A proxy URL may embed `user:password@`; the diagnostic prints the address only.
    expect(text).not.toContain('user:pass');
  });
});

describe('the multipart upload travels as bytes', () => {
  it('the file part is byte-exact across 0x00..0xFF and terminates cleanly', async () => {
    const binary = Buffer.concat([
      Buffer.from(Array.from({ length: 256 }, (_, i) => i & 0xff)),
      Buffer.from(Array.from({ length: 256 }, (_, i) => i & 0xff)),
    ]);
    let receivedUpload: CapturedInit | undefined;
    responses = [
      () => new Response(binary, { status: 200, headers: { 'content-type': 'application/x-test-bin' } }),
      (init) => {
        receivedUpload = init;
        return new Response('ok upload', { status: 200 });
      },
    ];
    stubFetch();
    const res = await dispatch('pro_fetch_post_multipart', {
      url: 'http://93.184.216.34/upload',
      fields: { a: 'value one' },
      file_url: 'http://93.184.216.34/file',
      filename: 'bin.dat',
    });
    expect(ok(res)).toBe(true);
    const uploadBody = Buffer.from((receivedUpload?.body as Uint8Array) ?? new Uint8Array());
    const boundary = /boundary=([^\s;]+)/.exec(receivedUpload?.headers?.get('content-type') ?? '')?.[1] ?? '';
    expect(boundary).toMatch(/^profetch-[0-9a-f]{32}$/);
    const marker = uploadBody.indexOf(Buffer.from('name="file"'));
    const headEnd = uploadBody.indexOf('\r\n\r\n', marker);
    const tail = uploadBody.indexOf(Buffer.from(`\r\n--${boundary}--`), headEnd);
    const filePart = uploadBody.subarray(headEnd + 4, tail);
    // The previous build spliced the file in as decoded text; bytes beyond 0x7F became U+FFFD.
    expect(Buffer.compare(filePart, binary)).toBe(0);
    expect(filePart.indexOf(Buffer.from(boundary))).toBe(-1);
    expect(uploadBody.toString('latin1')).toMatch(new RegExp(`--${boundary}--\\r\\n$`));
  });
});

describe('the SSE parser recovers the BOM event and the unterminated final block', () => {
  it('a leading UTF-8 BOM no longer swallows the first event', async () => {
    responses = [
      () =>
        new Response('\uFEFFdata: one\n\ndata: two\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    ];
    stubFetch();
    const res = await dispatch('pro_fetch_sse_subscribe', { url: 'http://93.184.216.34/sse-bom' });
    const text = textOf(res);
    expect(ok(res)).toBe(true);
    expect(text).toContain('"eventCount": 2');
    expect(text).toContain('"one"');
    expect(text).toContain('"two"');
  });

  it('a stream that closes without the final blank line still yields its last event', async () => {
    responses = [
      () => new Response('data: alpha\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    ];
    stubFetch();
    const res = await dispatch('pro_fetch_sse_subscribe', { url: 'http://93.184.216.34/sse-eof' });
    const text = textOf(res);
    expect(ok(res)).toBe(true);
    expect(text).toContain('"eventCount": 1');
    expect(text).toContain('"alpha"');
  });
});
