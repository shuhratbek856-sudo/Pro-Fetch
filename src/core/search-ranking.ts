export interface SearchItem {
  title?: string;
  url?: string;
  snippet?: string;
}

export function canonicalSearchUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|dclid|yclid|mc_cid|mc_eid|ref_src|ref_url|vero_id|igshid)$/i.test(key))
        url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return raw.trim();
  }
}

export function rankAndDedupeSearchResults<T extends SearchItem>(query: string, items: T[], limit = 10): T[] {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1);
  const seen = new Set<string>();
  const ranked = items
    .map((item, index) => {
      const url = canonicalSearchUrl(String(item.url ?? ''));
      let score = 0;
      const title = String(item.title ?? '').toLowerCase();
      const snippet = String(item.snippet ?? '').toLowerCase();
      const haystack = `${title} ${snippet} ${url.toLowerCase()}`;
      for (const term of terms) {
        if (title.includes(term)) score += 4;
        if (snippet.includes(term)) score += 2;
        if (url.toLowerCase().includes(term)) score += 1;
      }
      if (title.trim()) score += 0.25;
      return { item: { ...item, url } as T, index, score, key: url.toLowerCase() };
    })
    .filter((entry) => entry.key && /^https?:\/\//i.test(entry.key))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const output: T[] = [];
  for (const entry of ranked) {
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    output.push(entry.item);
    if (output.length >= Math.max(1, Math.min(50, Math.floor(limit)))) break;
  }
  return output;
}
