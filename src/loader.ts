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
import './tools/i18n/index.js';
import './tools/max-platform/index.js';

export function loadCategories(): void {
  /* importlar yuqorida side-effect sifatida ishlaydi */
}
