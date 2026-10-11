import { load } from 'cheerio';
import { fetchWithOptions } from './http-client.js';
import { getCredential } from './credentials.js';
import { log } from './log.js';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}
export interface SearchProviderResult {
  provider: string;
  results: WebSearchResult[];
  failedProviders: Array<{ provider: string; reason: string }>;
}

interface SearchProvider {
  id: string;
  label: string;
  configured(): boolean;
  search(query: string, limit: number): Promise<WebSearchResult[]>;
}

const serperProvider: SearchProvider = {
  id: 'serper',
  label: 'Serper (Google)',
  configured: () => Boolean(getCredential('SERPER_API_KEY')),
  async search(query, limit) {
    const key = getCredential('SERPER_API_KEY');
    if (!key) throw new Error('SERPER_API_KEY missing');
    const response = await fetchWithOptions('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'x-api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ q: query, num: limit }),
      maxBytes: 2_000_000,
      cache: false,
    });
    if (response.status >= 400) throw new Error(`provider HTTP ${response.status}`);
    const payload = JSON.parse(response.text) as {
      organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };
    return (payload.organic ?? []).map((item) => ({
      title: item.title ?? '',
      url: item.link ?? '',
      snippet: item.snippet ?? '',
    }));
  },
};

const braveProvider: SearchProvider = {
  id: 'brave',
  label: 'Brave Search',
  configured: () => Boolean(getCredential('SEARCH_API_KEY')),
  async search(query, limit) {
    const key = getCredential('SEARCH_API_KEY');
    if (!key) throw new Error('SEARCH_API_KEY missing');
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(limit));
    const response = await fetchWithOptions(url.toString(), {
      headers: { 'x-subscription-token': key, accept: 'application/json' },
      maxBytes: 2_000_000,
      cache: false,
    });
    if (response.status >= 400) throw new Error(`provider HTTP ${response.status}`);
    const payload = JSON.parse(response.text) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    return (payload.web?.results ?? []).map((item) => ({
      title: item.title ?? '',
      url: item.url ?? '',
      snippet: item.description ?? '',
    }));
  },
};

const duckDuckGoProvider: SearchProvider = {
  id: 'duckduckgo',
  label: 'DuckDuckGo',
  configured: () => true,
  async search(query, limit) {
    const url = new URL('https://html.duckduckgo.com/html/');
    url.searchParams.set('q', query);
    const response = await fetchWithOptions(url.toString(), { headers: { accept: 'text/html' }, maxBytes: 2_000_000 });
    if (response.status >= 400) throw new Error(`provider HTTP ${response.status}`);
    const $ = load(response.text);
    return $('.result')
      .toArray()
      .slice(0, limit)
      .map((node) => ({
        title: $(node).find('.result__a').first().text().trim(),
        url: $(node).find('.result__a').first().attr('href') ?? '',
        snippet: $(node).find('.result__snippet').first().text().trim(),
      }))
      .filter((item) => item.title && item.url);
  },
};

/** Provider chain allows a credentialed primary engine to fall back to an unauthenticated one. */
export async function searchWeb(query: string, limit = 10): Promise<SearchProviderResult> {
  const providers = [serperProvider, braveProvider, duckDuckGoProvider].filter((provider) => provider.configured());
  const failedProviders: SearchProviderResult['failedProviders'] = [];
  for (const provider of providers) {
    try {
      const results = await provider.search(query, limit);
      return { provider: provider.label + (failedProviders.length ? ' (fallback)' : ''), results, failedProviders };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const reason = /429/.test(message)
        ? 'rate_limited'
        : /HTTP 401|HTTP 403/.test(message)
          ? 'authorization_failed'
          : 'unavailable';
      failedProviders.push({ provider: provider.label, reason });
      log(JSON.stringify({ event: 'search.provider_fallback', provider: provider.id, reason }));
    }
  }
  throw new Error(
    'Barcha web-search providerlari ishlamadi: ' +
      failedProviders.map((item) => `${item.provider}=${item.reason}`).join(', '),
  );
}
