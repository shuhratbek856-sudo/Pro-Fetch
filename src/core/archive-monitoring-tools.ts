import { getCredential } from './credentials.js';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { cache } from './cache.js';
import { fetchUrl } from './fetcher.js';
import { fetchWithOptions } from './http-client.js';
import { assertSafeUrl } from './ssrf-guard.js';
import { result } from './format.js';
import type { ToolResult } from './types.js';

type Input = Record<string, unknown>;

function str(input: Input, ...keys: string[]): string {
  for (const key of keys)
    if (typeof input[key] === 'string' && String(input[key]).trim()) return String(input[key]).trim();
  return '';
}

function list(input: Input, ...keys: string[]): unknown[] {
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

function keyFor(name: string, id: string): string {
  return `monitor:${name}:${createHash('sha256').update(id).digest('hex').slice(0, 24)}`;
}

async function fetchSnapshot(url: string): Promise<{ status: number; text: string; finalUrl: string }> {
  const safe = await assertSafeUrl(url);
  const response = await fetchWithOptions(safe.toString());
  return { status: response.status, text: response.text, finalUrl: safe.toString() };
}

export async function runArchiveMonitoringTool(toolName: string, input: Input): Promise<ToolResult> {
  const name = toolName.replace(/^pro_fetch_/, '');
  const url = str(input, 'url');
  if (name === 'archive_org_fetch' || name === 'google_cache_fetch') {
    if (!url) return result('url parametri kerak.');
    await assertSafeUrl(url);
    const archiveUrl =
      name === 'google_cache_fetch'
        ? 'https://webcache.googleusercontent.com/search?q=cache:' + encodeURIComponent(url)
        : 'https://web.archive.org/web/2/' + encodeURIComponent(url);
    try {
      const snapshot = await fetchUrl(archiveUrl);
      if (snapshot.status < 400)
        return result(`# Archived copy\n\nSource: ${url}\nArchive URL: ${snapshot.url}\n\n${snapshot.markdown}`);
    } catch {
      /* try Wayback fallback below */
    }
    if (name === 'google_cache_fetch') {
      const fallback = await fetchUrl('https://web.archive.org/web/2/' + encodeURIComponent(url));
      return result(`# Wayback fallback (Google cache is unavailable)\n\n${fallback.markdown}`);
    }
    throw new Error('Internet Archive’dan snapshot topilmadi.');
  }
  if (name === 'archive_org_save') {
    if (!url) return result('url parametri kerak.');
    const safe = await assertSafeUrl(url);
    const response = await fetchWithOptions('https://web.archive.org/save/' + encodeURIComponent(safe.toString()), {
      method: 'POST',
      timeoutMs: 60000,
      retries: 0,
    });
    if (response.status >= 400)
      throw new Error('Wayback save HTTP ' + response.status + ': ' + response.text.slice(0, 500));
    const archiveUrl =
      response.headers['content-location'] ??
      response.headers.location ??
      'https://web.archive.org/web/' + encodeURIComponent(safe.toString());
    return result(JSON.stringify({ source: safe.toString(), status: response.status, archiveUrl }, null, 2));
  }
  if (name === 'digest_build') {
    const items = list(input, 'items', 'sources', 'results').map((item) =>
      typeof item === 'string' ? item : JSON.stringify(item),
    );
    const text = str(input, 'text', 'content');
    const body = [...items, ...text.split(/\r?\n/)].filter(Boolean);
    const selected = [...new Set(body)].slice(0, Number(input.limit ?? 30));
    return result(
      `# Digest${str(input, 'title') ? ': ' + str(input, 'title') : ''}\n\n${selected.map((item) => '- ' + item.slice(0, 1200)).join('\n') || 'Digest uchun items yoki text bering.'}`,
    );
  }
  if (name === 'feed_subscribe' || name === 'jobs_watch' || name === 'keyword_alert' || name === 'price_watch') {
    if (!url) return result('url parametri kerak.');
    const fetched = await fetchSnapshot(url);
    const id = str(input, 'id', 'name', 'selector') || url;
    const key = keyFor(name, id);
    let value = fetched.text;
    if (name === 'feed_subscribe') {
      const $ = load(fetched.text, { xmlMode: true });
      value = JSON.stringify(
        $('item,entry')
          .toArray()
          .slice(0, 50)
          .map((item) => ({
            title: $(item).find('title').first().text().trim(),
            link: $(item).find('link').first().attr('href') ?? $(item).find('link').first().text().trim(),
            date: $(item).find('pubDate,published,updated').first().text().trim(),
          })),
      );
    } else if (name === 'price_watch') {
      const $ = load(fetched.text);
      const selector = str(input, 'selector');
      const selected = selector ? $(selector).first().text() : fetched.text;
      const match = selected.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
      value = match?.[0] ?? '';
      if (!value) return result('Narx raqami topilmadi; selector yoki regex bering.');
    } else if (name === 'keyword_alert') {
      const keywords = list(input, 'keywords', 'terms').map(String);
      const lower = fetched.text.toLowerCase();
      value = JSON.stringify(keywords.filter((keyword) => lower.includes(keyword.toLowerCase())));
    }
    const previous = cache.get(key)?.value;
    cache.put(key, value, Number(input.ttl_ms ?? 7 * 86_400_000), { url: fetched.finalUrl, status: fetched.status });
    return result(
      JSON.stringify(
        {
          type: name,
          id,
          url: fetched.finalUrl,
          status: fetched.status,
          changed: previous !== undefined && previous !== value,
          previous: previous?.slice(0, 2000),
          current: value.slice(0, 5000),
          initialized: previous === undefined,
        },
        null,
        2,
      ),
    );
  }
  if (name === 'release_watch') {
    const repository = str(input, 'repository', 'repo') || (url.match(/github\.com\/([^/]+\/[^/]+)/)?.[1] ?? '');
    if (!repository || !repository.includes('/')) return result('repository owner/repo yoki GitHub URL kerak.');
    const [owner, repo] = repository.replace(/\.git$/, '').split('/');
    const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
    if (getCredential('GITHUB_TOKEN')) headers.authorization = 'Bearer ' + getCredential('GITHUB_TOKEN');
    const response = await fetchWithOptions(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/latest`,
      { headers },
    );
    if (response.status >= 400) throw new Error('GitHub release API HTTP ' + response.status);
    const release = JSON.parse(response.text) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
      published_at?: string;
    };
    const key = keyFor(name, repository);
    const previous = cache.get(key)?.value;
    cache.put(key, String(release.tag_name ?? ''), Number(input.ttl_ms ?? 7 * 86_400_000));
    return result(
      JSON.stringify(
        { repository, ...release, changed: previous !== undefined && previous !== release.tag_name, previous },
        null,
        2,
      ),
    );
  }
  return result('Archive/monitoring operation not recognized: ' + toolName);
}
