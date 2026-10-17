// Registers every tool pack as an import side effect, and re-exports the profile rules.
//
// The profile logic itself lives in `core/profile.ts` so that `core/security-policy.ts` can read
// the active profile without importing this file — which would close an import cycle and make
// parts of the registry evaluate to `undefined`.
import {
  currentProfile,
  isToolVisibleInProfile,
  levelOf,
  profileEnforced,
  CATEGORY_LEVELS,
  PROFILE_LEVELS,
  SMART_TOOL_NAMES,
} from './core/profile.js';
import type { Profile } from './core/profile.js';

export {
  currentProfile,
  isToolVisibleInProfile,
  levelOf,
  profileEnforced,
  CATEGORY_LEVELS,
  PROFILE_LEVELS,
  SMART_TOOL_NAMES,
};
export type { Profile };

import './tools/http/index.js';
import './tools/convert/index.js';
import './tools/search/index.js';
import './tools/research/index.js';
import './tools/github/index.js';
import './tools/crawl/index.js';
import './tools/extract/index.js';
import './tools/media/index.js';
import './tools/archive/index.js';
import './tools/admin/index.js';
import './tools/auth/index.js';
import './tools/apitest/index.js';
import './tools/data/index.js';
import './tools/docs/index.js';
import './tools/browser/index.js';
import './tools/monitoring/index.js';
import './tools/llm/index.js';
import './tools/encoding/index.js';
import './tools/schema/index.js';
import './tools/document/index.js';
import './tools/binary/index.js';
import './tools/geo_data/index.js';
import './tools/color/index.js';
import './tools/time/index.js';
import './tools/zip/index.js';
import './tools/opendata/index.js';
import './tools/units/index.js';
import './tools/imageproc/index.js';
import './tools/i18n/index.js';
import './tools/max-platform/index.js';

import { narrowCategorySchemas, setSourceResolver } from './core/schema-narrowing.js';
import { resolveToolSource } from './core/source-resolver.js';

// Runs after every `import` above, so the whole registry exists by the time it runs.
setSourceResolver(resolveToolSource);
const narrowing = narrowCategorySchemas();
if (process.env.PRO_FETCH_LOG_NARROWING === '1') {
  console.error(
    `[schema-narrowing] narrowed=${narrowing.narrowed} skipped=${narrowing.skipped} resolved=${resolveToolSource('pro_fetch_crawl_speed') ? 'yes' : 'no'}`,
  );
}

export function loadCategories(): void {
  /* importlar yuqorida side-effect sifatida ishlaydi */
}
