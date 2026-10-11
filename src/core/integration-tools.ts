import { getCredential } from './credentials.js';
import { cache } from './cache.js';
import { fetchUrl } from './fetcher.js';
import { fetchWithOptions } from './http-client.js';
import { assertSafeUrl } from './ssrf-guard.js';
import { result } from './format.js';
import type { ToolResult } from './types.js';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

type Input = Record<string, unknown>;

function str(input: Input, ...keys: string[]): string {
  for (const key of keys)
    if (typeof input[key] === 'string' && String(input[key]).trim()) return String(input[key]).trim();
  return '';
}

function array(input: Input, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const value = input[key];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return value.split(/\r?\n/).filter(Boolean);
      }
    }
  }
  return [];
}

function objectInput(input: Input, key: string): Record<string, string> {
  const value = input[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, string>;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return {};
}

export function auditScopes(input: Input): ToolResult {
  const granted = new Set(
    array(input, 'granted_scopes', 'granted')
      .map(String)
      .map((scope) => scope.trim())
      .filter(Boolean),
  );
  const required = [
    ...new Set(
      array(input, 'required_scopes', 'needed_scopes', 'required')
        .map(String)
        .map((scope) => scope.trim())
        .filter(Boolean),
    ),
  ];
  const missing = required.filter((scope) => !granted.has(scope));
  return result(
    JSON.stringify(
      { granted: [...granted], required, missing, sufficient: required.length > 0 && missing.length === 0 },
      null,
      2,
    ),
  );
}

export async function testCredentials(input: Input): Promise<ToolResult> {
  const url = str(input, 'url', 'endpoint');
  if (!url) throw new Error('url yoki endpoint parametri kerak.');
  const safe = await assertSafeUrl(url);
  const selectedName = str(input, 'key_name');
  const configuredKeys = cache
    .keys('auth:apikey:')
    .filter((key) => !selectedName || key === 'auth:apikey:' + selectedName)
    .map((key) => ({ name: key.slice('auth:apikey:'.length), token: cache.get(key)?.value ?? '' }))
    .filter((item) => item.token);
  const credentials: Array<{ label: string; authorization: string }> = configuredKeys.map((item) => ({
    label: item.name,
    authorization: 'Bearer ' + item.token,
  }));
  const explicitToken = str(input, 'token', 'bearer_token');
  if (explicitToken) credentials.unshift({ label: 'provided-bearer-token', authorization: 'Bearer ' + explicitToken });
  const username = str(input, 'username');
  const password = str(input, 'password');
  if (username && password)
    credentials.push({
      label: 'provided-basic-auth',
      authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
    });
  if (!credentials.length)
    return result(
      JSON.stringify(
        {
          url: safe.toString(),
          tested: 0,
          authenticated: false,
          message: 'Mos keladigan saqlangan credential yoki explicit token/username+password berilmadi.',
        },
        null,
        2,
      ),
    );
  const method = str(input, 'method').toUpperCase() || 'GET';
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method))
    throw new Error('Credential test faqat GET, HEAD yoki OPTIONS metodlarini qabul qiladi.');
  const outcomes = [];
  for (const credential of credentials.slice(0, 10)) {
    try {
      const response = await fetchWithOptions(safe.toString(), {
        method,
        headers: {
          authorization: credential.authorization,
          accept: 'application/json, text/plain, */*',
          ...objectInput(input, 'headers'),
        },
        timeoutMs: 10_000,
        maxBytes: 1024,
        retries: 0,
      });
      outcomes.push({
        credential: credential.label,
        status: response.status,
        authenticated: response.status >= 200 && response.status < 300,
      });
    } catch (error) {
      outcomes.push({
        credential: credential.label,
        authenticated: false,
        errorCode: error instanceof Error ? error.name : 'Error',
      });
    }
  }
  return result(
    JSON.stringify(
      {
        url: safe.toString(),
        method,
        tested: outcomes.length,
        authenticated: outcomes.some((item) => item.authenticated),
        results: outcomes,
        secretsReturned: false,
      },
      null,
      2,
    ),
  );
}

async function bodyFor(input: Input): Promise<string> {
  const text = str(input, 'content', 'text', 'spec', 'document', 'sample');
  if (text) return text;
  const url = str(input, 'url');
  if (!url) throw new Error('url yoki content parametri kerak');
  const safe = await assertSafeUrl(url);
  const response = await fetchWithOptions(safe.toString());
  if (response.status >= 400) throw new Error('HTTP ' + response.status);
  return response.text;
}

