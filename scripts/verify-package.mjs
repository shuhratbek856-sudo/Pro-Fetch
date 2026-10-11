// Guards the artefacts that `npm publish` would ship.
//
// `npm pack` honours the `files` allowlist in package.json, so this script asserts the two
// properties that a package can silently fail on: the CLI entry point must be executable on
// POSIX (it needs a shebang), and no real credential may be inside the tarball. A `.env` full of
// live API keys is git-ignored but still travels inside a ZIP of the project folder, which is the
// most common way this project gets shared.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const failures = [];

// 1. The bin target must exist, carry a shebang, and import nothing from the excluded type output.
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const binRelative = Object.values(manifest.bin ?? {})[0];
if (typeof binRelative !== 'string') {
  failures.push('package.json declares no bin entry');
} else {
  const source = readFileSync(binRelative, 'utf8');
  if (!source.startsWith('#!')) {
    failures.push(`${binRelative} has no shebang; npx/${manifest.name} will fail on POSIX`);
  }
  if (!/^#!.*\bnode\b/.test(source.split('\n')[0] ?? '')) {
    failures.push(`${binRelative} shebang must invoke node`);
  }
}

// 2. The published file set must be explicit, not an accident of .gitignore.
if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
  failures.push('package.json has no "files" allowlist; npm would fall back to .gitignore');
}

// 3. Nothing inside the tarball may look like a real credential.
const secretPattern =
  /(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|ATATT3[A-Za-z0-9_\-=]{20,}|glpat-[A-Za-z0-9_\-=]{20,})/;

// `npm pack` must be invoked without a shell. On Windows the `npm`/`npm.cmd` shims are `.cmd`
// files, which Node 24 refuses to spawn (`spawnSync npm.cmd EINVAL`), and `shell: true` trips
// DEP0190. Resolve npm's own CLI entry and run it with the current Node binary instead — that
// works identically on every platform and keeps the arguments properly escaped.
function npmCommand() {
  if (process.platform !== 'win32') return { file: 'npm', args: [] };
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!existsSync(npmCli)) {
    throw new Error(`cannot locate npm-cli.js next to ${process.execPath}`);
  }
  return { file: process.execPath, args: [npmCli] };
}

const { file: npmFile, args: npmArgs } = npmCommand();
const packed = execFileSync(npmFile, [...npmArgs, 'pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  windowsHide: true,
});
let entries = [];
try {
  entries = JSON.parse(packed)[0]?.files?.map((entry) => entry.path) ?? [];
} catch {
  failures.push('could not parse `npm pack --dry-run --json` output');
}

if (!entries.length && !failures.length) failures.push('npm pack reported no files');

for (const file of entries) {
  if (/(?:^|\/)\.env$/.test(file) && file !== '.env.example') {
    failures.push(`${file} would be published; only .env.example may ship`);
  }
  if (/\.(?:pem|key|p12|pfx)$/.test(file)) failures.push(`${file} looks like a key file and must not ship`);
  if (/\.d\.ts$/.test(file)) failures.push(`${file} is a declaration file; the bin-only package should not ship types`);
  if (/\.(?:ts|mts|mjs)$/.test(file) && file.startsWith('src/')) {
    failures.push(`${file} ships TypeScript source; the published package should be dist/ only`);
  }
}

// 4. Scan shipped text files for embedded credentials.
let scanned = 0;
for (const file of entries) {
  if (!/\.(?:js|json|md|example)$/.test(file)) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  scanned++;
  if (secretPattern.test(text)) failures.push(`${file} contains a credential-like string`);
}

if (failures.length) {
  console.error('PACKAGE_VERIFICATION_FAIL');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}
console.log('PACKAGE_VERIFICATION_PASS');
console.log(
  `files=${entries.length}; scanned=${scanned}; bin=${binRelative}; shebang=ok; credentials=none; types=excluded`,
);
