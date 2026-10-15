// Every internal tool reference must name a tool that actually exists.
//
// A composite builds its steps as `[label, toolName, args]` and runs them through `dispatch()`. If the
// name is wrong, `dispatch` answers "Nomalum tool" - and the composite still returns `isError: false`
// while reporting every step as FAILED. That is the worst shape a bug can take: the caller is told the
// scan succeeded, and the numbers underneath say 0/7.
//
// Three instances shipped for months:
//
//   pro_site_scan       called `pro_crawl_robots_check` and six others; the registry has
//                       `pro_fetch_robots_check`               -> 0/7 steps
//   pro_data_pipeline   called `pro_data_csv_stats` and eight others; the registry has
//                       `pro_fetch_csv_stats`                  -> 1/5 steps
//   pro_repo_audit      called `pro_sec_ossv_query` and `pro_sec_secret_scan`; there is no
//                       `pro_sec_*` prefix at all               -> 2 steps silently missing
//
// The pattern is a missing `fetch_` infix, and nothing caught it: 306 tests all passed, because none
// of them asked whether a name a composite reaches for is a name that exists.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import '../src/loader.js';
import { allTools } from '../src/core/tool.js';

const registered = new Set(allTools().map((tool) => tool.name));

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (full.endsWith('.ts')) found.push(full);
  }
  return found;
}

describe('internal tool references resolve', () => {
  it('every pro_ name used as a string literal is a registered tool', () => {
    const unknown: string[] = [];

    for (const file of sourceFiles('src')) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((raw, index) => {
        // Strip trailing comments, and skip template literals: `pro_fetch_${x}` is a name under
        // construction, not a reference to a tool that should exist.
        const code = raw.replace(/\/\/.*$/, '');
        if (code.includes('`')) return;
        // A prefix in `.replace(/^pro_fetch_/, '')` is a namespace, not a tool.
        for (const match of code.matchAll(/\bpro_[a-z0-9_]{6,}\b/g)) {
          // No capture group, so the whole match is the name.
          const name = match[0];
          if (registered.has(name)) continue;
          // A trailing underscore is a namespace prefix being stripped, as in
          // `toolName.replace(/^pro_fetch_/, '')` - a pattern, not a reference to a tool.
          if (name.endsWith('_')) continue;
          unknown.push(`${file}:${index + 1} references ${name}`);
        }
      });
    }

    expect(unknown).toEqual([]);
  });

  it('the smart profile composites reach tools that exist', () => {
    // The three that were broken, named explicitly so a regression names itself.
    const composites: Array<[string, readonly string[]]> = [
      [
        'pro_site_scan',
        [
          'pro_fetch_robots_check',
          'pro_fetch_sitemap_read',
          'pro_fetch_crawl_site',
          'pro_fetch_extract_metadata',
          'pro_fetch_extract_tables',
          'pro_fetch_broken_links',
          'pro_fetch_link_graph',
        ],
      ],
      [
        'pro_data_pipeline',
        [
          'pro_fetch_csv_to_json',
          'pro_fetch_json_to_yaml',
          'pro_fetch_csv_stats',
          'pro_fetch_text_stats',
          'pro_fetch_language_detect',
        ],
      ],
      ['pro_repo_audit', ['pro_fetch_security_package_advisories', 'pro_fetch_security_secret_scan_files']],
    ];

    const missing: string[] = [];
    for (const [composite, referenced] of composites) {
      for (const name of referenced) {
        if (!registered.has(name)) missing.push(`${composite} -> ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
