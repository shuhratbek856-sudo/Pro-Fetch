import github_auth_status from './github_auth_status.js';
import api_key_set from './api_key_set.js';
import session_save from './session_save.js';
import session_restore from './session_restore.js';
import cookie_jar_manage from './cookie_jar_manage.js';
import basic_auth_fetch from './basic_auth_fetch.js';
import bearer_fetch from './bearer_fetch.js';
import oauth_device_flow from './oauth_device_flow.js';
import credential_test from './credential_test.js';
import scopes_audit from './scopes_audit.js';
import session_list from './session_list.js';
import session_revoke from './session_revoke.js';

export default [
  github_auth_status,
  api_key_set,
  session_save,
  session_restore,
  cookie_jar_manage,
  basic_auth_fetch,
  bearer_fetch,
  oauth_device_flow,
  credential_test,
  scopes_audit,
  session_list,
  session_revoke,
];