function parseSpec(text: string): Record<string, any> {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, any>;
  } catch {
    /* parse as YAML below */
  }
  const parsed = parseYaml(text) as unknown;
  if (!parsed || typeof parsed !== 'object') throw new Error("OpenAPI/Swagger document object bo'lishi kerak");
  return parsed as Record<string, any>;
}

function inferSchema(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) return { type: 'array', items: value.length ? inferSchema(value[0]) : {} };
  if (typeof value === 'object')
    return {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, inferSchema(child)]),
      ),
      additionalProperties: false,
    };
  return { type: typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value };
}

async function graphql(toolName: string, input: Input): Promise<ToolResult> {
  const url = str(input, 'url');
  if (!url) return result('GraphQL endpoint uchun url parametri kerak.');
  const query =
    str(input, 'query') ||
    `query IntrospectionQuery { __schema { queryType { name } mutationType { name } subscriptionType { name } types { name kind description fields { name type { name kind ofType { name kind } } } } } }`;
  const safe = await assertSafeUrl(url);
  const response = await fetchWithOptions(safe.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (response.status >= 400) throw new Error('GraphQL HTTP ' + response.status + ': ' + response.text.slice(0, 1000));
  const parsed = JSON.parse(response.text) as {
    data?: {
      __schema?: {
        types?: Array<{
          name?: string;
          kind?: string;
          fields?: Array<{ name?: string; type?: { name?: string; kind?: string } }>;
        }>;
      };
    };
    errors?: unknown[];
  };
  const types = parsed.data?.__schema?.types?.filter((type) => !type.name?.startsWith('__')) ?? [];
  if (toolName.endsWith('graphql_introspect'))
    return result(
      JSON.stringify(
        {
          endpoint: safe.toString(),
          types: types.map((type) => ({
            name: type.name,
            kind: type.kind,
            fields: type.fields?.map((field) => ({ name: field.name, type: field.type?.name ?? field.type?.kind })),
          })),
          errors: parsed.errors,
        },
        null,
        2,
      ),
    );
  return result(JSON.stringify({ endpoint: safe.toString(), types, errors: parsed.errors }, null, 2));
}

export async function runIntegrationTool(toolName: string, input: Input): Promise<ToolResult> {
  const name = toolName.replace(/^pro_fetch_/, '');
  if (name === 'api_key_set') {
    const keyName = str(input, 'key_name', 'name');
    const secret = str(input, 'api_key', 'key', 'value');
    if (!keyName || !secret)
      return result(
        "key_name va api_key maydonlarini bering. Kalit process xotirasida saqlanadi va javobda ko'rsatilmaydi.",
      );
    cache.put('auth:apikey:' + keyName, secret, Number(input.ttl_ms ?? 86_400_000));
    return result(`API key '${keyName}' joriy server sessiyasi uchun saqlandi; maxfiy qiymat javobga chiqarilmadi.`);
  }
  if (name === 'credential_test') return testCredentials(input);
  if (name === 'basic_auth_fetch' || name === 'bearer_fetch') {
    const url = str(input, 'url', 'endpoint');
    if (!url) return result('url yoki endpoint parametri kerak.');
    const safe = await assertSafeUrl(url);
    let authorization = '';
    if (name === 'basic_auth_fetch' || str(input, 'scheme').toLowerCase() === 'basic') {
      const username = str(input, 'username');
      const password = str(input, 'password');
      if (!username || !password) return result('Basic auth uchun username va password kerak.');
      authorization = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    } else {
      const tokenName = str(input, 'key_name');
      const token =
        str(input, 'token', 'bearer_token') || (tokenName ? (cache.get('auth:apikey:' + tokenName)?.value ?? '') : '');
      if (!token) return result('Bearer token yoki avval saqlangan key_name kerak.');
      authorization = 'Bearer ' + token;
    }
    const response = await fetchWithOptions(safe.toString(), {
      method: str(input, 'method') || 'GET',
      headers: { authorization, ...objectInput(input, 'headers') },
    });
    return result(
      JSON.stringify(
        {
          url: safe.toString(),
          status: response.status,
          contentType: response.contentType,
          body: response.text.slice(0, Number(input.max_chars ?? 8000)),
        },
        null,
        2,
      ),
    );
  }
  if (name === 'cookie_jar_manage') {
    const id = str(input, 'session_id', 'jar_id') || 'default';
    const key = 'auth:cookies:' + id;
    const jar = objectInput({ value: cache.get(key)?.value }, 'value');
    const action = str(input, 'action') || 'list';
    const cookieName = str(input, 'name', 'cookie_name');
    if (action === 'set' && cookieName) jar[cookieName] = str(input, 'value');
    else if (action === 'delete') delete jar[cookieName];
    else if (action === 'clear') for (const name of Object.keys(jar)) delete jar[name];
    if (action !== 'list' || !cache.get(key)) cache.put(key, JSON.stringify(jar), Number(input.ttl_ms ?? 86_400_000));
    return result(JSON.stringify({ session_id: id, action, cookies: Object.keys(jar) }, null, 2));
  }
  if (name === 'github_auth_status') {
    const token = getCredential('GITHUB_TOKEN');
    if (!token) return result('GITHUB_TOKEN sozlanmagan. GitHub API unauthenticated rejimda ishlaydi.');
    const response = await fetchWithOptions('https://api.github.com/user', {
      headers: { authorization: 'Bearer ' + token, accept: 'application/vnd.github+json' },
    });
    const scopes = response.headers['x-oauth-scopes'] ?? '';
    let user = '';
    try {
      user = String((JSON.parse(response.text) as { login?: string }).login ?? '');
    } catch {
      /* no user response */
    }
    return result(
      JSON.stringify(
        {
          status: response.status,
          authenticated: response.status === 200,
          user,
          scopes: scopes
            .split(',')
            .map((scope) => scope.trim())
            .filter(Boolean),
        },
        null,
        2,
      ),
    );
  }
  if (name === 'oauth_device_flow') {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) throw new Error("OAuth Device Flow uchun GITHUB_CLIENT_ID environment o'zgaruvchisi kerak.");
    const response = await fetchWithOptions('https://github.com/login/device/code', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, scope: str(input, 'scope') || 'read:user repo' }),
    });
    if (response.status >= 400) throw new Error('GitHub device flow HTTP ' + response.status);
    return result(response.text);
  }
  if (name === 'scopes_audit') {
    return auditScopes(input);
  }
  if (name === 'session_save' || name === 'session_restore' || name === 'session_list' || name === 'session_revoke') {
    const sessionId = str(input, 'session_id', 'id');
    if (name === 'session_save') {
      if (!sessionId) return result('session_id kerak.');
      const value = input.session ?? input.data ?? input.value ?? {};
      cache.put('auth:session:' + sessionId, JSON.stringify(value), Number(input.ttl_ms ?? 86_400_000));
      return result(`Session '${sessionId}' process xotirasiga saqlandi.`);
    }
    if (name === 'session_list')
      return result(
        JSON.stringify(
          cache.keys('auth:session:').map((key) => key.slice('auth:session:'.length)),
          null,
          2,
        ),
      );
    if (!sessionId) return result('session_id kerak.');
    if (name === 'session_revoke')
      return result(JSON.stringify({ session_id: sessionId, revoked: cache.delete('auth:session:' + sessionId) > 0 }));
    const saved = cache.get('auth:session:' + sessionId);
    return result(saved?.value ?? `Session '${sessionId}' topilmadi yoki muddati tugagan.`);
  }
  if (name === 'graphql_introspect' || name === 'graphql_schema_read') return graphql(toolName, input);
  if (name === 'json_schema_infer') {
    const source = str(input, 'json', 'sample', 'text', 'content');
    if (!source) return result('Namuna JSON yoki sample parametri kerak.');
    return result(JSON.stringify(inferSchema(JSON.parse(source)), null, 2));
  }
  if (name.startsWith('openapi_') || name === 'swagger_validate' || name === 'api_diff') {
    if (name === 'api_diff') {
      const firstUrl = str(input, 'base_url', 'url');
      const secondUrl = str(input, 'head_url', 'url2');
      if (!firstUrl || !secondUrl) return result('base_url va head_url kerak.');
      const [leftText, rightText] = await Promise.all([bodyFor({ url: firstUrl }), bodyFor({ url: secondUrl })]);
      const left = parseSpec(leftText);
      const right = parseSpec(rightText);
      const leftPaths = new Set(Object.keys(left.paths ?? {}));
      const rightPaths = new Set(Object.keys(right.paths ?? {}));
      return result(
        JSON.stringify(
          {
            added: [...rightPaths].filter((item) => !leftPaths.has(item)),
            removed: [...leftPaths].filter((item) => !rightPaths.has(item)),
            changedVersion:
              left.info?.version !== right.info?.version ? { from: left.info?.version, to: right.info?.version } : null,
          },
          null,
          2,
        ),
      );
    }
    const text = await bodyFor(input);
    const spec = parseSpec(text);
    const paths =
      spec.paths && typeof spec.paths === 'object' ? (spec.paths as Record<string, Record<string, unknown>>) : {};
    const endpoints = Object.entries(paths).flatMap(([route, methods]) =>
      Object.entries(methods)
        .filter(([method]) =>
          ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(method.toLowerCase()),
        )
        .map(([method, operation]) => ({ method: method.toUpperCase(), path: route, ...(operation as object) })),
    );
    if (name === 'openapi_endpoints_list') return result(JSON.stringify(endpoints, null, 2));
    if (name === 'swagger_validate')
      return result(
        JSON.stringify(
          {
            valid: Boolean(spec.openapi || spec.swagger),
            version: spec.openapi ?? spec.swagger ?? null,
            title: spec.info?.title ?? null,
            paths: Object.keys(paths).length,
            endpointCount: endpoints.length,
            errors: spec.info ? [] : ["info.title/version yo'q"],
          },
          null,
          2,
        ),
      );
    if (name === 'openapi_try') {
      const base = str(input, 'base_url', 'server_url');
      const route = str(input, 'path');
      if (!base || !route) return result('base_url va path kerak.');
      const target = await assertSafeUrl(new URL(route, base).toString());
      const method = str(input, 'method').toUpperCase() || 'GET';
      const response = await fetchWithOptions(target.toString(), {
        method,
        headers: objectInput(input, 'headers'),
        body: str(input, 'body') || undefined,
      });
      return result(
        JSON.stringify(
          { url: target.toString(), method, status: response.status, body: response.text.slice(0, 10000) },
          null,
          2,
        ),
      );
    }
    return result(JSON.stringify(spec, null, 2));
  }
  if (name === 'wsdl_parse') {
    const text = await bodyFor(input);
    const operations = [...text.matchAll(/<(?:\w+:)?operation\b[^>]*\bname=["']([^"']+)["']/g)].map(
      (match) => match[1],
    );
    const services = [...text.matchAll(/<(?:\w+:)?service\b[^>]*\bname=["']([^"']+)["']/g)].map((match) => match[1]);
    return result(JSON.stringify({ services, operations: [...new Set(operations)] }, null, 2));
  }
  if (name === 'api_rate_limit_probe') {
    const url = str(input, 'url');
    if (!url) return result('url parametri kerak.');
    const count = Math.max(1, Math.min(Number(input.count ?? input.requests ?? 3), 10));
    const statuses: number[] = [];
    for (let index = 0; index < count; index++)
      statuses.push((await fetchWithOptions(url, { retries: 0, timeoutMs: Number(input.timeout_ms ?? 10000) })).status);
    return result(
      JSON.stringify(
        { url, requests: count, statuses, rateLimited: statuses.some((status) => status === 429) },
        null,
        2,
      ),
    );
  }
  if (name === 'api_mock_respond') {
    const status = Number(input.status ?? 200);
    let body = input.body ?? input.response ?? {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        /* keep as text */
      }
    }
    return result(JSON.stringify({ mock: true, status, headers: objectInput(input, 'headers'), body }, null, 2));
  }
  if (
    name === 'locale_detect' ||
    name === 'i18n_strings_extract' ||
    name === 'mixed_lang_split' ||
    name === 'rtl_normalize' ||
    name === 'script_convert' ||
    name === 'transliterate'
  ) {
    const text = str(input, 'text', 'content', 'html');
    if (!text) return result('text yoki content parametri kerak.');
    if (name === 'locale_detect') {
      const script = /[\u0400-\u04ff]/.test(text)
        ? 'Cyrillic'
        : /[\u0600-\u06ff]/.test(text)
          ? 'Arabic'
          : /[\u4e00-\u9fff]/.test(text)
            ? 'Han'
            : 'Latin';
      const lower = text.toLowerCase();
      const language = /\b(the|and|with|this|that)\b/.test(lower)
        ? 'en'
        : /\b(va|bu|uchun|bilan|emas)\b/.test(lower)
          ? 'uz'
          : /\b(и|это|как|для|что)\b/.test(lower)
            ? 'ru'
            : 'und';
      return result(
        JSON.stringify({ language, script, confidence: language === 'und' ? 'low' : 'heuristic' }, null, 2),
      );
    }
    if (name === 'rtl_normalize')
      return result(
        text
          .normalize('NFC')
          .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
          .replace(/[\u064b-\u065f\u0670]/g, ''),
      );
    if (name === 'i18n_strings_extract') {
      const strings = [...text.matchAll(/["']([^"'\r\n]{3,})["']/g)]
        .map((match) => match[1])
        .filter((value) => /[\p{L} ]/u.test(value));
      return result(JSON.stringify([...new Set(strings)], null, 2));
    }
    if (name === 'mixed_lang_split')
      return result(
        text
          .split(/(?<=[.!?؟])\s+/)
          .map(
            (sentence) =>
              `${/[\u0400-\u04ff]/.test(sentence) ? 'ru' : /[\u0600-\u06ff]/.test(sentence) ? 'ar' : 'latin/unknown'}\t${sentence}`,
          )
          .join('\n'),
      );
    const to = str(input, 'to_script', 'target_script').toLowerCase();
    return result(convertScript(text, to === 'cyrillic' || to === 'cyrl' ? 'cyrillic' : 'latin'));
  }
  if (name === 'translate_text' || name === 'translate_page') {
    const from = str(input, 'source_lang', 'from_lang') || 'en';
    const to = str(input, 'target_lang', 'to_lang');
    if (!to) return result('target_lang kerak (masalan: en, uz, ru).');
    const text =
      name === 'translate_page' ? (await fetchUrl(str(input, 'url'))).markdown : str(input, 'text', 'content');
    if (!text) return result('Tarjima uchun text yoki url kerak.');
    const chunks = text.match(/.{1,450}/gs) ?? [];
    const translated: string[] = [];
    for (const chunk of chunks.slice(0, 20)) {
      const url =
        'https://api.mymemory.translated.net/get?q=' +
        encodeURIComponent(chunk) +
        '&langpair=' +
        encodeURIComponent(from + '|' + to);
      const response = await fetchWithOptions(url, { headers: { accept: 'application/json' } });
      if (response.status >= 400) throw new Error('Translation API HTTP ' + response.status);
      const data = JSON.parse(response.text) as { responseData?: { translatedText?: string }; responseStatus?: number };
      if (data.responseStatus && data.responseStatus >= 400)
        throw new Error('Translation API status ' + data.responseStatus);
      translated.push(data.responseData?.translatedText ?? chunk);
    }
    return result(translated.join(''));
  }
  return result('Integration operation not recognized: ' + toolName);
}

