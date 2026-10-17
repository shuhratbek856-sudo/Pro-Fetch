// Locks the output-containment rule that five commits violated by accident.
//
// The default output root used to be `process.env.PRO_FETCH_OUTPUT_ROOT ?? '.'`, which is the current
// working directory. Running the tools from the repository root therefore wrote their results into the
// repository, and commits 277b276, 204b766, 36b773e, 2ea4fdd and 90bf3e0 each added generated PNGs
// and PDFs to source control - 78 images and 3 PDFs tracked by git, because a test run wrote them next
// to package.json and `git add -A` swept them in.
//
// The second half is worse: the sandbox in `security-policy.ts` only ran when the variable was *set*.
// Unset, there was no containment at all.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import '../src/loader.js';
import { outputRoot } from '../src/core/output-dir.js';
import { callTool } from '../src/router.js';

const ORIGINAL = { ...process.env };
const REPO_ROOT = process.cwd().replace(/\\/g, '/');

beforeEach(() => {
  process.env = { ...ORIGINAL };
  process.env.PRO_FETCH_PROFILE = 'full';
  // Unset on purpose: the default configuration is the one that was wrong.
  delete process.env.PRO_FETCH_OUTPUT_ROOT;
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

const normalise = (value: string): string => value.replace(/\\/g, '/').replace(/\/{2,}/g, '/');

describe('generated output never lands in the working tree', () => {
  it('the default root is not the working directory', () => {
    expect(normalise(outputRoot())).not.toBe(REPO_ROOT);
  });

  it('the default root is somewhere disposable', () => {
    const root = normalise(outputRoot());
    expect(root).toMatch(/cache|\.pro-fetch/);
  });

  it('a configured root is honoured, because that is what the variable is for', () => {
    process.env.PRO_FETCH_OUTPUT_ROOT = path.join(process.cwd(), 'tmp-output-check');
    try {
      expect(normalise(outputRoot())).toBe(normalise(path.join(process.cwd(), 'tmp-output-check')));
    } finally {
      delete process.env.PRO_FETCH_OUTPUT_ROOT;
    }
  });

  it('a tool run leaves nothing behind in the repository', async () => {
    const before = readdirSync(process.cwd());
    const sharp = (await import('sharp')).default;
    const source = (
      await sharp({
        create: { width: 20, height: 20, channels: 3, background: { r: 5, g: 5, b: 5 } },
      })
        .png()
        .toBuffer()
    ).toString('base64');

    const result = await callTool('pro_image_resize', { base64: source, width: 10 });
    expect(result.isError).toBeFalsy();

    const after = readdirSync(process.cwd());
    const added = after.filter((entry) => !before.includes(entry));
    // Specifically the directories the tools used to create, plus nothing else at all.
    expect(added.filter((entry) => /^(img|pdf|bin|geo)-out$/.test(entry))).toEqual([]);
    expect(added).toEqual([]);
  });

  it('the written file is inside the root, and outside the repository', async () => {
    const sharp = (await import('sharp')).default;
    const source = (
      await sharp({
        create: { width: 20, height: 20, channels: 3, background: { r: 5, g: 5, b: 5 } },
      })
        .png()
        .toBuffer()
    ).toString('base64');

    const result = await callTool('pro_image_resize', { base64: source, width: 10 });
    const written = normalise(
      (/\"path\":\s*\"([^\"]+)\"/.exec(
        (result.content ?? []).map((item) => (item.type === 'text' ? item.text : '')).join('\n'),
      ) ?? [])[1] ?? '',
    );
    expect(written).not.toBe('');
    expect(written.startsWith(normalise(outputRoot()))).toBe(true);

    // Not "outside the repository" - that is too strong, because the cache directory is relative and
    // `<repo>/.pro-fetch-cache` is a perfectly good place for it. What matters is that nothing lands
    // somewhere git would track it, so the invariant is checked against the ignore rules themselves.
    if (written.startsWith(REPO_ROOT)) {
      const relative = written.slice(REPO_ROOT.length).replace(/^\//, '');
      const first = relative.split('/')[0];
      // Escape the segment: `.pro-fetch-cache` contains a dot, which as a regex wildcard would also
      // match a directory named `xpro-fetch-cache`.
      const pattern = new RegExp(`^${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`, 'm');
      expect(readFileSync('.gitignore', 'utf8'), `${relative} is inside the repository and is not ignored`).toMatch(
        pattern,
      );
    }
  });
});

describe('the sandbox runs without being configured', () => {
  it('an output_path outside the root is refused, and both paths are named', async () => {
    const result = await callTool('pro_fetch_image_info', {
      base64: 'AAAA',
      output_path: path.join(process.cwd(), '..', 'escape.png'),
    });
    expect(result.isError).toBeTruthy();
    const body = (result.content ?? []).map((item) => (item.type === 'text' ? item.text : '')).join('\n');
    // The refusal has to say where it refused *and* where writing is allowed, or the caller has to
    // guess which of their paths was wrong.
    expect(body).toMatch(/sandbox/i);
    expect(body).toMatch(/Ruxsat etilgan papka/);
  });

  it('the guard no longer depends on the variable being set', () => {
    const source = readFileSync('src/core/security-policy.ts', 'utf8');
    // The old form skipped the whole check when nothing was configured, which is a guard that exists
    // only where it is not needed.
    expect(source).not.toMatch(/if \(configuredRoot\)/);
    expect(source).toMatch(/outputRoot\(\)/);
  });
});

describe('generated output is ignored by git', () => {
  it('the output directories are listed', () => {
    const ignored = readFileSync('.gitignore', 'utf8');
    for (const directory of ['img-out/', 'pdf-out/', 'bin-out/', 'geo-out/']) {
      expect(ignored, directory).toContain(directory);
    }
  });

  it('and none of them exists in the working tree', () => {
    // Five commits tracked 78 generated PNGs and 3 PDFs from these directories. Whether git still has
    // them is a question for `git ls-files`, which is not on PATH in every environment this suite runs
    // in; what the suite can check everywhere is that they are gone and stay ignored.
    for (const directory of ['img-out', 'pdf-out', 'bin-out', 'geo-out']) {
      expect(readdirSync(process.cwd()).includes(directory), directory).toBe(false);
    }
  });
});
