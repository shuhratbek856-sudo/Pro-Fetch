import tool_list_details from './tool_list_details.js';
import tool_execute from './tool_execute.js';
import profile_switch from './profile_switch.js';
import config_get from './config_get.js';
import config_set from './config_set.js';
import rate_limit_status from './rate_limit_status.js';
import proxy_status from './proxy_status.js';
import health_check from './health_check.js';
import usage_stats from './usage_stats.js';
import batch_schedule from './batch_schedule.js';
import result_preview from './result_preview.js';
import token_count from './token_count.js';
import env_check from './env_check.js';
import log_tail from './log_tail.js';
import cache_tune from './cache_tune.js';
import diagnostics from './diagnostics.js';
import tool_search from './tool_search.js';
import tool_schema from './tool_schema.js';
import category_stats from './category_stats.js';
import memory_stats from './memory_stats.js';
import registry_summary from './registry_summary.js';

export default [
  tool_list_details,
  tool_execute,
  profile_switch,
  config_get,
  config_set,
  rate_limit_status,
  proxy_status,
  health_check,
  usage_stats,
  batch_schedule,
  result_preview,
  token_count,
  env_check,
  log_tail,
  cache_tune,
  diagnostics,
  tool_search,
  tool_schema,
  category_stats,
  memory_stats,
  registry_summary,
];
