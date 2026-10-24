import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export class UrlSecurityError extends Error {
  constructor(
    message: string,
    readonly code: string = 'SSRF_BLOCKED',
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'UrlSecurityError';
  }
}

export function isPrivateIp(ip: string): boolean {
  let address: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    address = ipaddr.parse(ip);
  } catch {
    return true;
  }
  if (address.kind() === 'ipv6') {
    const ipv6 = address as ipaddr.IPv6;
    if (ipv6.isIPv4MappedAddress()) return ipv6.toIPv4Address().range() !== 'unicast';
  }
  return address.range() !== 'unicast';
}

export interface SafeUrlResolution {
  url: URL;
  addresses: Array<{ address: string; family: number }>;
}

/** Resolve and validate a URL once. The returned addresses can be pinned at connect time
 * so a second DNS lookup cannot turn a public host into an internal target (DNS rebinding). */
/**
 * Describe a URL without repeating anything secret from it.
 *
 * The invalid-URL branch used to echo the caller's whole string:
 *
 *     throw new UrlSecurityError('Yaroqsiz URL: ' + rawUrl, 'INVALID_URL');
 *
 * A URL is a common carrier of credentials - `?token=`, `?api_key=`, `&signature=` - and webhook URLs put
 * the secret in the *path*, where no query-parameter filter can reach it. The message then carries the
 * secret into the model's context and into any log that records it. So the message describes the shape
 * and nothing else. A caller who mistyped a URL still sees that it failed and how long it was; nobody
 * reading the log gets the token.
 *
 * A URL that parses is reported more usefully, because a parsed URL has already been shown to carry no
 * credentials in its authority component - `url.username`/`url.password` are rejected separately - and a
 * hostname is not itself secret. Query *names* are printed because the failure is often about the wrong
 * parameter; query *values* never are.
 */
export function describeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return `<yaroqsiz URL, uzunligi ${rawUrl.length}>`;
  }
  const scheme = url.protocol.replace(':', '');
  const names = [...new Set([...url.searchParams.keys()])];
  const query = names.length === 0 ? '' : `, query kalitlari: ${names.join(', ')}`;
  const segments = url.pathname.split('/').filter(Boolean).length;
  const path = segments === 0 ? '' : `, yo'l segmentlari: ${segments}`;
  return `${scheme}://${url.host}${path}${query}`;
}

/**
 * Injectable resolver, so the DNS-dependent decisions here can be tested without a network.
 *
 * `node:dns/promises.lookup` was called directly, which made every rule in this file untestable
 * offline - including the rebinding rule below, whose entire subject is an answer that changes between
 * two lookups. A test that needs a live DNS server to observe a DNS behaviour is a test that will not
 * run where it matters.
 */
export type DnsLookup = (host: string) => Promise<Array<{ address: string; family: number }>>;

const systemLookup: DnsLookup = async (host) =>
  (await lookup(host, { all: true })) as Array<{ address: string; family: number }>;

export async function resolveSafeUrl(
  rawUrl: string,
  options: { lookup?: DnsLookup; protocols?: Set<string> } = {},
): Promise<SafeUrlResolution> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UrlSecurityError('Yaroqsiz URL: ' + describeUrl(rawUrl), 'INVALID_URL');
  }
  const allowed = options.protocols ?? new Set(['http:', 'https:']);
  if (!allowed.has(url.protocol)) {
    throw new UrlSecurityError('Ruxsat etilmagan protokol: ' + url.protocol, 'POLICY_BLOCKED');
  }
  if (url.username || url.password) throw new UrlSecurityError('URL ichida username/password berish taqiqlangan.');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan')
  ) {
    throw new UrlSecurityError('Ichki host bloklandi (SSRF himoyasi): ' + host);
  }
  try {
    ipaddr.parse(host);
    if (isPrivateIp(host)) throw new UrlSecurityError('Ichki yoki maxsus IP bloklandi (SSRF himoyasi): ' + host);
    const family = host.includes(':') ? 6 : 4;
    return { url, addresses: [{ address: host, family }] };
  } catch (error) {
    if (error instanceof Error && error.message.includes('SSRF himoyasi')) throw error;
  }
  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await (options.lookup ?? systemLookup)(host);
  } catch {
    throw new UrlSecurityError('DNS host manziliga resolve bo‘lmadi: ' + host, 'DNS_ERROR', true);
  }
  if (!resolved.length) throw new UrlSecurityError('DNS host uchun manzil qaytarmadi: ' + host, 'DNS_ERROR', true);
  for (const r of resolved) {
    if (isPrivateIp(r.address)) throw new UrlSecurityError('DNS ichki IPga ishora qiladi (SSRF): ' + r.address);
  }
  return { url, addresses: resolved };
}

