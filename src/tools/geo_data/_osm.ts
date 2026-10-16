import { fetchWithOptions } from '../../core/http-client.js';
import { parseUpstreamJson } from '../../core/json-response.js';

/**
 * Shared plumbing for the OpenStreetMap-backed tools.
 *
 * Two facts shape this file, both measured rather than read off a documentation page.
 *
 * **The default Overpass endpoint is the one that is down.** `overpass-api.de` answered 502 for a
 * small query during development, twice in a row, while `overpass.kumi.systems` answered the same query
 * with 200 and 451 bytes. Hardcoding the primary would have shipped a tool that fails most of the time
 * and looks broken. The mirror list is tried in order and the endpoint that answered is reported, so a
 * caller is never left guessing which server they actually queried.
 *
 * **Nominatim and Overpass both want an identifying User-Agent.** Nominatim's usage policy requires one
 * and answers requests without it with 403; sending a generic one is how a tool gets an IP blocked.
 */

/** Tried in order. The first two are the commonly available mirrors. */
const OVERPASS_MIRRORS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
] as const;

export const USER_AGENT =
  process.env.PRO_FETCH_USER_AGENT ?? 'pro-fetch-mcp/0.3 (MCP tool; https://github.com/mtth/avsc)';

/** A fetch that carries the identifying agent and returns the parsed JSON body. */
export async function getJson(
  url: string,
  label: string,
  timeoutMs = 30_000,
): Promise<{ ok: true; value: unknown; status: number } | { ok: false; message: string; attempts: string[] }> {
  let response;
  try {
    response = await fetchWithOptions(url, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      timeoutMs,
    });
  } catch (error) {
    return { ok: false, message: `${label}: ${error instanceof Error ? error.message : String(error)}`, attempts: [] };
  }

  if (response.status >= 400) {
    return {
      ok: false,
      message: `${label}: HTTP ${response.status} — ${response.text.slice(0, 180).replace(/\s+/g, ' ')}`,
      attempts: [],
    };
  }

  try {
    // Every upstream JSON decode in this registry goes through parseUpstreamJson, and `verify:static`
    // rejects a bare JSON.parse on a network body. It matters here: an Overpass mirror answering 200 with
    // an HTML page would otherwise parse into a syntax error with no mention of the provider, and
    // "no results" would be the only reading left.
    return { ok: true, value: parseUpstreamJson(response, label), status: response.status };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      attempts: [],
    };
  }
}

/**
 * A refusal the caller can fix, as opposed to an outage.
 *
 * 429 is excluded deliberately: throttling is a property of that one mirror, and a different host is
 * exactly the right response to it. Every other 4xx describes the query, and retrying it elsewhere
 * wastes time and then reports a mirror outage for a problem the caller wrote.
 */
export function isClientRefusal(status: number): boolean {
  return status >= 400 && status < 500 && status !== 429;
}

/** The status out of a message shaped like `name: HTTP 503 � ...`. */
export function statusOf(message: string): number | null {
  const match = /HTTP (\d{3})/.exec(message);
  return match ? Number(match[1]) : null;
}

/**
 * Run an Overpass QL query against the mirrors in turn.
 *
 * Two distinctions this makes, both learned from a wrong error message.
 *
 * **A 4xx will not be fixed by another mirror.** The query itself is wrong, and every mirror would say
 * so identically. Trying the remaining three wastes a minute and then reports "all mirrors failed" for a
 * problem the caller caused.
 *
 * **A 5xx is the mirror, not the query.** Measured mid-development: all four mirrors answered 500 with
 * an HTML error page for a trivial bbox query while a `around:` query had succeeded minutes earlier.
 * Reporting that as "all mirrors failed" without saying why sends the caller to debug their own QL.
 *
 * So the per-endpoint failures are returned rather than collapsed into one sentence, and the result says
 * which of the two happened.
 */
export async function overpassQuery(
  ql: string,
  timeoutMs = 60_000,
): Promise<
  | { ok: true; value: unknown; endpoint: string; tried: string[] }
  | { ok: false; message: string; tried: string[]; client_error?: boolean }
> {
  const tried: string[] = [];
  const failures: string[] = [];

  for (const endpoint of OVERPASS_MIRRORS) {
    const host = new URL(endpoint).host;
    tried.push(host);
    const outcome = await getJson(`${endpoint}?data=${encodeURIComponent(ql)}`, host, timeoutMs);
    if (outcome.ok) return { ok: true, value: outcome.value, endpoint, tried };
    failures.push(outcome.message);

    // 429 is the exception: a mirror that throttles while another is idle is worth trying, so it does
    // fall through. Every other 4xx is the query, and no other host will answer differently.
    const status = statusOf(outcome.message);
    if (status !== null && isClientRefusal(status)) {
      return { ok: false, message: outcome.message, tried, client_error: true };
    }
  }

  return {
    ok: false,
    message:
      `Overpass so'rovi hech bir ko'zguchada bajarilmadi (${tried.join(', ')}). ` +
      `Barchasi 5xx berdi � bu ko'zguchaning nosozligi, so'rovning xatosi emas. ` +
      `Birinchi sabab: ${failures[0] ?? 'yo‘q'}`,
    tried,
  };
}

/** Format a coordinate pair the way the query languages expect it. */
export function coordinate(value: unknown, label: string): string {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} raqam emas: ${String(value)}`);
  if (parsed < -180 || parsed > 180) throw new Error(`${label} diapazonidan tashqarida (-180..180): ${parsed}`);
  return String(parsed);
}

export function latitude(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`lat raqam emas: ${String(value)}`);
  if (parsed < -90 || parsed > 90) throw new Error(`lat -90..90 orasida bo‘lishi kerak: ${parsed}`);
  return String(parsed);
}
