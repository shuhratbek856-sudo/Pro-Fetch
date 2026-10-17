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

export async function resolveSafeUrl(rawUrl: string): Promise<SafeUrlResolution> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UrlSecurityError('Yaroqsiz URL: ' + describeUrl(rawUrl), 'INVALID_URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
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
    resolved = (await lookup(host, { all: true })) as Array<{ address: string; family: number }>;
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