export async function assertSafeUrl(rawUrl: string): Promise<URL> {
  return (await resolveSafeUrl(rawUrl)).url;
}

/**
 * SSRF validation for WebSocket endpoints.
 *
 * `assertSafeUrl` rejects ws:/wss: structurally, so the WebSocket tools had no guard at all and would
 * happily connect to ws://localhost:6379 or ws://169.254.169.254 and stream back whatever they said. This
 * runs the exact same host-blocklist, private-IP and DNS-resolution checks, only allowing the WebSocket
 * schemes. (A residual DNS-rebinding window remains because the `ws` client does its own resolution at
 * connect time; the top-level internal-address block is the protection that actually matters here.)
 */
export async function assertSafeWebSocketUrl(rawUrl: string): Promise<URL> {
  return (await resolveSafeUrl(rawUrl, { protocols: new Set(['ws:', 'wss:']) })).url;
}

/**
 * Resolve twice and require the same answer both times.
 *
 * ## The window this narrows
 *
 * `resolveSafeUrl` resolves a host and checks the answers. Between that check and the connection, the
 * consumer performs its *own* resolution - and for the browser that consumer is Chromium, not this
 * process. `fetchWithOptions` does not have the problem, because `fetchFollowingSafeRedirects` returns
 * the addresses and the client connects to the pinned ones. The browser path has always had the gap.
 *
 * An attacker who controls a resolver can answer "public" for the check and "169.254.169.254" for
 * Chromium. Requiring two lookups to agree catches a resolver that alternates, which is what a rebinding
 * resolver must do to be useful - it needs the check and the connection to differ, so it has to keep
 * changing its mind.
 *
 * ## What this does not close
 *
 * A resolver that answers "public, public" to the two checks and "private" to the third is not caught,
 * and nothing at this layer can catch it: the only way to be sure is for the browser to connect to an
 * address this process chose, which means fulfilling every request through `route.fulfill` and giving up
 * streaming, request bodies and websockets. That trade is not made here, so this is a narrowing of the
 * window and not a fix for it, and the browser path should still be treated as weaker than the HTTP
 * client on a hostile network.
 *
 * Applied to top-level navigations only. Sub-resource requests are numerous and latency matters there;
 * the payoff is concentrated in the navigation, which is the request an attacker names.
 */
export async function assertStableSafeUrl(
  rawUrl: string,
  options: { lookup?: DnsLookup; gapMs?: number } = {},
): Promise<SafeUrlResolution> {
  const first = await resolveSafeUrl(rawUrl, options);
  const gapMs = options.gapMs ?? 50;
  if (gapMs > 0) await new Promise((resolve) => setTimeout(resolve, gapMs));

  let second: SafeUrlResolution;
  try {
    second = await resolveSafeUrl(rawUrl, options);
  } catch (error) {
    // The second answer refused the host. That is itself a disagreement, and it is the dangerous
    // direction: the first answer said the host was reachable.
    throw new UrlSecurityError(
      `DNS javobi barqaror emas: dastlabki tekshiruv o'tdi, keyingisi blokladi (` +
        `${(error as UrlSecurityError).message}). DNS rebinding ehtimoli.`,
      'DNS_UNSTABLE',
    );
  }

  const firstAddresses = first.addresses.map((entry) => entry.address).sort();
  const secondAddresses = second.addresses.map((entry) => entry.address).sort();
  if (firstAddresses.join(',') !== secondAddresses.join(',')) {
    throw new UrlSecurityError(
      'DNS javobi ikki tekshiruv orasida o‘zgardi (' +
        firstAddresses.join(',') +
        ' -> ' +
        secondAddresses.join(',') +
        '). DNS rebinding ehtimoli - so‘rov bloklandi.',
      'DNS_UNSTABLE',
    );
  }
  return second;
}
