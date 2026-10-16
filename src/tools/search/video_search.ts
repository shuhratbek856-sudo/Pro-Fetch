import { defineTool } from '../../core/tool.js';
import { fetchWithOptions } from '../../core/http-client.js';
import { result } from '../../core/format.js';
import { parseUpstreamJson } from '../../core/json-response.js';

/**
 * pro_fetch_video_search — Search videos by keyword across platforms
 * Pack: search (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_video_search',
  description: 'Search YouTube videos (requires YOUTUBE_API_KEY)',
  category: 'search',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: "So'rov matni" },
      limit: { type: 'number', description: 'Natijalar soni (1-50)' },
    },
    required: ['query'],
  },
  async handler(input) {
    const query = typeof input.query === 'string' ? input.query.trim() : '';
    if (!query) throw new Error('query parametri kerak.');
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) throw new Error('Video search uchun YOUTUBE_API_KEY sozlang.');
    const limitValue = Number(input.limit ?? 10);
    const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(50, Math.floor(limitValue))) : 10;
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    for (const [key, value] of Object.entries({
      part: 'snippet',
      type: 'video',
      maxResults: String(limit),
      q: query,
      key: apiKey,
    }))
      url.searchParams.set(key, value);
    const response = await fetchWithOptions(url.toString(), {
      headers: { accept: 'application/json' },
      maxBytes: 2_000_000,
    });
    if (response.status >= 400) throw new Error('YouTube Data API HTTP ' + response.status);
    const payload = parseUpstreamJson(response, 'pro_fetch_video_search') as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: { title?: string; channelTitle?: string; publishedAt?: string; description?: string };
      }>;
    };
    const results = (payload.items ?? []).map((item) => ({
      title: item.snippet?.title ?? '',
      channel: item.snippet?.channelTitle ?? '',
      publishedAt: item.snippet?.publishedAt ?? '',
      description: item.snippet?.description ?? '',
      url: item.id?.videoId ? 'https://www.youtube.com/watch?v=' + item.id.videoId : '',
    }));
    return result(JSON.stringify({ provider: 'YouTube Data API', query, count: results.length, results }, null, 2));
  },
});
