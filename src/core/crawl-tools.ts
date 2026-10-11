import { load } from 'cheerio';
import { cache } from './cache.js';
import { fetchWithOptions } from './http-client.js';
import { assertSafeUrl } from './ssrf-guard.js';
import { result } from './format.js';
import type { ToolResult } from './types.js';
import { getDomain } from 'tldts';

type Input = Record<string, unknown>;
type PageRecord = {
  url: string;
  status?: number;
  title?: string;
  text?: string;
  depth?: number;
  links?: string[];
  [key: string]: unknown;
};
type CrawlConfig = {
  maxDepth?: number;
  maxPages?: number;
  scope?: 'same-host' | 'same-domain' | 'all';
  includeSubdomains?: boolean;
  delayMs?: number;
  concurrency?: number;
};

function str(input: Input, ...keys: string[]): string {
  for (const key of keys)
    if (typeof input[key] === 'string' && String(input[key]).trim()) return String(input[key]).trim();
  return '';
}

function arr(input: Input, ...keys: string[]): unknown[] {
  for (const key of keys) {
    const item = input[key];
    if (Array.isArray(item)) return item;
    if (typeof item === 'string' && item.trim()) {
      try {
        const parsed = JSON.parse(item) as unknown;
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return item.split(/\r?\n/).filter(Boolean);
      }
    }
  }
  return [];
}

async function page(url: string): Promise<{ url: string; status: number; text: string; contentType: string }> {
  const safe = await assertSafeUrl(url);
  const response = await fetchWithOptions(safe.toString());
  return { url: safe.toString(), status: response.status, text: response.text, contentType: response.contentType };
}

function canonicalCrawlUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|fbclid|gclid|dclid|yclid|mc_cid|mc_eid|ref_src|ref_url)$/i.test(key))
        url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function pageLinks(html: string, base: string): Array<{ url: string; text: string; rel: string }> {
  const $ = load(html);
  return $('a[href]')
    .toArray()
    .map((node) => {
      const anchor = $(node);
      let url = '';
      try {
        url = canonicalCrawlUrl(new URL(anchor.attr('href') ?? '', base).toString());
      } catch {
        /* malformed href */
      }
      return { url, text: anchor.text().replace(/\s+/g, ' ').trim(), rel: anchor.attr('rel') ?? '' };
    })
    .filter((item) => item.url.startsWith('http://') || item.url.startsWith('https://'));
}

interface RobotsPolicy {
  rules: Array<{ kind: 'allow' | 'disallow'; path: string }>;
  crawlDelayMs: number;
}
async function getRobotsPolicy(origin: string): Promise<RobotsPolicy> {
  const key = 'crawl-robots:' + new URL(origin).host.toLowerCase();
  const cached = cache.get(key);
  if (cached) {
    try {
      return JSON.parse(cached.value) as RobotsPolicy;
    } catch {
      cache.delete(key);
    }
  }
  let policy: RobotsPolicy = { rules: [], crawlDelayMs: 0 };
  try {
    const response = await fetchWithOptions(new URL('/robots.txt', origin).toString(), {
      timeoutMs: 5_000,
      maxBytes: 256_000,
      retries: 1,
    });
    if (response.status >= 200 && response.status < 300) {
      const groups: Array<{ agents: string[]; rules: RobotsPolicy['rules']; crawlDelayMs: number; hasRule: boolean }> =
        [];
      let group = { agents: [] as string[], rules: [] as RobotsPolicy['rules'], crawlDelayMs: 0, hasRule: false };
      const push = () => {
        if (group.agents.length) groups.push(group);
        group = { agents: [], rules: [], crawlDelayMs: 0, hasRule: false };
      };
      for (const rawLine of response.text.split(/\r?\n/)) {
        const line = rawLine.split('#', 1)[0].trim();
        if (!line) continue;
        const colon = line.indexOf(':');
        if (colon < 0) continue;
        const name = line.slice(0, colon).trim().toLowerCase();
        const value = line.slice(colon + 1).trim();
        if (name === 'user-agent') {
          if (group.hasRule) push();
          group.agents.push(value.toLowerCase());
        } else if (name === 'allow' || name === 'disallow') {
          group.hasRule = true;
          if (value) group.rules.push({ kind: name, path: value });
        } else if (name === 'crawl-delay') {
          const seconds = Number(value);
          if (Number.isFinite(seconds) && seconds >= 0) group.crawlDelayMs = Math.min(10_000, seconds * 1000);
          group.hasRule = true;
        }
      }
      push();
      const specific = groups.filter((item) =>
        item.agents.some((agent) => agent === 'pro-fetch' || agent === 'pro-fetch-mcp'),
      );
      const selected = specific.length ? specific : groups.filter((item) => item.agents.includes('*'));
      policy = {
        rules: selected.flatMap((item) => item.rules),
        crawlDelayMs: Math.max(0, ...selected.map((item) => item.crawlDelayMs)),
      };
    }
  } catch {
    /* robots.txt network failure fails open; SSRF rules still apply */
  }
  cache.put(key, JSON.stringify(policy), 60 * 60_000, { type: 'robots-policy' });
  return policy;
}

