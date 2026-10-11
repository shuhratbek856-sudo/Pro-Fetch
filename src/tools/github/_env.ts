import { mkdirSync } from 'node:fs';

export function cacheDir(): string {
  const d = process.env.PRO_FETCH_CACHE_DIR ?? '.pro-fetch-cache';
  mkdirSync(d, { recursive: true });
  return d;
}
