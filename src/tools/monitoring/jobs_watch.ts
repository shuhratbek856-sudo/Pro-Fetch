import { defineTool } from '../../core/tool.js';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { fetchWithOptions } from '../../core/http-client.js';
import { assertSafeUrl } from '../../core/ssrf-guard.js';
import { cache } from '../../core/cache.js';
import { result } from '../../core/format.js';

/**
 * pro_fetch_jobs_watch — Watch a jobs page for new postings
 * Pack: monitoring (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_jobs_watch',
  description: 'Fetch a jobs page and report postings not present in its previous snapshot',
  category: 'monitoring',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: "Ish e'lonlari sahifasi URL'i" },
      selector: { type: 'string', description: 'Job card CSS selector (optional)' },
      id: { type: 'string', description: 'Watch ID; default URL' },
      limit: { type: 'number', description: 'Eng ko‘p job card (1-100)' },
      ttl_ms: { type: 'number', description: 'Snapshot saqlash muddati' },
    },
    required: ['url'],
  },
  async handler(input) {
    const rawUrl = typeof input.url === 'string' ? input.url.trim() : '';
    if (!rawUrl) throw new Error('url parametri kerak.');
    const url = await assertSafeUrl(rawUrl);
    const response = await fetchWithOptions(url.toString(), { cache: false, timeoutMs: 20_000, maxBytes: 2_000_000 });
    if (response.status < 200 || response.status >= 300) throw new Error('Jobs page HTTP ' + response.status);
    const $ = load(response.text);
    $('script,style,noscript,nav,footer,header').remove();
    const selector = typeof input.selector === 'string' ? input.selector.trim() : '';
    const cards = selector ? $(selector).toArray() : $('[data-job-id],article.job,li.job,article').toArray();
    const limitValue = Number(input.limit ?? 50);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(100, Math.floor(limitValue))) : 50;
    const jobs = cards
      .slice(0, limit)
      .map((node) => {
        const card = $(node);
        const anchor = card.find('a[href]').first();
        const href = anchor.attr('href') ?? '';
        return {
          id: card.attr('data-job-id') ?? href ?? card.text().trim(),
          title: card.find('h1,h2,h3,[class*=title]').first().text().trim() || anchor.text().trim(),
          company: card.find('[class*=company]').first().text().trim(),
          url: href ? new URL(href, url).toString() : '',
          excerpt: card.text().replace(/\s+/g, ' ').trim().slice(0, 500),
        };
      })
      .filter((job) => job.title || job.id);
    const id = typeof input.id === 'string' && input.id.trim() ? input.id.trim() : url.toString();
    const key = 'monitor:jobs_watch:' + createHash('sha256').update(id).digest('hex').slice(0, 24);
    const previousEntry = cache.get(key);
    let previous: Array<{ id?: string }> = [];
    try {
      previous = previousEntry ? (JSON.parse(previousEntry.value) as Array<{ id?: string }>) : [];
    } catch {
      previous = [];
    }
    const oldIds = new Set(previous.map((job) => job.id));
    const added = jobs.filter((job) => !oldIds.has(job.id));
    const ttlValue = Number(input.ttl_ms ?? 7 * 86_400_000);
    const ttl = Number.isFinite(ttlValue)
      ? Math.max(60_000, Math.min(90 * 86_400_000, Math.floor(ttlValue)))
      : 7 * 86_400_000;
    cache.put(key, JSON.stringify(jobs), ttl, { url: url.toString(), status: response.status });
    return result(
      JSON.stringify(
        { id, url: url.toString(), initialized: !previousEntry, checked: jobs.length, added, jobs },
        null,
        2,
      ),
    );
  },
});