function robotsAllows(url: URL, policy: RobotsPolicy): boolean {
  let best: { length: number; kind: 'allow' | 'disallow' } | undefined;
  for (const rule of policy.rules) {
    const source = rule.path;
    const exactEnd = source.endsWith('$');
    const body = exactEnd ? source.slice(0, -1) : source;
    const pattern = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    let matches = false;
    try {
      matches = new RegExp('^' + pattern + (exactEnd ? '$' : '')).test(url.pathname + url.search);
    } catch {
      matches = (url.pathname + url.search).startsWith(body);
    }
    if (!matches) continue;
    if (!best || source.length > best.length || (source.length === best.length && rule.kind === 'allow'))
      best = { length: source.length, kind: rule.kind };
  }
  return best?.kind !== 'disallow';
}

function records(input: Input): PageRecord[] {
  return arr(input, 'pages', 'results', 'items', 'urls').map((item) =>
    typeof item === 'string'
      ? { url: item }
      : item && typeof item === 'object'
        ? (item as PageRecord)
        : { url: String(item) },
  );
}

async function crawl(startUrl: string, maxPages: number, maxDepth: number): Promise<PageRecord[]> {
  const root = await assertSafeUrl(canonicalCrawlUrl(startUrl));
  const queue: Array<{ url: string; depth: number }> = [{ url: root.toString(), depth: 0 }];
  const visited = new Set<string>();
  const pages: PageRecord[] = [];
  while (queue.length && pages.length < maxPages) {
    const next = queue.shift()!;
    if (visited.has(next.url) || next.depth > maxDepth) continue;
    visited.add(next.url);
    try {
      const target = new URL(next.url);
      const robots = await getRobotsPolicy(target.origin);
      if (!robotsAllows(target, robots)) {
        pages.push({ url: next.url, status: 0, error: 'Blocked by robots.txt', depth: next.depth });
        continue;
      }
      const response = await page(next.url);
      const $ = load(response.text);
      const title = $('title').first().text().trim();
      $('script,style,noscript,svg').remove();
      const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 20_000);
      pages.push({ url: response.url, status: response.status, title, text, depth: next.depth });
      if (next.depth < maxDepth && response.contentType.includes('html')) {
        for (const link of pageLinks(response.text, response.url)) {
          const target = new URL(link.url);
          if (target.hostname === root.hostname && !visited.has(target.toString()))
            queue.push({ url: target.toString(), depth: next.depth + 1 });
        }
      }
    } catch (error) {
      pages.push({
        url: next.url,
        status: 0,
        error: error instanceof Error ? error.message : String(error),
        depth: next.depth,
      });
    }
  }
  return pages;
}

function configKey(hostname: string): string {
  return 'crawl-config:' + hostname.toLowerCase();
}

function readConfig(hostname: string): CrawlConfig {
  try {
    return JSON.parse(cache.get(configKey(hostname))?.value ?? '{}') as CrawlConfig;
  } catch {
    return {};
  }
}

function updateConfig(hostname: string, update: CrawlConfig): CrawlConfig {
  const config = { ...readConfig(hostname), ...update };
  cache.put(configKey(hostname), JSON.stringify(config), 86_400_000);
  return config;
}

