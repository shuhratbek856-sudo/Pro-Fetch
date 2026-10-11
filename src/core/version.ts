import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Single source of truth for the package version.
 *
 * Read from `package.json` at runtime instead of hard-coded literals, because a hard-coded
 * string silently goes stale (the User-Agent and the MCP `serverInfo` previously disagreed with
 * `package.json`). Resolution walks up from this module so it works for both `src/` (tsx) and
 * `dist/` (compiled) layouts. Falls back to `unknown` rather than throwing: a missing version
 * must never stop the server from booting.
 */
function readVersion(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // `src/core/` and `dist/core/` are both exactly two levels below the package root.
  const manifest = path.resolve(here, '..', '..', 'package.json');
  try {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown; version?: unknown };
    if (parsed.name === 'pro-fetch-mcp' && typeof parsed.version === 'string' && parsed.version) {
      return parsed.version;
    }
  } catch {
    // Fall through to the fallback below.
  }
  return 'unknown';
}

export const VERSION: string = readVersion();

/** User-Agent sent with every outbound request made by this server. */
export const USER_AGENT: string = `pro-fetch-mcp/${VERSION}`;
