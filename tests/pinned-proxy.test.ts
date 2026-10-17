// Pinned proxy ni haqiqiy brauzer bilan tekshirish: asosiy xatti-harakatlar buzildimi?
//
// Bu tekshiruv o'zgartirishni yozishdan OLDIN, alohida probe sifatida yozilgan edi va bir narsani
// ko'rsatdi: `route.fulfill` ko'p Set-Cookie ni yetkazmaydi. Shuning uchun cookie'lar jar'ga qo'lda
// yoziladi. Quyidagi har bir qator - o'zgartirishdan keyin ham bajarilishi kerak bo'lgan narsa.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import {
  ALL_RESOURCE_TYPES,
  createProxyRouteHandler,
  DIRECT_RESOURCE_TYPES,
  PROXIED_RESOURCE_TYPES,
  PROXY_NOTE,
  parseSetCookie,
} from '../src/core/pinned-proxy.js';

let browser: Browser;
let server: http.Server;
let origin: string;
const requested: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    requested.push(`${req.method} ${url}`);
    const send = (status: number, headers: Record<string, string>, body: string) => {
      res.writeHead(status, headers);
      res.end(body);
    };

    if (url === '/') {
      send(
        200,
        { 'content-type': 'text/html; charset=utf-8' },
        // The paragraph comes before the script on purpose. With the script first,
        // `document.getElementById('out')` is null when it runs, the script throws, and the failure
        // reads as "the proxy broke the page" when nothing of the sort happened.
        '<title>bosh sahifa</title><link rel="stylesheet" href="/a.css">' +
          '<img src="/pic.png"><p id="out">kutilgan</p><script src="/a.js"></script>',
      );
      return;
    }
    if (url === '/start') {
      send(302, { location: '/final', 'set-cookie': 'from_start=1; Path=/' }, '');
      return;
    }
    if (url === '/final') {
      send(
        200,
        { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'from_final=2; Path=/' },
        // The marker is a separate element: the script overwrites `#out`, so asserting on that
        // would be asserting on the script's own output instead of on the redirect.
        '<title>yakuniy</title><p id="marker">redirect ishladi</p>' +
          '<p id="out">kutilgan</p><script src="/a.js"></script>',
      );
      return;
    }
    if (url === '/login') {
      send(
        200,
        {
          'content-type': 'text/html; charset=utf-8',
          'set-cookie': ['sid=abc123; Path=/; HttpOnly', 'csrf=xyz789; Path=/', 'theme=dark; Path=/'],
        },
        '<title>login</title><p id="out">tizimga kirdi</p>',
      );
      return;
    }
    if (url === '/api/whoami') {
      send(200, { 'content-type': 'application/json' }, JSON.stringify({ cookie: req.headers.cookie ?? '' }));
      return;
    }
    if (url === '/gzip') {
      send(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip' }, '');
      return;
    }
    if (url === '/a.js') {
      send(200, { 'content-type': 'text/javascript' }, 'document.getElementById("out").textContent = "js ishladi";');
      return;
    }
    if (url === '/a.css') send(200, { 'content-type': 'text/css' }, 'body { color: rgb(1, 2, 3) }');
    else if (url === '/pic.png') send(200, { 'content-type': 'image/png' }, '');
    else send(404, { 'content-type': 'text/plain' }, 'yo q');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  origin = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({ headless: true });
}, 120_000);

afterAll(async () => {
  await browser?.close().catch(() => {});
  server?.close();
});

/**
 * A resolver that lets the fixture server on loopback through.
 *
 * This swaps the URL *policy*, not the pinning. `resolveSafeUrl` blocking 127.0.0.1 is correct and is
 * tested in `dns-rebinding.test.ts`; here the point is the transport - that Chromium gets served from a
 * connection made to an address the resolver chose - and the transport is unchanged: `dispatcherFor`
 * still connects to whatever this returns.
 *
 * An earlier version of this file re-implemented the route handler, which is how it came to omit the
 * request headers and conclude that cookies were not being stored when they had simply never been sent.
 */
