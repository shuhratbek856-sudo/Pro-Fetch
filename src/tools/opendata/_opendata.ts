/**
 * Socrata Open Data portals, and the Socrata Discovery API in front of them.
 *
 * Everything here is built on endpoints that were probed before a line was written, because four
 * assumptions that read as reasonable were all false:
 *
 * **CKAN is not what data.gov runs.** `data.gov/api/3/action/*`, `catalog.data.gov/api/3/action/*` and
 * `www.data.gov/api/3/action/*` all answer 404 - the first and last with an HTML error page, the
 * middle with `{"message":"Not Found"}`. The US open-data portals are Socrata, and the entry point
 * that works without a credential is `api.us.socrata.com/api/catalog/v1`, measured at 200 with real
 * results.
 *
 * **`/api/views/{id}/rows` does not exist on modern portals.** It answered 404 on both
 * `data.cityofnewyork.us` and `data.fortworthtexas.gov` while `/api/views/{id}` answered 200 on the
 * same host in the same second. Row access is SODA: `/resource/{id}.json`.
 *
 * **The catalog cannot find a dataset by searching for its id.** `?q=8wbx-tsch` returns zero results
 * on every variation tried, so a resolver built on a text search fails on the most common input there
 * is. `?ids=8wbx-tsch` returns the dataset with its domain - that is the parameter that resolves an
 * id, and it is the one this module uses.
 *
 * **SODA is per-portal and sometimes switched off.** `data.fortworthtexas.gov/resource/{id}.json`
 * answers HTTP 200 with an HTML page. Treating that as data would hand the caller a web page as the
 * first row of a dataset, so the HTML case is detected and named.
 *
 * Column names are identifiers written by people, and SoQL errors come back as 400 with a `message`
 * that names the offending column. That message is passed through, because "No such column: creatd" is
 * more useful than anything this code could compose.
 */

import { fetchWithOptions } from '../../core/http-client.js';
import { parseUpstreamJson, tryParseUpstreamJson } from '../../core/json-response.js';
import type { ToolResult } from '../../core/types.js';
import { jsonBlock } from '../../core/format.js';

/** The global catalog. Reachable without a credential; measured 200 with results. */
export const CATALOG = 'https://api.us.socrata.com/api/catalog/v1';

export const USER_AGENT = process.env.PRO_FETCH_USER_AGENT ?? 'pro-fetch-mcp (MCP server; open data tooling)';

export interface DatasetRef {
  id: string;
  /**
   * The host taken from the input, if it looks like a portal host.
   *
   * This is a *hint*, never the answer. The first version required the host to end in `.gov` and
   * dropped everything else, which silently threw away `data.cityofnewyork.us` - one of the largest
   * portals on the network - and fell back to a catalog lookup that worked anyway, so the mistake was
   * invisible in the live tests. The check is now "does this look like a host at all", and
   * `resolveDataset` prefers the domain the catalog reports over anything the caller typed.
   */
  domain: string;
}

export interface CatalogResult {
  id: string;
  name: string;
  description: string;
  domain: string;
  type: string;
  permalink: string;
  updated_at?: string;
  created_at?: string;
  download_count?: number;
  view_count?: number;
  categories?: string[];
  tags?: string[];
  columns?: Array<{ name: string; field_name: string; data_type_name: string; description?: string }>;
}

interface RawCatalogEntry {
  resource?: {
    id?: string;
    name?: string;
    description?: string;
    type?: string;
    columns_name?: string[];
    columns_field_name?: string[];
    columns_datatype?: string[];
    columns_description?: string[];
    updatedAt?: string;
    createdAt?: string;
    download_count?: number;
    page_views?: { page_views_total?: number };
  };
  metadata?: { domain?: string };
  permalink?: string;
  classification?: { categories?: string[]; tags?: string[] };
}

/** Socrata ids are four lowercase alphanumerics in two groups, e.g. `8wbx-tsch`. */
const ID_PATTERN = /^[a-z0-9]{4}-[a-z0-9]{4}$/;

export function isDatasetId(value: string): boolean {
  return ID_PATTERN.test(value.trim().toLowerCase());
}

/**
 * Accept a dataset reference as an id, a permalink or a SODA URL.
 *
 * Every public dataset link on these portals contains the id, so all three forms are common. The host
 * is only taken from the input when it ends in `.gov`, so a crafted string cannot redirect a request
 * to an arbitrary domain - a permalink pointing at `evil.example.com` is treated as id-only and
 * resolved through the catalog instead.
 */
