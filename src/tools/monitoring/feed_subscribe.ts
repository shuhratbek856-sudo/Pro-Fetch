import { defineTool } from '../../core/tool.js';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { fetchWithOptions } from '../../core/http-client.js';
import { assertSafeUrl } from '../../core/ssrf-guard.js';
import { cache } from '../../core/cache.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_feed_subscribe — Refresh an RSS or Atom feed and compare it with the previous snapshot
 * Pack: monitoring (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_feed_subscribe',
  description: 'Fetch an RSS or Atom feed and compare entries with the previous stored snapshot',
  category: 'monitoring',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "RSS yoki Atom feed URL'i" },
      id: { type: 'string', description: 'Optional watch identifier; defaults to the URL' },
      limit: { type: 'number', description: 'Saqlanadigan eng ko‘p feed item (1-100)' },
      ttl_ms: { type: 'number', description: 'Snapshot retention millisekundda' },
    },
    required: ['url'],
  },
  async handler(input) {
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    if (!rawUrl) throw new Error('url parametri kerak.');
    const safeUrl = await assertSafeUrl(rawUrl);
    const response = await fetchWithOptions(safeUrl.toString(), {
      cache: false,
      headers: { accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml' },
      timeoutMs: 20_000,
      maxBytes: 2_000_000,
    });
    if (response.status < 200 || response.status >= 300) throw new Error('Feed HTTP ' + response.status);
    const $ = load(response.text, { xmlMode: true });
    const items = $('item,entry').toArray();
    if (!items.length) throw new Error('RSS item yoki Atom entry topilmadi.');
    const limitValue = Number(input.limit ?? 50);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(100, Math.floor(limitValue))) : 50;
    const current = items.slice(0, limit).map((node) => {
      const item = $(node);
      return {
        id:
          item.children('guid,id').first().text().trim() ||
          item.children('link').first().attr('href') ||
          item.children('link').first().text().trim() ||
          item.children('title').first().text().trim(),
        title: item.children('title').first().text().trim(),
        url: item.children('link').first().attr('href') || item.children('link').first().text().trim(),
        date: item.children('pubDate,published,updated').first().text().trim(),
        summary: item.children('description,summary,content').first().text().trim().slice(0, 2000),
      };
    });
    const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : safeUrl.toString();
    const key = 'monitor:feed_subscribe:' + createHash('sha256').update(id).digest('hex').slice(0, 24);
    const previousEntry = cache.get(key);
    let previousItems: Array<{ id?: string }> = [];
    try {
      previousItems = previousEntry ? (JSON.parse(previousEntry.value) as Array<{ id?: string }>) : [];
    } catch {
      previousItems = [];
    }
    const previousIds = new Set(previousItems.map((item) => item.id).filter(Boolean));
    const currentIds = new Set(current.map((item) => item.id).filter(Boolean));
    const added = current.filter((item) => item.id && !previousIds.has(item.id));
    const removed = previousItems.filter((item) => item.id && !currentIds.has(item.id));
    const ttlValue = Number(input.ttl_ms ?? 7 * 86_400_000);
    const ttl = Number.isFinite(ttlValue)
      ? Math.max(60_000, Math.min(90 * 86_400_000, Math.floor(ttlValue)))
      : 7 * 86_400_000;
    cache.put(key, JSON.stringify(current), ttl, { url: safeUrl.toString(), status: response.status });
    return result(
      JSON.stringify(
        {
          id,
          url: safeUrl.toString(),
          provider: 'RSS/Atom feed',
          itemCount: current.length,
          initialized: !previousEntry,
          added,
          removed,
          current,
        },
        null,
        2,
      ),
    );
  },
});