function convertScript(text: string, target: 'latin' | 'cyrillic'): string {
  const latinPairs: Record<string, string> = {
    sh: 'ш',
    ch: 'ч',
    yo: 'ё',
    yu: 'ю',
    ya: 'я',
    oʻ: 'ў',
    gʻ: 'ғ',
    zh: 'ж',
    ts: 'ц',
    kh: 'х',
  };
  const cyrillicToLatin: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    ғ: "g'",
    д: 'd',
    е: 'e',
    ё: 'yo',
    ж: 'j',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    ў: "o'",
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'x',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'shch',
    ъ: '',
    ы: 'i',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  };
  if (target === 'latin')
    return text.replace(/[А-ЯЁа-яёЎўҒғҚқҲҳ]/g, (char) => {
      const lower = char.toLowerCase();
      const translated = cyrillicToLatin[lower] ?? (lower === 'қ' ? 'q' : lower === 'ҳ' ? 'h' : char);
      return char !== lower ? translated.charAt(0).toUpperCase() + translated.slice(1) : translated;
    });
  let output = text;
  for (const [latin, cyrillic] of Object.entries(latinPairs).sort((left, right) => right[0].length - left[0].length))
    output = output.replace(new RegExp(latin, 'gi'), (match) =>
      match === match.toUpperCase() ? cyrillic.toUpperCase() : cyrillic,
    );
  const latinToCyrillic: Record<string, string> = {
    a: 'а',
    b: 'б',
    d: 'д',
    e: 'э',
    f: 'ф',
    g: 'г',
    h: 'ҳ',
    i: 'и',
    j: 'ж',
    k: 'к',
    l: 'л',
    m: 'м',
    n: 'н',
    o: 'о',
    p: 'п',
    q: 'қ',
    r: 'р',
    s: 'с',
    t: 'т',
    u: 'у',
    v: 'в',
    x: 'х',
    y: 'й',
    z: 'з',
    c: 'ц',
  };
  return output.replace(/[a-z]/gi, (char) => {
    const translated = latinToCyrillic[char.toLowerCase()] ?? char;
    return char !== char.toLowerCase() ? translated.toUpperCase() : translated;
  });
}
