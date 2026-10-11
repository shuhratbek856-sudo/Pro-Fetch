import { fetchFollowingSafeRedirects } from '../../core/http-client.js';
import { result, fail } from '../../core/format.js';

/**
 * pro_fetch_sse_subscribe — Subscribe to a Server-Sent Events stream and capture events
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_sse_subscribe',
  description: 'Subscribe to a Server-Sent Events stream and capture events',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'SSE manzil' },
      max_events: { type: 'number', description: 'Max event (default 10)' },
      timeout_ms: { type: 'number', description: 'Timeout ms (default 15000)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const url = String(p.url ?? '');
    if (!url) return fail('url parametri kerak.');
    const limit = Math.max(
      1,
      Math.min(100, Number.isFinite(Number(p.max_events)) ? Math.floor(Number(p.max_events)) : 10),
    );
    const timeoutMs = Math.max(
      1000,
      Math.min(120_000, Number.isFinite(Number(p.timeout_ms)) ? Number(p.timeout_ms) : 15_000),
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const { response } = await fetchFollowingSafeRedirects(url, {
        method: 'GET',
        headers: { accept: 'text/event-stream' },
        signal: controller.signal,
      });
      if (!response.ok) return fail('SSE HTTP ' + response.status);
      if (!response.headers.get('content-type')?.toLowerCase().includes('text/event-stream'))
        return fail('Server text/event-stream content-type qaytarmadi.');
      if (!response.body) return fail("SSE response stream yo'q.");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      const events: Array<{ event: string; id: string; data: string }> = [];
      while (events.length < limit) {
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          let event = 'message';
          let id = '';
          const data: string[] = [];
          for (const line of block.split(/\r?\n/)) {
            if (line.startsWith(':')) continue;
            const separator = line.indexOf(':');
            const field = separator < 0 ? line : line.slice(0, separator);
            const fieldValue = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '');
            if (field === 'event') event = fieldValue;
            else if (field === 'id' && !fieldValue.includes('\0')) id = fieldValue;
            else if (field === 'data') data.push(fieldValue);
          }
          if (data.length) events.push({ event, id, data: data.join('\n') });
          if (events.length >= limit) break;
        }
        if (done) break;
      }
      return result(
        JSON.stringify({ url, events, eventCount: events.length, truncated: events.length >= limit }, null, 2),
      );
    } finally {
      clearTimeout(timer);
      controller.abort();
      await reader?.cancel().catch(() => {});
    }
  },
});