export function setCrawlDomainScope(input: Input): ToolResult {
  const url = str(input, 'url', 'start_url');
  if (!url) throw new Error('url parametri kerak; sozlama URL hostiga bog‘lanadi.');
  const hostname = new URL(url).hostname;
  const scope = str(input, 'scope') || 'same-host';
  if (!['same-host', 'same-domain', 'all'].includes(scope))
    throw new Error('scope same-host, same-domain yoki all bo‘lishi kerak.');
  const config = updateConfig(hostname, {
    scope: scope as CrawlConfig['scope'],
    includeSubdomains: Boolean(input.include_subdomains),
  });
  return result(
    JSON.stringify({ hostname, saved: true, appliesTo: 'crawl_site calls using this start host', config }, null, 2),
  );
}

export function setCrawlDepth(input: Input): ToolResult {
  const url = str(input, 'url', 'start_url');
  if (!url) throw new Error('url parametri kerak; sozlama URL hostiga bog‘lanadi.');
  const hostname = new URL(url).hostname;
  const config = updateConfig(hostname, {
    maxDepth: boundedNumber(input.max_depth ?? input.depth, 2, 0, 10),
    maxPages: boundedNumber(input.max_pages, 20, 1, 50),
  });
  return result(
    JSON.stringify({ hostname, saved: true, appliesTo: 'crawl_site calls using this start host', config }, null, 2),
  );
}

export function setCrawlSpeed(input: Input): ToolResult {
  const url = str(input, 'url', 'start_url');
  if (!url) throw new Error('url parametri kerak; sozlama URL hostiga bog‘lanadi.');
  const hostname = new URL(url).hostname;
  const config = updateConfig(hostname, {
    delayMs: boundedNumber(input.delay_ms, 500, 0, 10_000),
    concurrency: boundedNumber(input.concurrency, 2, 1, 10),
  });
  return result(
    JSON.stringify({ hostname, saved: true, appliesTo: 'crawl_site calls using this start host', config }, null, 2),
  );
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(Math.floor(parsed), max)) : fallback;
}

export function allowedCrawlHost(hostname: string, rootHostname: string, config: CrawlConfig): boolean {
  if (config.scope === 'all') return true;
  if (hostname === rootHostname) return true;
  if (config.scope === 'same-domain') {
    const rootDomain = getDomain(rootHostname);
    const targetDomain = getDomain(hostname);
    return Boolean(rootDomain && targetDomain && rootDomain === targetDomain);
  }
  return Boolean(config.includeSubdomains && hostname.endsWith('.' + rootHostname));
}

