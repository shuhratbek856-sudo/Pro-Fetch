import { fetchUrl, fetchBatch } from '../../core/fetcher.js';
import { fetchWithOptions, traceRedirects, downloadToFile } from '../../core/http-client.js';
import { result, md, jsonBlock, fail } from '../../core/format.js';
import { clipToTokens } from '../../core/chunker.js';
import { cacheDir } from '../github/_env.js';
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
      timeout_ms: { type: 'number', description: 'Timeout ms (default 15000)' },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    return new Promise((resolve) => {
      const msgs: string[] = [];
      let done = false;
      let socket: { close: () => void } | undefined;
      const finish = () => {
        if (done) return;
        done = true;
        try {
          socket?.close();
        } catch {
          /* yopilgan */
        }
        resolve(result('# ' + p.url + ' — WebSocket\n\n' + msgs.map((m, i) => i + 1 + '. ' + m).join('\n')));
      };
      import('ws').then(({ default: WebSocket }) => {
        const ws = new WebSocket(String(p.url));
        socket = ws;
        ws.on('message', (data: unknown) => {
          msgs.push(String(data));
          if (msgs.length >= Number(p.max_messages ?? 10)) finish();
        });
        ws.on('error', (e: Error) => {
          if (!done) {
            done = true;
            resolve(fail('WebSocket xato: ' + e.message));
          }
        });
        ws.on('close', () => finish());
        setTimeout(finish, Number(p.timeout_ms ?? 15000));
      });
    });
  },
});
