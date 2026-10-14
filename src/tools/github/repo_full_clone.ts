import { ghApi, ghErr, result, md, jsonBlock, fail } from './_api.js';
import { cacheDir } from './_env.js';
import { fetchWithOptions, downloadToFile } from '../../core/http-client.js';
import { fetchUrl } from '../../core/fetcher.js';
import { clipToTokens } from '../../core/chunker.js';
import path from 'node:path';

/**
 * pro_gh_repo_full_clone — Download a repository tarball for deep analysis
 * Pack: github (REAL ✅) (pro-fetch)
 */
import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { view } from '../../core/input.js';
export default defineTool({
  name: 'pro_gh_repo_full_clone',
  description: 'Download a repository tarball for deep analysis',
  category: 'github',
  inputSchema: ghSchema(['owner', 'repo', 'ref'], ['owner', 'repo']),
  async handler(input) {
    const p = view(input);
    const requested = typeof p.ref === 'string' && p.ref.trim() ? p.ref.trim() : 'main';
    const dest = path.join(
      cacheDir(),
      p.owner + '-' + p.repo + '-' + requested.replace(/[^a-zA-Z0-9._-]/g, '_') + '.tar.gz',
    );

    // Half the public repositories still default to `master`. Trying only `main` fails those with a
    // 404 that reads as "repository not found", so the other conventional default is attempted before
    // giving up. An explicitly requested ref is honoured exactly - only the default is retried.
    //
    // `downloadToFile` throws on HTTP errors rather than returning a status, so each attempt is
    // caught individually; any other failure (network, disk, size limit) aborts immediately instead
    // of being retried as if it were a wrong branch name.
    const candidates = p.ref ? [requested] : [requested, 'master'];
    let info: { status: number; bytes: number } | undefined;
    let used = requested;
    for (const ref of candidates) {
      try {
        info = await downloadToFile(
          'https://codeload.github.com/' + p.owner + '/' + p.repo + '/tar.gz/refs/heads/' + ref,
          dest,
        );
        used = ref;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/^Download HTTP (404|400)$/.test(message)) {
          // A bare "fetch failed" says nothing about what was actually attempted, so a network or
          // DNS fault and a bad ref look identical to the caller. Name the ref here: any failure
          // that is not a "this branch does not exist" answer aborts the clone, and the only useful
          // fact in that error is which ref was requested.
          throw new Error(`${p.owner}/${p.repo} ref '${ref}' ni yuklab bo'lmadi: ${message}`);
        }
      }
    }
    if (!info)
      return fail(`Yuklashda xato: repository yoki branch topilmadi (sinab ko‘rildi: ${candidates.join(', ')}).`);
    return result(
      '✅ ' +
        p.owner +
        '/' +
        p.repo +
        ' (' +
        used +
        ') tarball yuklandi:\n' +
        dest +
        ' (' +
        Math.round(info.bytes / 1024) +
        ' KB)',
    );
  },
});
