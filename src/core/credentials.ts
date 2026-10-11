import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_SECRET_FILE_BYTES = 16 * 1024;

/** Absolute project root, so a relative `<NAME>_FILE` (for example `.secrets/JIRA_TOKEN.txt`)
 * resolves the same way no matter which directory the MCP client spawned the server from. */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Resolve a `<NAME>_FILE` value to an absolute path. Relative entries are anchored to the
 * project root rather than the process cwd, which is not the project directory in a stdio server. */
function resolveSecretPath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(PROJECT_ROOT, filePath);
}

/** Resolve secrets from the process environment, with an optional *_FILE fallback.
 * Secret values are never returned in diagnostics; callers should only use them for requests.
 */
export function getCredential(name: string): string | undefined {
  const direct = process.env[name]?.trim();
  if (direct) return direct;
  const filePath = process.env[`${name}_FILE`]?.trim();
  if (!filePath) return undefined;
  try {
    const stat = statSync(resolveSecretPath(filePath));
    if (!stat.isFile() || stat.size > MAX_SECRET_FILE_BYTES) return undefined;
    const value = readFileSync(resolveSecretPath(filePath), 'utf8').trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

export function credentialStatus(name: string): { configured: boolean; source: 'environment' | 'file' | 'missing' } {
  if (process.env[name]?.trim()) return { configured: true, source: 'environment' };
  if (process.env[`${name}_FILE`]?.trim() && getCredential(name)) return { configured: true, source: 'file' };
  return { configured: false, source: 'missing' };
}
