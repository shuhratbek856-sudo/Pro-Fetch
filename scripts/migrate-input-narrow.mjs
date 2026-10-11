// One-off follow-up to the `view(input)` migration: the widened property type surfaced nine real
// type mismatches that `any` had been hiding. Each is a value passed to a function with a narrower
// parameter type, so each needs an explicit narrowing rather than a blanket cast.
import { readFile, writeFile } from 'node:fs/promises';

/** `p.max_pages` reaches `ghApiPaginated`, which accepts `number | undefined`. */
const MAX_PAGES_FILES = [
  'src/tools/github/commits_list.ts',
  'src/tools/github/issues_list.ts',
  'src/tools/github/issues_search.ts',
  'src/tools/github/org_repos.ts',
  'src/tools/github/prs_list.ts',
  'src/tools/github/releases_list.ts',
  'src/tools/github/repo_contributors.ts',
  'src/tools/github/tags_list.ts',
];

const NARROW = "typeof p.max_pages === 'number' ? p.max_pages : undefined";

let changed = 0;
for (const file of MAX_PAGES_FILES) {
  const before = await readFile(file, 'utf8');
  const after = before.replace(/\bp\.max_pages\)/g, `${NARROW})`);
  if (after !== before) {
    await writeFile(file, after, 'utf8');
    changed++;
  }
}

// `soapaction` is an HTTP header value and must be a string.
{
  const file = 'src/tools/http/fetch_soap.ts';
  const before = await readFile(file, 'utf8');
  const after = before.replace(
    "soapaction: p.action ?? ''",
    "soapaction: typeof p.action === 'string' ? p.action : ''",
  );
  if (after !== before) {
    await writeFile(file, after, 'utf8');
    changed++;
  }
}
console.log(`narrowed ${changed} file(s)`);