function loopbackResolver(rawUrl: string) {
  return Promise.resolve({
    url: new URL(rawUrl),
    addresses: [{ address: '127.0.0.1', family: 4 as const }],
  });
}

/** The same handler production installs, with only the policy swapped. */
async function pageWithProxy(context: BrowserContext) {
  const page = await context.newPage();
  await context.route(
    '**/*',
    createProxyRouteHandler(context as unknown as Parameters<typeof createProxyRouteHandler>[0], {
      validate: async () => {},
      resolve: loopbackResolver,
    }),
  );
  return page;
}

describe('serving browser requests through a pinned connection', () => {
  it('loads a page, runs its script and applies its stylesheet', async () => {
    const context = await browser.newContext();
    const page = await pageWithProxy(context);
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    expect(await page.title()).toBe('bosh sahifa');
    // Proxied script actually ran, so the body was not mangled.
    await expect.poll(() => page.textContent('#out')).toBe('js ishladi');
    const colour = await page.evaluate(() => getComputedStyle(document.body).color);
    expect(colour).toBe('rgb(1, 2, 3)');
    await context.close();
  });

  it('follows a redirect with the final URL intact', async () => {
    const context = await browser.newContext();
    const page = await pageWithProxy(context);
    await page.goto(`${origin}/start`, { waitUntil: 'domcontentloaded' });
    // If the redirect were followed inside the proxy, this would be `/start` and every relative URL on
    // the page would resolve against the wrong origin.
    expect(page.url()).toBe(`${origin}/final`);
    // The paragraph is overwritten by the fixture's script, so the URL and title are what identify
    // this page. An earlier version asserted the paragraph and failed on the script's own output.
    expect(await page.title()).toBe('yakuniy');
    expect(await page.textContent('#marker')).toBe('redirect ishladi');
    await context.close();
  });

  it('keeps every Set-Cookie, which a plain fulfil loses', async () => {
    const context = await browser.newContext();
    const page = await pageWithProxy(context);
    await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
    const names = (await context.cookies()).map((cookie) => cookie.name).sort();
    expect(names).toEqual(['csrf', 'sid', 'theme']);
    const sid = (await context.cookies()).find((cookie) => cookie.name === 'sid');
    expect(sid?.httpOnly).toBe(true);
    await context.close();
  });

  it('sends the stored cookies on a later request, which is what login depends on', async () => {
    const context = await browser.newContext();
    const page = await pageWithProxy(context);
    await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
    const whoami = await page.evaluate(async (base) => {
      const response = await fetch(`${base}/api/whoami`);
      return (await response.json()) as { cookie: string };
    }, origin);
    // Both non-HttpOnly cookies are forwarded; HttpOnly ones are sent by the browser but not by script,
    // so this assertion is about the pipeline, not about visibility.
    expect(whoami.cookie).toContain('csrf=xyz789');
    expect(whoami.cookie).toContain('theme=dark');
    await context.close();
  });

  it('decompresses rather than forwarding content-encoding', async () => {
    const context = await browser.newContext();
    const page = await pageWithProxy(context);
    await page.goto(`${origin}/gzip`, { waitUntil: 'domcontentloaded' });
    // The fixture declares gzip but sends plain bytes, which is the point: forwarding the header would
    // make Chromium try to decode plain text and render nothing.
    expect(await page.title()).toBe('');
    const content = await page.content();
    expect(content).not.toContain('�');
    await context.close();
  });

  it('still fetches images directly', async () => {
    const context = await browser.newContext();
    const page = await pageWithProxy(context);
    requested.length = 0;
    await page.goto(`${origin}/`, { waitUntil: 'load' });
    expect(requested.some((entry) => entry.endsWith('/pic.png'))).toBe(true);
    await context.close();
  });
});

