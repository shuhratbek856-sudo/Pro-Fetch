import cache_get from './cache_get.js';
import cache_put from './cache_put.js';
import cache_search from './cache_search.js';
import cache_clear from './cache_clear.js';
import cache_stats from './cache_stats.js';
import archive_org_save from './archive_org_save.js';
import archive_org_fetch from './archive_org_fetch.js';
import google_cache_fetch from './google_cache_fetch.js';
import wayback_lookup from './wayback_lookup.js';
import wayback_fetch from './wayback_fetch.js';
import snapshot_diff from './snapshot_diff.js';
import offline_browse from './offline_browse.js';
import export_bundle from './export_bundle.js';
import import_bundle from './import_bundle.js';
import version_history from './version_history.js';

export default [
  cache_get,
  cache_put,
  cache_search,
  cache_clear,
  cache_stats,
  archive_org_save,
  archive_org_fetch,
  google_cache_fetch,
  wayback_lookup,
  wayback_fetch,
  snapshot_diff,
  offline_browse,
  export_bundle,
  import_bundle,
  version_history,
];
