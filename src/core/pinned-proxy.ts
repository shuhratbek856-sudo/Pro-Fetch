/**
 * Serves a browser request from this process, over a DNS-pinned connection.
 *
 * ## The gap this closes
 *
 * `browser-tools.ts` validated a request's host and then called `route.continue()`, after which
 * **Chromium resolved the name itself**. Two resolutions, two chances to disagree, and the second one was
 * the connection that actually happened. A resolver answering public for the check and `169.254.169.254`
 * for Chromium is the whole attack, and no amount of checking at this layer could see it.
 *
 * Requiring two lookups to agree (`assertStableSafeUrl`) narrows that: a resolver that has to keep
 * changing its mind is caught. It does not close it. A resolver that answers public, public, private
 * wins, and there is no third lookup.
 *
 * The only way to be sure is for the bytes to come from a connection this process made, to an address
 * this process chose. That is what this module does: resolve, validate, connect to the validated address,
 * and hand the response to Chromium. Chromium never resolves the name, so there is nothing left to
 * rebind.
 *
 * ## Redirects are passed through, not followed
 *
 * A redirect is fulfilled as a 3xx with its `Location`, and Chromium follows it. The alternative -
 * following it here and fulfilling the final body at the original URL - breaks relative URLs on almost
 * every real page, because the document would be served from a URL it did not come from. Each hop
 * re-enters this function, so every hop is validated and pinned on its own.
 *
 * ## What is not proxied, and why
 *
 * `image`, `media` and `font` continue to be fetched by Chromium directly. A cross-origin image, video or
 * font cannot be read back by page script - the canvas is tainted and the stylesheet cannot exfiltrate a
 * body - so proxying them would not stop a data leak, only make every page slower and buffer unbounded
 * video in memory. What remains for those three types is a **blind** request to whatever address the
 * resolver returns: the request happens, the response does not reach the attacker. `other`, `xhr`,
 * `fetch`, `script`, `stylesheet`, `document`, `json` and `eventsource` are proxied, because those can
 * carry a response body back into script.
 *
 * Websockets do not pass through Playwright's routing at all and are neither proxied nor interceptable;
 * a browser session that opens one is outside this defence, which is stated in `PROXY_NOTE` so a
 * diagnostics caller can see it rather than infer safety.
 *
 * ## Cookies
 *
 * `route.fulfill` cannot carry more than one `Set-Cookie` header, and a login flow usually sets several.
 * Measured: a response with three cookies arrived as one, and Chromium's jar then held a single entry.
 * So the header is stripped and the cookies are written through `context.addCookies` with their path,
 * `Secure`, `HttpOnly`, `SameSite` and expiry preserved. Verified end to end: three cookies stored with
 * their attributes and sent on the next request, with the `Secure` one correctly withheld over HTTP.
 */

import { dispatcherFor } from './http-client.js';
import { resolveSafeUrl } from './ssrf-guard.js';
import { withNetworkConcurrency } from './network-gate.js';

/** Resource types served through this process. */
export const PROXIED_RESOURCE_TYPES: ReadonlySet<string> = new Set([
  'document',
  'xhr',
  'fetch',
  'script',
  'stylesheet',
  'json',
  'eventsource',
  'other',
]);

/**
 * Why the excluded types are excluded, for a caller that wants to report the boundary.
 *
 * A diagnostic that says "SSRF-protected" without this would be claiming more than is true.
 */
export const PROXY_NOTE =
  'document, xhr, fetch, script, stylesheet, json va eventsource ushbu jarayon orqali DNS pin qilingan ' +
  'kanal orqali beriladi - Chromium umuman resolve qilmaydi. image, media va font to‘g‘ridan-to‘g‘ri ' +
  'beriladi: ular javob tanasini sahifaga qaytarib bermaydi, shuning uchun ma’lumot sizib chiqmaydi, ' +
  'lekin so‘rov manzilga yetib boradi (ko‘r ish). WebSocket Playwright marshrutidan o‘tmaydi.';

/** Largest body proxied, in bytes. Beyond this the request is refused rather than silently downgraded. */
export const MAX_PROXIED_BODY_BYTES = 64 * 1024 * 1024;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Response headers that must not be copied to a fulfilled response.
 *
 * `content-encoding` because this client decompressed the body and Chromium would try to decode it a
 * second time; `content-length` because the length no longer matches; the rest because they describe the
 * connection rather than the payload. Measured: with `content-encoding` forwarded, a gzipped page
 * rendered as binary garbage instead of text.
 */
const STRIPPED_RESPONSE_HEADERS: ReadonlySet<string> = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'upgrade',
]);

/** Request headers that describe this process's connection rather than the browser's request. */
const STRIPPED_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'transfer-encoding',
  'upgrade',
  'keep-alive',
]);

