import { allTools, usageStats } from '../../core/tool.js';
import { levelOf, PROFILE_LEVELS, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_proxy_status — Show proxy configuration and health
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_proxy_status',
  description: 'Show proxy configuration and health',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(input) {
    const p = view(input);
    const httpsProxy = process.env.HTTPS_PROXY ?? process.env.https_proxy;
    const httpProxy = process.env.HTTP_PROXY ?? process.env.http_proxy;
    const allProxy = process.env.ALL_PROXY ?? process.env.all_proxy;
    const noProxy = process.env.NO_PROXY ?? process.env.no_proxy;
    const describe = (value: string | undefined) => {
      if (!value) return { configured: false };
      try {
        const parsed = new URL(value);
        return {
          configured: true,
          protocol: parsed.protocol,
          host: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
          credentialsPresent: Boolean(parsed.username || parsed.password),
        };
      } catch {
        return { configured: true, validUrl: false };
      }
    };
    return result(
      JSON.stringify(
        {
          HTTPS_PROXY: describe(httpsProxy),
          HTTP_PROXY: describe(httpProxy),
          ALL_PROXY: describe(allProxy),
          NO_PROXY: noProxy
            ? noProxy
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
            : [],
          supportedSchemes: ['http:', 'https:'],
          credentials: 'Proxy credentials are redacted and never displayed',
        },
        null,
        2,
      ),
    );
  },
});