async function waitForJob(jobId: string): Promise<'running' | 'stopped'> {
  const stateKey = 'crawl-job:' + jobId + ':state';
  for (;;) {
    const state = cache.get(stateKey)?.value;
    if (state === 'stopped') return 'stopped';
    if (state !== 'paused') return 'running';
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

const hostDelayTails = new Map<string, Promise<void>>();
const hostLastStart = new Map<string, number>();

async function respectHostDelay(host: string, delayMs: number): Promise<void> {
  if (delayMs <= 0) return;
  const previous = hostDelayTails.get(host) ?? Promise.resolve();
  let unlock!: () => void;
  const turn = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const tail = previous.then(() => turn);
  hostDelayTails.set(host, tail);
  await previous;
  try {
    const wait = Math.max(0, (hostLastStart.get(host) ?? 0) + delayMs - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    hostLastStart.set(host, Date.now());
  } finally {
    unlock();
    if (hostDelayTails.get(host) === tail) hostDelayTails.delete(host);
  }
}

async function crawlConfigured(
  startUrl: string,
  maxPages: number,
  maxDepth: number,
  config: CrawlConfig,
  jobId: string,
): Promise<{ pages: PageRecord[]; stopped: boolean }> {
  const root = await assertSafeUrl(canonicalCrawlUrl(startUrl));
  const queue: Array<{ url: string; depth: number }> = [{ url: root.toString(), depth: 0 }];
  const visited = new Set<string>();
  const pages: PageRecord[] = [];
  const concurrency = boundedNumber(config.concurrency, 2, 1, 10);
  while (queue.length && pages.length < maxPages) {
    if ((await waitForJob(jobId)) === 'stopped') return { pages, stopped: true };
    const batch: Array<{ url: string; depth: number }> = [];
    while (queue.length && batch.length < concurrency && pages.length + batch.length < maxPages) {
      const next = queue.shift()!;
      if (visited.has(next.url) || next.depth > maxDepth) continue;
      visited.add(next.url);
      batch.push(next);
    }
    if (!batch.length) continue;
    const fetched = await Promise.all(
      batch.map(async (next): Promise<{ record: PageRecord; links: string[] }> => {
        try {
          const targetUrl = new URL(next.url);
          const robots = await getRobotsPolicy(targetUrl.origin);
          if (!robotsAllows(targetUrl, robots))
            return {
              record: { url: next.url, status: 0, error: 'Blocked by robots.txt', depth: next.depth },
              links: [],
            };
          const delayMs = Math.max(Number(config.delayMs ?? 0), robots.crawlDelayMs);
          await respectHostDelay(targetUrl.host.toLowerCase(), delayMs);
          const response = await page(next.url);
          const $ = load(response.text);
          const title = $('title').first().text().trim();
          $('script,style,noscript,svg').remove();
          const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 20_000);
          const links =
            next.depth < maxDepth && response.contentType.includes('html')
              ? pageLinks(response.text, response.url)
                  .map((link) => link.url)
                  .filter((link) => {
                    try {
                      return allowedCrawlHost(new URL(link).hostname, root.hostname, config);
                    } catch {
                      return false;
                    }
                  })
              : [];
          return {
            record: {
              url: response.url,
              status: response.status,
              title,
              text,
              depth: next.depth,
              links: [...new Set(links)],
            },
            links,
          };
        } catch (error) {
          return {
            record: {
              url: next.url,
              status: 0,
              error: error instanceof Error ? error.message : String(error),
              depth: next.depth,
            },
            links: [],
          };
        }
      }),
    );
    for (let index = 0; index < fetched.length; index++) {
      pages.push(fetched[index].record);
      for (const link of fetched[index].links) {
        const target = new URL(link);
        if (!visited.has(target.toString())) queue.push({ url: target.toString(), depth: batch[index].depth + 1 });
      }
    }
  }
  return { pages, stopped: false };
}

export async function crawlSite(input: Input): Promise<ToolResult> {
  const url = str(input, 'url', 'start_url');
  if (!url) throw new Error('url parametri kerak.');
  const root = await assertSafeUrl(url);
  const saved = readConfig(root.hostname);
  const config = {
    ...saved,
    maxPages: boundedNumber(input.max_pages, saved.maxPages ?? 10, 1, 50),
    maxDepth: boundedNumber(input.max_depth, saved.maxDepth ?? 2, 0, 10),
  };
  const jobId = str(input, 'job_id') || 'default';
  cache.put('crawl-job:' + jobId + ':state', 'running', 86_400_000);
  const run = await crawlConfigured(root.toString(), config.maxPages, config.maxDepth, config, jobId);
  return result(JSON.stringify({ jobId, options: config, stopped: run.stopped, pages: run.pages }, null, 2));
}

export function controlCrawlJob(input: Input): ToolResult {
  const jobId = str(input, 'job_id', 'id') || 'default';
  const action = str(input, 'action') || 'list';
  if (!['pause', 'resume', 'stop', 'list'].includes(action))
    throw new Error('action pause, resume, stop yoki list bo‘lishi kerak.');
  if (action !== 'list')
    cache.put(
      'crawl-job:' + jobId + ':state',
      action === 'pause' ? 'paused' : action === 'stop' ? 'stopped' : 'running',
      86_400_000,
    );
  return result(
    JSON.stringify({ jobId, action, state: cache.get('crawl-job:' + jobId + ':state')?.value ?? 'running' }, null, 2),
  );
}

function metadata(html: string, url: string): Record<string, unknown> {
  const $ = load(html);
  const meta: Record<string, string> = {};
  $('meta[name],meta[property]').each((_index, element) => {
    const node = $(element);
    const key = node.attr('name') ?? node.attr('property') ?? '';
    const content = node.attr('content');
    if (key && content) meta[key] = content;
  });
  return {
    url,
    title: $('title').first().text().trim(),
    canonical: $('link[rel="canonical"]').attr('href') ?? '',
    description: meta.description ?? meta['og:description'] ?? '',
    metadata: meta,
  };
}

function getQueue(key: string): string[] {
  const saved = cache.get(key);
  if (!saved) return [];
  try {
    return JSON.parse(saved.value) as string[];
  } catch {
    return [];
  }
}

export async function runCrawlTool(toolName: string, input: Input): Promise<ToolResult> {
  const name = toolName.replace(/^pro_fetch_/, '');
  const url = str(input, 'url', 'start_url');
  if (name === 'crawl_site' || name === 'spa_render') {
    if (!url) return result('url parametri kerak.');
    if (name === 'spa_render') {
      try {
        const { chromium } = await import('playwright');
        const browser = await chromium.launch({ headless: true });
        try {
          const page = await browser.newPage();
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Number(input.timeout_ms ?? 20000) });
          return result((await page.locator('body').innerText()).slice(0, 20000));
        } finally {
          await browser.close();
        }
      } catch (error) {
        throw new Error(
          "SPA render uchun Playwright o'rnatilganini tekshiring: " +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }
    return crawlSite(input);
  }
  if (name === 'extract_links') {
    if (!url) return result('url parametri kerak.');
    const fetched = await page(url);
    return result(JSON.stringify(pageLinks(fetched.text, fetched.url), null, 2));
  }
  if (
    name === 'extract_metadata' ||
    name === 'canonical_url' ||
    name === 'extract_pagination' ||
    name === 'extract_tables' ||
    name === 'page_weight'
  ) {
    if (!url) return result('url parametri kerak.');
    const fetched = await page(url);
    const $ = load(fetched.text);
    if (name === 'canonical_url') return result($('link[rel="canonical"]').attr('href') ?? fetched.url);
    if (name === 'extract_metadata') return result(JSON.stringify(metadata(fetched.text, fetched.url), null, 2));
    if (name === 'extract_pagination') {
      const next = $('a[rel="next"],link[rel="next"]');
      return result(
        next
          .toArray()
          .map((node) => {
            try {
              return new URL($(node).attr('href') ?? '', fetched.url).toString();
            } catch {
              return '';
            }
          })
          .filter(Boolean)
          .join('\n') || 'Keyingi sahifa topilmadi.',
      );
    }
    if (name === 'extract_tables') {
      const tables = $('table')
        .toArray()
        .map((table) =>
          $(table)
            .find('tr')
            .toArray()
            .map((row) =>
              $(row)
                .find('th,td')
                .toArray()
                .map((cell) => $(cell).text().trim()),
            ),
        );
      return result(JSON.stringify(tables, null, 2));
    }
    return result(
      JSON.stringify(
        {
          url: fetched.url,
          status: fetched.status,
          contentType: fetched.contentType,
          bytes: Buffer.byteLength(fetched.text),
          words: fetched.text.trim().split(/\s+/).filter(Boolean).length,
        },
        null,
        2,
      ),
    );
  }
  if (name === 'sitemap_read') {
    const sitemapUrl = url || 'https://example.com/sitemap.xml';
    const fetched = await page(sitemapUrl);
    const $ = load(fetched.text, { xmlMode: true });
    const urls = $('loc')
      .toArray()
      .map((node) => $(node).text().trim())
      .filter(Boolean)
      .slice(0, Number(input.limit ?? 500));
    return result(urls.join('\n') || 'Sitemap ichida loc URL topilmadi.');
  }
  if (name === 'robots_check') {
    if (!url) return result('url parametri kerak.');
    const target = await assertSafeUrl(url);
    const policy = await getRobotsPolicy(target.origin);
    const allowed = robotsAllows(target, policy);
    return result(
      JSON.stringify(
        {
          url: target.toString(),
          allowed,
          reason: allowed ? 'No matching disallow rule' : 'Blocked by robots.txt',
          crawlDelayMs: policy.crawlDelayMs,
          rules: policy.rules.slice(0, 100),
        },
        null,
        2,
      ),
    );
  }
  if (name === 'broken_links') {
    if (!url) return result('url parametri kerak.');
    const fetched = await page(url);
    const links = [...new Set(pageLinks(fetched.text, fetched.url).map((item) => item.url))].slice(
      0,
      Math.min(Number(input.limit ?? 25), 40),
    );
    const checked = await Promise.all(
      links.map(async (link) => {
        try {
          const response = await page(link);
          return { url: link, status: response.status, broken: response.status >= 400 };
        } catch (error) {
          return { url: link, status: 0, broken: true, error: error instanceof Error ? error.message : String(error) };
        }
      }),
    );
    return result(
      JSON.stringify(
        checked.filter((item) => item.broken),
        null,
        2,
      ),
    );
  }
  if (name === 'crawl_domain_scope' || name === 'crawl_depth_control' || name === 'crawl_speed') {
    if (name === 'crawl_domain_scope') return setCrawlDomainScope(input);
    if (name === 'crawl_depth_control') return setCrawlDepth(input);
    return setCrawlSpeed(input);
  }
  if (name === 'crawl_pause_resume' || name === 'url_queue_manage') {
    if (name === 'crawl_pause_resume') return controlCrawlJob(input);
    const jobId = str(input, 'job_id', 'id') || 'default';
    const key = 'crawl-queue:' + jobId;
    const action = str(input, 'action') || 'list';
    let queue = getQueue(key);
    if (action === 'clear' || action === 'stop') {
      cache.delete(key);
      queue = [];
    } else if (action === 'add' && url) {
      queue.push(url);
      cache.put(key, JSON.stringify(queue));
    } else if (action === 'pop') {
      const next = queue.shift();
      cache.put(key, JSON.stringify(queue));
      return result(next ?? "Queue bo'sh.");
    }
    return result(
      JSON.stringify(
        { key, jobId, action, state: cache.get('crawl-job:' + jobId + ':state')?.value ?? 'running', queue },
        null,
        2,
      ),
    );
  }
  if (name === 'crawl_filter' || name === 'crawl_export' || name === 'crawl_result_merge' || name === 'link_graph') {
    const items = records(input);
    if (name === 'crawl_filter') {
      const include = str(input, 'include', 'pattern');
      const exclude = str(input, 'exclude');
      return result(
        JSON.stringify(
          items.filter(
            (item) =>
              (!include || new RegExp(include, 'i').test(item.url)) &&
              (!exclude || !new RegExp(exclude, 'i').test(item.url)),
          ),
          null,
          2,
        ),
      );
    }
    if (name === 'crawl_result_merge') {
      const map = new Map<string, PageRecord>();
      for (const item of items) map.set(item.url, { ...map.get(item.url), ...item });
      return result(JSON.stringify([...map.values()], null, 2));
    }
    if (name === 'link_graph') {
      const nodes = new Map<string, string>();
      for (const item of items) {
        if (item.url) nodes.set(item.url, item.title || item.url);
        for (const link of Array.isArray(item.links) ? item.links : []) {
          const target =
            typeof link === 'string'
              ? link
              : link && typeof link === 'object'
                ? String((link as { url?: unknown }).url ?? '')
                : '';
          if (target) nodes.set(target, target);
        }
      }
      const ids = new Map([...nodes.keys()].map((url, index) => [url, 'n' + index]));
      const labels = [...nodes].map(
        ([url, title]) =>
          `  ${ids.get(url)}[${JSON.stringify(
            String(title)
              .replace(/[\r\n]+/g, ' ')
              .slice(0, 180),
          )}]`,
      );
      const edges = items.flatMap((item) =>
        (Array.isArray(item.links) ? item.links : []).flatMap((link) => {
          const target =
            typeof link === 'string'
              ? link
              : link && typeof link === 'object'
                ? String((link as { url?: unknown }).url ?? '')
                : '';
          const from = ids.get(item.url);
          const to = ids.get(target);
          return from && to ? [`  ${from} --> ${to}`] : [];
        }),
      );
      return result(['graph LR', ...labels, ...edges].join('\n'));
    }
    const format = str(input, 'format').toLowerCase();
    return result(
      format === 'csv'
        ? [
            'url,title,status,depth',
            ...items.map((item) =>
              [item.url, item.title ?? '', item.status ?? '', item.depth ?? '']
                .map((field) => '"' + String(field).replace(/"/g, '""') + '"')
                .join(','),
            ),
          ].join('\n')
        : JSON.stringify(items, null, 2),
    );
  }
  return result('Crawl operation not recognized: ' + toolName);
}