describe('what the proxy does not cover is stated, not implied', () => {
  it('names the types that still resolve in Chromium', () => {
    expect(PROXIED_RESOURCE_TYPES.has('document')).toBe(true);
    expect(PROXIED_RESOURCE_TYPES.has('xhr')).toBe(true);
    expect(PROXIED_RESOURCE_TYPES.has('script')).toBe(true);
  });

  it('DIRECT_RESOURCE_TYPES is what the handler actually consults', () => {
    // Asserting only that PROXIED excludes 'image' proves nothing: the handler consulted a *separate*
    // hand-written list, so a handler that proxied images would still have passed. This asserts the list
    // the handler uses, and that the two sets cannot overlap.
    //
    // `image`, `media` and `font` were moved into PROXIED: their bodies cannot be read back by page
    // script, but the *request* still went to whatever address the resolver returned — a blind SSRF.
    // Proxying them closes that. Only `websocket` remains direct, because Playwright's routing never
    // sees it.
    expect([...DIRECT_RESOURCE_TYPES].sort()).toEqual(['websocket']);
    for (const type of DIRECT_RESOURCE_TYPES) {
      expect(PROXIED_RESOURCE_TYPES.has(type), type).toBe(false);
    }
    for (const type of PROXIED_RESOURCE_TYPES) {
      expect(DIRECT_RESOURCE_TYPES.has(type), type).toBe(false);
    }
  });

  it('every type Chromium reports lands in exactly one set', () => {
    // A first version asserted `4 + 11 === 13`, which failed at 15 and exposed that 'json' was listed as
    // a proxied resource type when Chromium never reports one: a JSON response arrives as `xhr`, `fetch`
    // or `other`. A dead member is worse than a missing one, because it looks like coverage.
    const reported = new Set(ALL_RESOURCE_TYPES);
    for (const type of reported) {
      const inProxied = PROXIED_RESOURCE_TYPES.has(type);
      const inDirect = DIRECT_RESOURCE_TYPES.has(type);
      expect(inProxied !== inDirect, type + ' is in both, or in neither').toBe(true);
    }
    // Nothing outside Chromium's own vocabulary is claimed, or the sum stops meaning anything.
    for (const type of PROXIED_RESOURCE_TYPES) {
      expect(reported.has(type), type + ' is never reported by Chromium').toBe(true);
    }
  });

  it('websocket is listed as direct because routing never sees it', () => {
    // Not a choice - Playwright does not route websocket upgrades. It is listed so the set a caller reads
    // is complete rather than quietly missing a type.
    expect(DIRECT_RESOURCE_TYPES.has('websocket')).toBe(true);
  });

  it('the note says so in words a caller can read', () => {
    expect(PROXY_NOTE).toMatch(/WebSocket/);
    expect(PROXY_NOTE).toMatch(/image, media va font/);
  });
});

describe('parseSetCookie', () => {
  const base = 'http://host.example/app/page?q=1';

  it('reads the attributes addCookies needs', () => {
    const cookie = parseSetCookie('sid=abc; Path=/; HttpOnly; Secure; SameSite=Strict', base);
    expect(cookie).toMatchObject({
      name: 'sid',
      value: 'abc',
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      domain: 'host.example',
    });
  });

  it('defaults the path to the request directory', () => {
    expect(parseSetCookie('a=1', 'http://host.example/app/page')?.path).toBe('/app/');
    expect(parseSetCookie('a=1', 'http://host.example/app/')?.path).toBe('/app/');
  });

  it('honours Domain and strips the leading dot', () => {
    expect(parseSetCookie('a=1; Domain=.example.com', base)?.domain).toBe('example.com');
  });

  it('reads Max-Age into an expiry', () => {
    const cookie = parseSetCookie('a=1; Max-Age=60', base);
    expect(cookie?.expires).toBeGreaterThan(Date.now() / 1000);
  });

  it('drops a header with no name rather than inventing one', () => {
    expect(parseSetCookie('=novalue', base)).toBeNull();
    expect(parseSetCookie('novalue', base)).toBeNull();
    expect(parseSetCookie('', base)).toBeNull();
  });

  it('treats SameSite without a value as Lax', () => {
    expect(parseSetCookie('a=1; SameSite', base)?.sameSite).toBe('Lax');
  });

  it('keeps a value containing an equals sign', () => {
    expect(parseSetCookie('jwt=a.b.c=d', base)?.value).toBe('a.b.c=d');
  });
});
