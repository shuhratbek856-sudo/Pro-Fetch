import { fetchWithOptions } from '../../core/http-client.js';
import { md, fail } from '../../core/format.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/**
 * pro_fetch_fetch_with_proxy — Fetch URL through an explicit or env-configured HTTP proxy
 * Pack: http (REAL ✅) (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_fetch_with_proxy',
  description: 'Fetch URL through an explicit or env-configured HTTP proxy',
  category: 'http',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Manzil (URL)' },
      proxy: {
        type: 'string',
        description: 'Proxy: http://host:port (bo‘sh bo‘lsa env HTTPS_PROXY/HTTP_PROXY o‘qiladi)',
      },
    },
    required: ['url'],
  },
  async handler(input) {
    const p = view(input);
    const proxy =
      String(p.proxy ?? '').trim() ||
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      process.env.ALL_PROXY ||
      '';
    if (!proxy.trim()) return fail('proxy argumenti yoki HTTPS_PROXY/HTTP_PROXY env kerak.');

    // The previous implementation called undici `setGlobalDispatcher(new ProxyAgent(proxy))`:
    // global state that leaks to every fetch on the server, while this tool's own request never
    // used it at all (the HTTP client always passes its own pinned dispatcher). The proxy is now
    // a per-request fact (`FetchOptions.proxy`), and nothing tab-global is left behind.
    const r = await fetchWithOptions(String(p.url), { retries: 0, proxy: proxy.trim() });

    // A proxy URL may embed `user:password@`, so the diagnostic prints the address only.
    let address = 'proxy (format taniqlmadi)';
    try {
      const parsed = new URL(proxy.trim());
      address = parsed.protocol + '//' + parsed.host;
    } catch {
      // fall through to the masked label
    }
    const note =
      '\n\n⚠️ Proxy o‘z tarafidan nishon hostname ni o‘zi resolve qiladi — bu chaqiruv uchun lokal ' +
      'DNS pinning ta‘minlanmaydi (atratsion proxy ishonch madalidir).';
    return md('# ' + String(p.url) + ' (proxy: ' + address + ')\n\nstatus: ' + r.status + '\n\n' + r.text + note, 6000);
  },
});
