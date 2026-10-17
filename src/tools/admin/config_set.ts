import { allTools, usageStats } from '../../core/tool.js';
import { levelOf, PROFILE_LEVELS, currentProfile } from '../../loader.js';
import { result, jsonBlock, fail } from '../../core/format.js';
import { estimateTokens, clipToTokens } from '../../core/chunker.js';
import { cache } from '../../core/cache.js';
import { bucketsSnapshot } from '../../core/ratelimit.js';
import { tail } from '../../core/log.js';

/**
 * pro_fetch_config_set — Update a configuration key at runtime
 * Pack: admin (REAL ✅) (pro-fetch)
 */
/**
 * Keys a tool call may set, because none of them can widen a boundary.
 *
 * `PRO_FETCH_ALLOW_JS` and `PRO_FETCH_CACHE_DIR` were here and were removed after measurement:
 * the first turned off the JavaScript block, the second moved the cache root to `/`, which moves
 * the write boundary with it because `writeBoundaryRoot()` falls back to the cache root. A key that
 * names a permission or a path root is not a tuning knob.
 *
 * The four that remain are a user-agent string, log verbosity, a display timezone and a browser
 * build channel. None of them changes what the server will do, only what it calls itself and how
 * loudly it says so.
 */
const SETTABLE: readonly string[] = [
  'PRO_FETCH_USER_AGENT',
  'PRO_FETCH_LOG_NARROWING',
  'PRO_FETCH_BROWSER_TZ',
  'PRO_FETCH_BROWSER_CHANNEL',
];

import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_fetch_config_set',
  description: 'Update a configuration key at runtime',
  category: 'admin',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'PRO_FETCH_ kaliti' },
      value: { type: 'string', description: 'Qiymat' },
    },
    required: ['key', 'value'],
  },
  async handler(input) {
    const p = view(input);
    // Only keys that cannot widen any boundary. Everything else - permissions, deny lists, path
    // roots, caps, the tool set - is refused, because a tool call is something a model can make and an
    // operator's policy is not something a model should be able to edit.
    //
    // Measured before this list was narrowed: PRO_FETCH_ALLOW_JS=true and PRO_FETCH_CACHE_DIR=/ were
    // both applied with isError=false. The second one widens the write boundary to the filesystem root,
    // because writeBoundaryRoot() returns the cache root when PRO_FETCH_OUTPUT_ROOT is unset.
    //
    // The rule below is the durable half: a key whose name names a permission, a path, a cap or the
    // tool set is refused even if someone adds it to SETTABLE. That way adding a key is a deliberate act
    // that has to be argued for, rather than a one-line edit that quietly re-opens the hole.
    const key = String(p.key);

    const BOUNDARY_KEY =
      /(?:^|_)(?:ALLOW|DENY|ENFORCE|ENABLE|DISABLE|READONLY|ROOT|DIR|PATH|LIMIT|MAX|MIN|PROFILE|MODE|KEY|TOKEN|SECRET|PASSWORD|AUTH|CORS|PROXY|CONF|CERT|INSECURE|VERIFY|SKIP|BYPASS|WORKSPACE|ALLOWLIST|CHANNEL?_?HOSTS?)(?:_|$)/i;
    if (BOUNDARY_KEY.test(key)) {
      return fail(
        key +
          ' operator siyosati kaliti - tool chaqiruvi orqali o‘zgartirilmaydi. ' +
          'Bunday kalit server ishga tushgandan oldin environment yoki .env orqali belgilanadi.',
      );
    }

    if (!SETTABLE.includes(key)) {
      return fail(
        'Tool orqali o‘zgartiriladigan kalitlar: ' +
          SETTABLE.join(', ') +
          '. Boshqa PRO_FETCH_* kalitlari operator sozlamasi hisoblanadi va faqat server ishga tushgandan ' +
          'oldin environment orqali o‘zgartiriladi - aks holda model o‘z qoidasini o‘zgartira olardi.',
      );
    }
    process.env[String(p.key)] = String(p.value);
    return result('✅ ' + p.key + ' = ' + p.value + ' (sessiya)');
  },
});
