import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
import { assertSafeUrl } from '../../core/ssrf-guard.js';
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

    // The same SSRF guard every other http tool in this category uses.
    //
    // Measured before: this file did not import the guard at all, so it opened a socket to whatever
    // host the caller named. `http://127.0.0.1:PORT/internal` was refused by the HTTP tool and
    // accepted here, and so was `ws://169.254.169.254:80/latest/meta-data/` — the cloud metadata
    // address — which came back as a *successful* result.
    //
    // `ws:` and `wss:` are the same transports as `http:` and `https:`, so the guard is given the
    // http equivalent and the connection itself keeps the ws scheme.
    const guardTarget = `${parsed.protocol === 'wss:' ? 'https' : 'http'}://${parsed.host}${parsed.pathname}${parsed.search}`;
    try {
      await assertSafeUrl(guardTarget);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
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
      // Whether the connection succeeded or timed out. A timeout that resolves like a
      // success is indistinguishable from "the peer sent nothing" — measured: a server that accepted
      // the handshake and never sent a frame came back as `isError: false` with an empty body.
      let timedOut = false;
      const finish = (timedOutFlag = false) => {
        if (done) return;
        done = true;
        timedOut = timedOutFlag;
        if (timer) clearTimeout(timer);
        try {
          socket?.close();
        } catch {
          /* yopilgan */
        }
        if (timedOut) {
          resolve(
            fail(
              'WebSocket vaqtida javob bermadi: ' +
                timeoutMs +
                ' ms ichida xabar kelmadi. Olingan xabarlar: ' +
                msgs.length,
            ),
          );
          return;
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
          timer = setTimeout(() => finish(true), timeoutMs);
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
