import type { HttpResult } from './http-client.js';

/**
 * Parse an upstream JSON body, or throw an error the caller can act on.
 *
 * ## Why this exists
 *
 * Providers answer throttling and overload with a 200 and a non-JSON body: a bare "OK", an HTML
 * error page, an empty document. Parsing that blindly produced `Unexpected token 'O', "OK..." is
 * not valid JSON`, which tells the caller nothing about what happened — observed live against the
 * GDELT news API, then guarded here.
 *
 * The replacement names the provider, the status, the content type and the start of the body, so the
 * transcript distinguishes "the provider is throttling us" from "the query was wrong" without a
 * second round trip to find out. Every upstream JSON decode in the registry goes through this
 * function; a bare `JSON.parse(response.text)` on a network body is a regression and
 * `verify:static` rejects it.
 */
export function parseUpstreamJson<T>(
  response: Pick<HttpResult, 'status' | 'contentType' | 'text'>,
  provider: string,
): T {
  try {
    return JSON.parse(response.text) as T;
  } catch {
    const preview = response.text.trim().slice(0, 120);
    throw new Error(
      `${provider} JSON emas javob qaytardi (ehtimol cheklov yoki vaqtincha nosozlik). ` +
        `HTTP ${response.status}, content-type: ${response.contentType || 'noma’lum'}` +
        (preview ? `, javob boshi: ${JSON.stringify(preview)}` : ', javob bo‘sh.'),
    );
  }
}

/**
 * Parse an upstream JSON body without throwing, for the error path.
 *
 * A provider that rejects a query usually explains why in the body - Socrata answers a bad column with
 * `{"message":"... No such column: creatd"}`, which is worth far more to a caller than any message
 * composed locally. Reading that body needs a parse, and the rule against a bare `JSON.parse` on a
 * network body exists because a non-JSON body there produces `Unexpected token '<'` instead of
 * anything actionable. This returns `{ ok: false }` in that case, so the caller keeps its text preview
 * and the guard still holds.
 */
export function tryParseUpstreamJson<T>(
  response: Pick<HttpResult, 'status' | 'contentType' | 'text'>,
): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(response.text) as T };
  } catch {
    return { ok: false };
  }
}
