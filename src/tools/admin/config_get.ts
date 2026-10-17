import { credentialStatus } from '../../core/credentials.js';
import { allTools, usageStats } from '../../core/tool.js';
import { levelOf, PROFILE_LEVELS, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_config_get — Read the current server configuration
 * Pack: admin (REAL ✅) (pro-fetch)
 */
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';

/**
 * Proxy variables, which are the only settings on that list that can contain a password.
 *
 * `http://proxy.corp:8080` is harmless; `http://alice:s3cr3t@proxy.corp:8080` is the same variable with a
 * credential in it, and a proxy URL is exactly where credentials belong. So these four are described
 * rather than printed.
 */
const PROXY_ENV_KEYS = new Set(['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'NO_PROXY']);

/**
 * A proxy address with the parts that authenticate removed.
 *
 * Scheme, host and port are the parts an operator needs to see in order to tell whether the proxy is
 * configured and where it points. Username, password and query string are the parts that make it a
 * secret. Measured: this tool's own result went straight into a model's context, and unlike every
 * other credential in the list - which pass through `credentialStatus` and come back as
 * `(o'rnatilgan)` - these four were copied verbatim, so `pro_fetch_config_get` printed the proxy
 * password in full. Reporting the host is the useful part and costs nothing.
 */
function describeProxyEnv(raw: string | undefined): string {
  if (raw === undefined) return "(o'rnatilmagan)";
  const value = raw.trim();
  if (!value) return value;
  try {
    const url = new URL(value);
    const auth = url.username || url.password ? '//[credentials olib tashlandi]@' : '';
    return `${url.protocol}${auth}${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    // `NO_PROXY` is a comma-separated host list, not a URL. Nothing in it is a credential, so it is
    // printed as given rather than mangled by a parser that cannot read it.
    return value;
  }
}

export default defineTool({
  name: 'pro_fetch_config_get',
  description: 'Read the current server configuration',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(input) {
    const p = view(input);
    const cfg: Record<string, unknown> = {};
    for (const k of [
      'PRO_FETCH_PROFILE',
      'PRO_FETCH_TIMEOUT_MS',
      'PRO_FETCH_MAX_BYTES',
      'PRO_FETCH_TOOL_TIMEOUT_MS',
      'PRO_FETCH_HTTP_CACHE_TTL_MS',
      'PRO_FETCH_MAX_CONCURRENCY',
      'PRO_FETCH_MAX_CATEGORY_CONCURRENCY',
      'PRO_FETCH_MAX_NETWORK_CONCURRENCY',
      'PRO_FETCH_MAX_PER_HOST_CONCURRENCY',
      'PRO_FETCH_BROWSER_MAX_SESSIONS',
      'PRO_FETCH_READ_ONLY',
      'PRO_FETCH_OUTPUT_ROOT',
      'PRO_FETCH_GITHUB_MAX_PAGES',
      'PRO_FETCH_ALLOW_JS',
      'PRO_FETCH_CACHE_DIR',
      'HTTPS_PROXY',
      'HTTP_PROXY',
      'ALL_PROXY',
      'NO_PROXY',
    ])
      cfg[k] = PROXY_ENV_KEYS.has(k) ? describeProxyEnv(process.env[k]) : (process.env[k] ?? "(o'rnatilmagan)");
    cfg.GITHUB_TOKEN = credentialStatus('GITHUB_TOKEN');
    cfg.SEARCH_API_KEY = credentialStatus('SEARCH_API_KEY');
    cfg.OPENAI_API_KEY = credentialStatus('OPENAI_API_KEY');
    return jsonBlock('# Konfiguratsiya', cfg);
  },
});
