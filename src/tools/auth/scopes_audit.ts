import { defineTool } from '../../core/tool.js';
import { auditScopes } from '../../core/integration-tools.js';

/**
 * pro_fetch_scopes_audit — Audit granted scopes against needed scopes
 * Pack: auth (pro-fetch)
 */
export default defineTool({
  name: 'pro_fetch_scopes_audit',
  description: 'Audit granted scopes against needed scopes',
  category: 'auth',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(input) {
    return auditScopes(input);
  },
});