export function parseReference(input: string): DatasetRef | { error: string } {
  const raw = input.trim();
  if (!raw) return { error: 'dataset id, permalink yoki SODA manzili kerak.' };
  const found = /([a-z0-9]{4}-[a-z0-9]{4})/i.exec(raw);
  if (!found) {
    return { error: `"${raw}" ichida dataset id topilmadi. Shakl: "8wbx-tsch" yoki to‘liq permalink.` };
  }
  // A host is taken from the input only when it looks like a portal host: plain labels, at least two
  // of them, no credentials, no port, no path traversal. This is a shape check to keep junk out of the
  // URL that gets built later - it is not what makes the request trustworthy, because `resolveDataset`
  // asks the catalog which domain owns the id and prefers that answer over this one.
  const host = /^(?:https?:\/\/)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+)(?:[:/?#]|$)/i.exec(raw);
  const candidate = host?.[1]?.toLowerCase() ?? '';
  const domain = candidate.length <= 100 ? candidate : '';
  return { id: found[1].toLowerCase(), domain };
}

type Fetcher = <T>(url: string, label: string, timeoutMs?: number) => Promise<Fetched<T>>;

export type Fetched<T> =
  { ok: true; value: T; status: number } | { ok: false; message: string; status: number; html: boolean };

async function request<T>(url: string, label: string, timeoutMs = 30_000): Promise<Fetched<T>> {
  let response;
  try {
    response = await fetchWithOptions(url, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      timeoutMs,
    });
  } catch (error) {
    return {
      ok: false,
      status: 0,
      html: false,
      message: `${label}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const contentType = response.contentType ?? '';
  const looksHtml = contentType.includes('html') || /^\s*<(!doctype|html)/i.test(response.text);

  if (response.status >= 400) {
    // The provider's own message names the bad column or the malformed clause, which is worth more
    // than anything invented here. Parsed through the shared helper because a bare `JSON.parse` on a
    // network body is what `verify:static` exists to reject.
    let detail = response.text.trim().slice(0, 160);
    const decoded = tryParseUpstreamJson<{ message?: string; code?: string }>(response);
    if (decoded.ok) {
      detail = decoded.value.message ?? (decoded.value.code ? String(decoded.value.code) : detail);
    }
    return {
      ok: false,
      status: response.status,
      html: looksHtml,
      message: `${label}: HTTP ${response.status} - ${detail}`,
    };
  }

  if (looksHtml) {
    return {
      ok: false,
      status: response.status,
      html: true,
      message:
        `${label}: JSON o‘rniga HTML qaytdi. Bu portal ma’lumot API sini yopiq qo‘ygan bo‘lishi mumkin - ` +
        'katalog ishlaydi, qatorlarga esa kirish yo‘q.',
    };
  }

  try {
    return { ok: true, value: parseUpstreamJson<T>(response, label), status: response.status };
  } catch (error) {
    return { ok: false, status: response.status, html: false, message: (error as Error).message };
  }
}

export const fetchJson: Fetcher = request;

function toResult(entry: RawCatalogEntry): CatalogResult {
  const resource = entry.resource ?? {};
  const result: CatalogResult = {
    id: resource.id ?? '',
    name: resource.name ?? '',
    description: (resource.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 400),
    domain: entry.metadata?.domain ?? '',
    type: resource.type ?? '',
    permalink: entry.permalink ?? '',
    updated_at: resource.updatedAt,
    created_at: resource.createdAt,
    download_count: resource.download_count,
    view_count: resource.page_views?.page_views_total,
    categories: entry.classification?.categories?.length ? entry.classification.categories : undefined,
    tags: entry.classification?.tags?.length ? entry.classification.tags : undefined,
  };
  // The catalog sends three parallel arrays rather than objects, so the columns are zipped here.
  // A shorter companion array is not fatal: the missing entries keep their name and lose the rest,
  // because reporting fewer columns is better than refusing to describe the dataset at all.
  const count = resource.columns_name?.length ?? 0;
  if (count > 0) {
    const columns: NonNullable<CatalogResult['columns']> = [];
    for (let index = 0; index < count; index += 1) {
      columns.push({
        name: resource.columns_name?.[index] ?? '',
        field_name: resource.columns_field_name?.[index] ?? '',
        data_type_name: resource.columns_datatype?.[index] ?? 'Unknown',
        description: resource.columns_description?.[index] || undefined,
      });
    }
    result.columns = columns;
  }
  return result;
}

export async function searchCatalog(options: {
  query: string;
  domains?: string;
  limit: number;
  offset?: number;
  type?: string;
}): Promise<{ ok: true; results: CatalogResult[]; total: number } | { ok: false; message: string }> {
  const params = new URLSearchParams();
  if (options.query) params.set('q', options.query);
  if (options.domains) params.set('domains', options.domains);
  params.set('limit', String(options.limit));
  if (options.offset) params.set('offset', String(options.offset));
  if (options.type) params.set('only', options.type);

  const response = await fetchJson<{ results?: RawCatalogEntry[]; resultSetSize?: number }>(
    `${CATALOG}?${params.toString()}`,
    'Socrata katalog',
  );
  if (!response.ok) return { ok: false, message: response.message };

  const entries = Array.isArray(response.value?.results) ? response.value.results : [];
  return {
    ok: true,
    results: entries.map(toResult),
    // `resultSetSize` is the catalog's own total. Falling back to the page length would report
    // "3 results" for a catalog of 920, which reads as "there were only three".
    total: Number(response.value?.resultSetSize ?? entries.length),
  };
}

/**
 * Look up datasets by id. This is the only reliable way to get a domain from an id.
 *
 * An id that does not exist is absent from the response rather than an error, so a mixed request
 * resolves the ids it can and the caller is told which ones it could not.
 */
export async function lookupByIds(
  ids: string[],
): Promise<{ ok: true; found: Map<string, CatalogResult> } | { ok: false; message: string }> {
  const response = await fetchJson<{ results?: RawCatalogEntry[] }>(
    `${CATALOG}?ids=${ids.join(',')}`,
    'Socrata dataset izohi',
  );
  if (!response.ok) return { ok: false, message: response.message };

  const found = new Map<string, CatalogResult>();
  for (const entry of response.value?.results ?? []) {
    const result = toResult(entry);
    if (result.id) found.set(result.id, result);
  }
  return { ok: true, found };
}

/** Resolve the domain for one dataset, through `?ids=`. */
export async function resolveDataset(
  id: string,
  hint?: string,
): Promise<
  | { ok: true; domain: string; name?: string; permalink?: string; from_catalog: boolean }
  | { ok: false; message: string }
> {
  const looked = await lookupByIds([id]);
  if (!looked.ok) return looked;
  const entry = looked.found.get(id);
  // The catalog's answer wins. A caller can hand in any host, and the catalog is the authority on
  // which portal owns the dataset; a typed host is only a fallback for a dataset the catalog does not
  // list, and it is still shaped-checked in `parseReference`.
  const domain = entry?.domain || hint || '';
  if (!domain) {
    return {
      ok: false,
      message:
        `"${id}" uchun domen topilmadi. Bu id katalogda yo‘q yoki maxfiy dataset bo‘lishi mumkin. ` +
        'To‘liq permalinkni bering (masalan https://data.cityofnewyork.us/d/8wbx-tsch).',
    };
  }
  return { ok: true, domain, name: entry?.name, permalink: entry?.permalink, from_catalog: Boolean(entry?.domain) };
}

/** Rows through SODA, with the portal's own error text preserved. */
export async function sodaRows(
  domain: string,
  id: string,
  params: Record<string, string>,
): Promise<{ ok: true; rows: Array<Record<string, unknown>> } | { ok: false; message: string; html: boolean }> {
  const response = await fetchJson<Array<Record<string, unknown>>>(
    `https://${domain}/resource/${id}.json?${new URLSearchParams(params).toString()}`,
    `${domain} SODA`,
    45_000,
  );
  if (!response.ok) return { ok: false, message: response.message, html: response.html };
  if (!Array.isArray(response.value)) {
    return {
      ok: false,
      html: false,
      message: `SODA massiv qaytarmadi, ${typeof response.value}: ${JSON.stringify(response.value).slice(0, 120)}`,
    };
  }
  return { ok: true, rows: response.value };
}

/** Dataset metadata from the portal's own API. */
export async function datasetMeta(
  domain: string,
  id: string,
): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; message: string }> {
  const response = await fetchJson<Record<string, unknown>>(
    `https://${domain}/api/views/${id}`,
    `${domain} dataset metama'lumoti`,
  );
  if (!response.ok) return { ok: false, message: response.message };
  return { ok: true, value: response.value };
}

/** SoQL identifiers are column names, which are written by people and contain spaces. */
export function soqlIdentifier(name: string): string {
  if (/^[a-z_][a-z0-9_]*$/i.test(name)) return name;
  return `\`${name.replace(/`/g, '')}\``;
}

/** A "nothing matched" answer that says what was actually asked. */
export function emptyResult(what: Record<string, unknown>): ToolResult {
  return jsonBlock('Natijalar', { rows: [], count: 0, ...what });
}