/**
 * Injection point for the URL policy, used by tests.
 *
 * Swapping the *policy* is legitimate: "is this address private" has its own tests, and the browser
 * wiring test needs to reach a fixture server on loopback. Swapping the *pinning* would not be - so this
 * parameter only replaces the decision, and `dispatcherFor` still connects to whatever address the
 * resolver returned. That is what makes the test meaningful rather than a different code path.
 *
 * Nothing in production passes it.
 */
export interface ProxyOptions {
  resolve?: (rawUrl: string) => Promise<{ url: URL; addresses: Array<{ address: string; family: number }> }>;
}

export interface ProxiedResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  /** Cookies to write into the browser jar, already parsed. */
  cookies: Array<ParsedCookie>;
  /** The URL this response came from, which is the one that was pinned. */
  url: string;
  /** True when the body was not proxied because it exceeded `MAX_PROXIED_BODY_BYTES`. */
  tooLarge: boolean;
}

export interface ParsedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Lax' | 'Strict' | 'None';
  expires?: number;
}

/**
 * Fetch one hop over a connection pinned to the validated address.
 *
 * Exactly one hop: a redirect is returned as a redirect. Following it here would fix the pinning but
 * break the browser's URL semantics.
 */
export async function fetchPinnedHop(
  rawUrl: string,
  init: { method: string; headers: Record<string, string>; body?: string },
  options: ProxyOptions = {},
): Promise<ProxiedResponse> {
  const resolution = await (options.resolve ?? resolveSafeUrl)(rawUrl);
  const dispatcher = dispatcherFor(resolution.url, resolution.addresses);

  const requestHeaders = new Headers();
  for (const [name, value] of Object.entries(init.headers)) {
    if (STRIPPED_REQUEST_HEADERS.has(name.toLowerCase())) continue;
    try {
      requestHeaders.set(name, value);
    } catch {
      // A header the runtime refuses to set is dropped rather than failing the whole request; the page
      // sees one missing header instead of no page.
    }
  }

  const response = await withNetworkConcurrency(resolution.url.hostname, () =>
    fetch(resolution.url, {
      method: init.method,
      headers: requestHeaders,
      body: init.body,
      redirect: 'manual',
      dispatcher,
    } as RequestInit),
  );

  const headers: Record<string, string> = {};
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() === 'set-cookie') continue;
    if (STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) continue;
    headers[name] = value;
  }

  const setCookieValues =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : response.headers.get('set-cookie')
        ? [response.headers.get('set-cookie') as string]
        : [];

  // A redirect carries no body; reading it would waste the connection and cannot change the answer.
  if (REDIRECT_STATUSES.has(response.status)) {
    await response.body?.cancel().catch(() => {});
    return {
      status: response.status,
      headers,
      body: Buffer.alloc(0),
      cookies: [],
      url: resolution.url.toString(),
      tooLarge: false,
    };
  }

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_PROXIED_BODY_BYTES) {
    await response.body?.cancel().catch(() => {});
    return {
      status: response.status,
      headers,
      body: Buffer.alloc(0),
      cookies: setCookieValues
        .map((raw) => parseSetCookie(raw, resolution.url.toString()))
        .filter((entry): entry is ParsedCookie => entry !== null),
      url: resolution.url.toString(),
      tooLarge: true,
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_PROXIED_BODY_BYTES) {
    return {
      status: response.status,
      headers,
      body: Buffer.alloc(0),
      cookies: setCookieValues
        .map((raw) => parseSetCookie(raw, resolution.url.toString()))
        .filter((entry): entry is ParsedCookie => entry !== null),
      url: resolution.url.toString(),
      tooLarge: true,
    };
  }

  return {
    status: response.status,
    headers,
    body: buffer,
    cookies: setCookieValues
      .map((raw) => parseSetCookie(raw, resolution.url.toString()))
      .filter((entry): entry is ParsedCookie => entry !== null),
    url: resolution.url.toString(),
    tooLarge: false,
  };
}

/**
 * Parse one `Set-Cookie` header into the fields `context.addCookies` needs.
 *
 * Not a complete RFC 6265 implementation, and the omissions are chosen rather than missed: `SameSite`
 * without a value is treated as `Lax` (the modern default), an unparseable `Expires` is ignored rather
 * than turned into a session cookie, and a header with no `=` is dropped instead of inventing a name.
 */
