import { describe, expect, it } from 'vitest';
import '../src/loader.js';
import { dispatch } from '../src/core/tool.js';

// Regression: pro_fetch_tool_execute (smart profil) ichki xatoni JSON matn qilib qaytaradi.
// Avval structuredContent.error.message obyekt bo'lib qolardi va outputSchema (message: string)
// bilan to'qnashib "Schema validation error" berardi (pro_gh_repo_info / pro_gh_repo_readme).
describe('structuredContent.error.message', () => {
  it('tool_execute orqali chaqirilgan xatoda message doim string', async () => {
    for (const name of ['pro_gh_repo_info', 'pro_gh_repo_readme']) {
      // owner/repo yo'q => tarmoqqa chiqmasdan xato qaytadi
      const res: any = await dispatch('pro_fetch_tool_execute', { tool_name: name, arguments: {} });
      expect(res.isError, name).toBe(true);
      expect(res.structuredContent.ok, name).toBe(false);
      expect(typeof res.structuredContent.error.message, name).toBe('string');
      expect(res.structuredContent.error.message.length, name).toBeGreaterThan(0);
    }
  });
});
