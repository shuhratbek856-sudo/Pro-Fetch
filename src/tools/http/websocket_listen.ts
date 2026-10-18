import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import { assertSafeWebSocketUrl } from '../../core/ssrf-guard.js';
import path from 'node:path';

/**
 * pro_fetch_websocket_listen — Connect to a WebSocket and capture first N messages
 * Pack: http (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_websocket_listen',
  description: 'Connect to a WebSocket and capture first N messages',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'ws:// manzil' },
      max_messages: { type: 'number', description: 'Max xabar (default 10)' },
      timeout_ms: { type: 'number', description: 'Timeout ms (default 17000)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const target = typeof p.url === 'string' ? p.url.trim() : '';

    // `new WebSocket(...)` throws synchronously for a malformed address, and inside a `.then()`
    // callback that throw becomes an unhandled rejection — which terminates the process rather than
    // failing the call. Verified: calling this tool without a url killed the server and took all
    // 771 tools with it. Validating here means the native library is only ever handed an address it
    // can open.
    let parsed: URL;
    try {
      parsed = new URL(target);
    } catch {
      return fail('url talab qilinadi va to‘g‘ri bo‘lishi kerak (masalan wss://example.com/socket).');
    }
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      return fail(`WebSocket uchun ws:// yoki wss:// kerak, berilgan: ${parsed.protocol}`);
    }

    // The SSRF guard is HTTP-shaped and rejects ws/wss, so `new WebSocket(target)` used to connect to
    // anything — ws://localhost:6379, ws://169.254.169.254 — and stream the frames back. Run the same
    // host / private-IP / DNS checks, allowing the WebSocket schemes.
    try {
      await assertSafeWebSocketUrl(target);
    } catch (error) {
      return fail((error as Error).message);
    }

    // A hostile `timeout_ms` must not pin a socket open indefinitely, and `max_messages` must be a
    // count. `Number()` on the wrong type yields NaN, which every comparison below treats as false.
    const timeoutMs = Math.min(Math.max(Number(p.timeout_ms ?? 17000) || 17000, 270), 120_000);
    const maxMessages = Math.min(Math.max(Number(p.max_messages ?? 10) || 10, 1), 1000);

    return new Promise((resolve) => {
      const msgs: string[] = [];
      let done = false;
      let timer: NodeJS.Timeout | undefined;
      let socket: { close: () => void } | undefined;
      const finish = () => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        try {
          socket?.close();
        } catch {
          /* yopilgan */
        }
        resolve(result('# ' + target + ' — WebSocket\n\n' + msgs.map((m, i) => i + 1 + '. ' + m).join('\n')));
      };

      import('ws')
        .then(({ default: WebSocket }) => {
          const ws = new WebSocket(target);
          socket = ws;
          ws.on('message', (data: unknown) => {
            msgs.push(String(data));
            if (msgs.length >= maxMessages) finish();
          });
          ws.on('error', (e: Error) => {
            if (done) return;
            done = true;
            if (timer) clearTimeout(timer);
            resolve(fail('WebSocket xato: ' + e.message));
          });
          ws.on('close', () => finish());
          timer = setTimeout(finish, timeoutMs);
        })
        // Without this, a failure to load `ws` or to construct the socket rejects with nothing
        // listening, and the promise returned by `handler` never settles at all — the caller waits
        // forever and the rejection separately ends the process.
        .catch((error: unknown) => {
          if (done) return;
          done = true;
          if (timer) clearTimeout(timer);
          resolve(fail('WebSocket ulanmadi: ' + (error instanceof Error ? error.message : String(error))));
        });
    });
  },
});
