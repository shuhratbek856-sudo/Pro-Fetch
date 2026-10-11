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
export async function resolveSafeUrl(rawUrl: string): Promise<SafeUrlResolution> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UrlSecurityError('Yaroqsiz URL: ' + rawUrl, 'INVALID_URL');
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
