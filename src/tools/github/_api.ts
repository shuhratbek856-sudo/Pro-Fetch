import { getCredential } from '../../core/credentials.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { clipToTokens } from '../../core/chunker.js';
import type { ToolResult } from '../../core/types.js';

const GITHUB_API = 'https://api.github.com';

export interface GithubApiResult {
  status: number;
  json: any;
  text: string;
  headers: Record<string, string>;
  pagesFetched?: number;
  paginationTruncated?: boolean;
}

export async function ghApi(path: string, accept = 'application/vnd.github+json'): Promise<GithubApiResult> {
  const headers: Record<string, string> = {
    accept,
    'x-github-api-version': '2022-11-28',
  };
  const token = getCredential('GITHUB_TOKEN');
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await fetchWithOptions(GITHUB_API + path, { headers, retries: 2, timeoutMs: 20_000, cache: !token });
  let json: any = null;
  if (accept.includes('json') || res.status >= 400) {
    try {
      json = res.text ? JSON.parse(res.text) : null;
    } catch {
      json = null;
    }
  }
  const apiHeaders = res.headers;
  if (res.status === 403 && apiHeaders['x-ratelimit-remaining'] === '0' && json && typeof json === 'object') {
    json = { ...json, _proFetchRateLimit: { remaining: 0, resetAt: apiHeaders['x-ratelimit-reset'] ?? null } };
  }
  return { status: res.status, json, text: res.text, headers: apiHeaders };
}

function findNextPage(linkHeader: string | undefined, currentUrl: URL): string | undefined {
  if (!linkHeader) return undefined;
  for (const match of linkHeader.matchAll(/<([^>]+)>\s*;\s*rel=\"([^\"]+)\"/g)) {
    if (match[2] !== 'next') continue;
    try {
      const next = new URL(match[1], currentUrl);
      if (next.protocol !== 'https:' || next.hostname !== 'api.github.com' || next.username || next.password)
        return undefined;
      return next.pathname + next.search;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Follows GitHub's Link rel=next header, with a hard cap to avoid exhausting rate limits. */
export async function ghApiPaginated(path: string, requestedPages?: number): Promise<GithubApiResult> {
  const envPages = Number(process.env.PRO_FETCH_GITHUB_MAX_PAGES ?? 5);
  const maxPages = Math.max(
    1,
    Math.min(
      20,
      Math.floor(Number.isFinite(requestedPages) ? Number(requestedPages) : Number.isFinite(envPages) ? envPages : 5),
    ),
  );
  let nextPath = path.startsWith('/') ? path : '/' + path;
  const first = await ghApi(nextPath);
  if (first.status >= 400) return { ...first, pagesFetched: 1 };
  const isArray = Array.isArray(first.json);
  const arrayField =
    !isArray && Array.isArray(first.json?.items)
      ? 'items'
      : !isArray && Array.isArray(first.json?.workflow_runs)
        ? 'workflow_runs'
        : !isArray && Array.isArray(first.json?.repositories)
          ? 'repositories'
          : undefined;
  if (!isArray && !arrayField) return { ...first, pagesFetched: 1 };

  const collected: unknown[] = [...(isArray ? first.json : first.json[arrayField!])];
  let last = first;
  let pagesFetched = 1;
  let currentUrl = new URL(GITHUB_API + nextPath);
  let next = findNextPage(first.headers.link, currentUrl);
  while (next && pagesFetched < maxPages) {
    nextPath = next;
    currentUrl = new URL(GITHUB_API + nextPath);
    last = await ghApi(nextPath);
    pagesFetched++;
    if (last.status >= 400) return { ...last, pagesFetched, paginationTruncated: false };
    const batch = isArray ? last.json : last.json?.[arrayField!];
    if (!Array.isArray(batch)) break;
    collected.push(...batch);
    next = findNextPage(last.headers.link, currentUrl);
  }
  const resultJson = isArray
    ? collected
    : { ...first.json, [arrayField!]: collected, _proFetchPagination: { pagesFetched, truncated: Boolean(next) } };
  return {
    ...last,
    json: resultJson,
    text: JSON.stringify(resultJson),
    pagesFetched,
    paginationTruncated: Boolean(next),
  };
}

export function paginationNotice(response: GithubApiResult): string {
  return response.paginationTruncated
    ? `\n\n⚠️ Natijalar ${response.pagesFetched ?? 1} sahifadan keyin cheklangan. Ko‘proq natija uchun max_pages qiymatini oshiring (maksimum 20).`
    : '';
}

export function result(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function fail(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

export function md(text: string, maxTokens = 8000): ToolResult {
  return result(clipToTokens(text, maxTokens));
}

export function jsonBlock(title: string, data: unknown): ToolResult {
  const s = JSON.stringify(data, null, 2) ?? 'null';
  const body = s.length > 30_000 ? s.slice(0, 30_000) + '\n...qisqartirildi' : s;
  return result(title + '\n\n```json\n' + body + '\n```');
}

export function ghErr(status: number, json: any): ToolResult {
  const msg = json?.message ?? 'GitHub API xatosi';
  const rateLimit = json?._proFetchRateLimit as { remaining?: number; resetAt?: string } | undefined;
  const reset = rateLimit?.resetAt ? new Date(Number(rateLimit.resetAt) * 1000).toISOString() : undefined;
  const hint =
    rateLimit?.remaining === 0
      ? ` (GitHub API rate limit tugagan; reset: ${reset ?? 'vaqti berilmagan'}. GITHUB_TOKEN sozlang yoki resetni kuting.)`
      : status === 403
        ? ' (ruxsat yoki GitHub rate limitini tekshiring; GITHUB_TOKEN yordam berishi mumkin)'
        : '';
  // Token bo'lmasa GitHub anonim so'rovlarni soatiga 60 tagacha cheklaydi
  const noTokenHint =
    (status === 403 || status === 401 || status === 404) && !getCredential('GITHUB_TOKEN')
      ? " [GITHUB_TOKEN sozlanmagan: anonim so'rovlar soatiga 60 ta bilan cheklangan — GITHUB_TOKEN yoki GITHUB_TOKEN_FILE ni server env ga qo'shing.]"
      : '';
  return fail('GitHub ' + status + ': ' + msg + hint + noTokenHint);
}