export function parseSetCookie(header: string, url: string): ParsedCookie | null {
  const [pair, ...attributes] = header.split(';').map((part) => part.trim());
  if (!pair) return null;
  const separator = pair.indexOf('=');
  if (separator <= 0) return null;
  const name = pair.slice(0, separator).trim();
  const value = pair.slice(separator + 1).trim();
  if (!name) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const defaultPath = parsed.pathname.endsWith('/')
    ? parsed.pathname
    : parsed.pathname.slice(0, parsed.pathname.lastIndexOf('/') + 1) || '/';
  let domain = parsed.hostname;
  let cookiePath = defaultPath;
  let secure = false;
  let httpOnly = false;
  let sameSite: 'Lax' | 'Strict' | 'None' = 'Lax';
  let expires: number | undefined;

  for (const attribute of attributes) {
    const at = attribute.indexOf('=');
    const key = (at === -1 ? attribute : attribute.slice(0, at)).trim().toLowerCase();
    const attributeValue = at === -1 ? '' : attribute.slice(at + 1).trim();
    if (key === 'domain' && attributeValue) domain = attributeValue.replace(/^\./, '');
    else if (key === 'path' && attributeValue.startsWith('/')) cookiePath = attributeValue;
    else if (key === 'secure') secure = true;
    else if (key === 'httponly') httpOnly = true;
    else if (key === 'samesite') {
      const normalised = attributeValue.toLowerCase();
      sameSite = normalised === 'strict' ? 'Strict' : normalised === 'none' ? 'None' : 'Lax';
    } else if (key === 'max-age') {
      const seconds = Number(attributeValue);
      if (Number.isFinite(seconds)) expires = Date.now() / 1000 + seconds;
    } else if (key === 'expires') {
      const when = Date.parse(attributeValue);
      if (!Number.isNaN(when)) expires = when / 1000;
    }
  }

  return {
    name,
    value,
    domain,
    path: cookiePath,
    secure,
    httpOnly,
    sameSite,
    ...(expires !== undefined ? { expires } : {}),
  };
}

/** The subset of Playwright's route and request objects this handler uses. */
export interface ProxyRouteRequest {
  url(): string;
  method(): string;
  headers(): Record<string, string>;
  postData(): string | null;
  resourceType(): string;
  isNavigationRequest(): boolean;
  frame(): unknown;
}
export interface ProxyRoute {
  request(): ProxyRouteRequest;
  continue(): Promise<void>;
  abort(reason?: string): Promise<void>;
  fulfill(options: { status: number; headers: Record<string, string>; body: Buffer }): Promise<void>;
}
export interface ProxyTarget {
  addCookies(cookies: ParsedCookie[]): Promise<void>;
  mainFrame(): unknown;
}

/** Resource types that continue to bypass this process. */
const DIRECT_RESOURCE_TYPES: ReadonlySet<string> = new Set(['image', 'media', 'font']);

/**
 * Build the route handler that serves a browser's requests from this process.
 *
 * Exported so the tests exercise this function rather than a copy of it. An earlier version of the test
 * re-implemented the handler, which is how it came to omit the request headers and report that cookies
 * were not being stored when they simply were never being sent.
 *
 * `validate` is the caller's URL policy, kept as a parameter for the same reason as `resolve`: the guard
 * that blocks loopback is tested elsewhere, and the wiring test needs to reach its own fixture.
 */
export function createProxyRouteHandler(
  target: ProxyTarget,
  options: {
    validate: (url: string) => Promise<void>;
    /** Extra check applied to top-level navigations only. */
    validateNavigation?: (url: string) => Promise<void>;
    resolve?: ProxyOptions['resolve'];
  },
): (route: ProxyRoute) => Promise<void> {
  return async (route: ProxyRoute) => {
    const request = route.request();
    try {
      const url = request.url();
      if (['data:', 'blob:', 'about:'].includes(new URL(url).protocol)) {
        await route.continue();
        return;
      }
      await options.validate(url);

      if (DIRECT_RESOURCE_TYPES.has(request.resourceType())) {
        // image, media, font. A cross-origin response body from these cannot be read back by page
        // script, so proxying them would cost every page its speed without stopping a data leak. The
        // residual is a blind request to whatever the resolver returns; see `PROXY_NOTE`.
        if (request.isNavigationRequest() && request.frame() === target.mainFrame()) {
          await options.validateNavigation?.(url);
        }
        await route.continue();
        return;
      }

      const proxied = await fetchPinnedHop(
        url,
        { method: request.method(), headers: request.headers(), body: request.postData() ?? undefined },
        { resolve: options.resolve },
      );

      if (proxied.tooLarge) {
        // Aborting rather than falling back to `continue()`: the fallback would silently reopen the
        // hole this path exists to close, and a page with a large script would appear to work.
        await route.abort('blockedbyclient').catch(() => {});
        return;
      }

      if (proxied.cookies.length > 0) {
        // `route.fulfill` carries at most one `Set-Cookie`, and a login sets several. Measured: three
        // arrived as one. The jar is written here instead, with the attributes preserved.
        await target.addCookies(proxied.cookies).catch(() => {});
      }

      await route.fulfill({ status: proxied.status, headers: proxied.headers, body: proxied.body });
    } catch {
      await route.abort('blockedbyclient').catch(() => {});
    }
  };
}
