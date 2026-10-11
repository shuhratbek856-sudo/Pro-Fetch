// One-off follow-up: with rows typed as `Record<string, unknown>`, TypeScript now correctly
// rejects reading nested API fields (`x.user.login`, `c.commit.author.date`, `f.commit.sha`).
// Each site is rewritten to use `pathStr()`/`pathNum()` from `core/input.ts`, which read the
// same value but coerce safely and default when the field is absent — the behaviour the
// untyped code relied on, now explicit and checked.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve('src/tools/github');

/** `[file, [search, replace], ...]` */
const REWRITES = [
  [
    'code_search.ts',
    [
      [
        "'- **' + x.repository.full_name + '** - ' + x.path",
        "'- **' + pathStr(x, 'repository.full_name') + '** - ' + pathStr(x, 'path')",
      ],
    ],
  ],
  [
    'commits_list.ts',
    [
      [
        "'- ' + c.sha.slice(0, 7) + ' ' + (c.commit?.author?.date ?? '') + ' - ' + (c.commit?.message ?? '').split('\\n')[0]",
        "'- ' + pathStr(c, 'sha').slice(0, 7) + ' ' + pathStr(c, 'commit.author.date') + ' - ' + pathStr(c, 'commit.message').split('\\n')[0]",
      ],
    ],
  ],
  [
    'commit_read.ts',
    [
      [
        "'- ' + f.filename + ' (+' + f.additions + '/-' + f.deletions + ')'",
        "'- ' + pathStr(f, 'filename') + ' (+' + pathNum(f, 'additions') + '/-' + pathNum(f, 'deletions') + ')'",
      ],
    ],
  ],
  [
    'issues_list.ts',
    [
      [
        "'- #' + i.number + ' [' + i.state + '] ' + i.title",
        "'- #' + pathNum(i, 'number') + ' [' + pathStr(i, 'state') + '] ' + pathStr(i, 'title')",
      ],
    ],
  ],
  [
    'issues_search.ts',
    [
      [
        "'- #' + i.number + ' [' + i.state + '] ' + i.title",
        "'- #' + pathNum(i, 'number') + ' [' + pathStr(i, 'state') + '] ' + pathStr(i, 'title')",
      ],
    ],
  ],
  [
    'issue_read.ts',
    [
      [
        "(r.json.labels ?? []).map((l: JsonRow) => l.name).join(', ')",
        "asRecordArray(r.json.labels).map((l) => pathStr(l, 'name')).join(', ')",
      ],
    ],
  ],
  [
    'issue_comments.ts',
    [
      [
        "'**' + c.user.login + '** (' + c.created_at + '):\\n\\n' + clipToTokens(c.body ?? '', 800)",
        "'**' + pathStr(c, 'user.login') + '** (' + pathStr(c, 'created_at') + '):\\n\\n' + clipToTokens(pathStr(c, 'body'), 800)",
      ],
    ],
  ],
  [
    'issue_timeline.ts',
    [
      [
        "'- ' + e.event + ' - ' + (e.actor?.login ?? '') + ' (' + e.created_at + ')'",
        "'- ' + pathStr(e, 'event') + ' - ' + pathStr(e, 'actor.login') + ' (' + pathStr(e, 'created_at') + ')'",
      ],
    ],
  ],
  [
    'prs_list.ts',
    [
      [
        "'- #' + x.number + ' [' + x.state + '] ' + x.title + ' (' + x.user.login + ')'",
        "'- #' + pathNum(x, 'number') + ' [' + pathStr(x, 'state') + '] ' + pathStr(x, 'title') + ' (' + pathStr(x, 'user.login') + ')'",
      ],
    ],
  ],
  [
    'pr_reviews.ts',
    [
      [
        "'- **' + v.user.login + '** [' + v.state + '] ' + (v.body ? clipToTokens(v.body, 400) : '')",
        "'- **' + pathStr(v, 'user.login') + '** [' + pathStr(v, 'state') + '] ' + (pathStr(v, 'body') ? clipToTokens(pathStr(v, 'body'), 400) : '')",
      ],
    ],
  ],
  [
    'pr_review_comments.ts',
    [
      [
        "'- **' + c.user.login + '** `' + c.path + ':' + c.line + '` - ' + clipToTokens(c.body ?? '', 300)",
        "'- **' + pathStr(c, 'user.login') + '** `' + pathStr(c, 'path') + ':' + pathNum(c, 'line') + '` - ' + clipToTokens(pathStr(c, 'body'), 300)",
      ],
    ],
  ],
  [
    'pr_files.ts',
    [
      [
        "'- ' + f.filename + ' (+' + f.additions + '/-' + f.deletions + ')'",
        "'- ' + pathStr(f, 'filename') + ' (+' + pathNum(f, 'additions') + '/-' + pathNum(f, 'deletions') + ')'",
      ],
    ],
  ],
  [
    'repo_file_blame.ts',
    [
      [
        "'- ' + c.sha.slice(0, 7) + ' (' + (c.commit?.author?.name ?? '') + ') - ' + (c.commit?.message ?? '').split('\\n')[0]",
        "'- ' + pathStr(c, 'sha').slice(0, 7) + ' (' + pathStr(c, 'commit.author.name') + ') - ' + pathStr(c, 'commit.message').split('\\n')[0]",
      ],
    ],
  ],
  [
    'repo_file_history.ts',
    [
      [
        "'- ' + c.sha.slice(0, 7) + ' ' + (c.commit?.author?.date ?? '') + ' - ' + (c.commit?.message ?? '').split('\\n')[0]",
        "'- ' + pathStr(c, 'sha').slice(0, 7) + ' ' + pathStr(c, 'commit.author.date') + ' - ' + pathStr(c, 'commit.message').split('\\n')[0]",
      ],
    ],
  ],
  [
    'repo_tree.ts',
    [
      [
        "(t.type === 'tree' ? '?? ' : '?? ') + t.path",
        "(pathStr(t, 'type') === 'tree' ? '?? ' : '?? ') + pathStr(t, 'path')",
      ],
    ],
  ],
  [
    'tags_list.ts',
    [
      [
        "'- ' + t.name + ' (' + t.commit?.sha?.slice(0, 7) + ')'",
        "'- ' + pathStr(t, 'name') + ' (' + pathStr(t, 'commit.sha').slice(0, 7) + ')'",
      ],
    ],
  ],
  [
    'branches_list.ts',
    [
      [
        "'- ' + b.name + (b.protected ? ' U0001f512' : '')",
        "'- ' + pathStr(b, 'name') + (b.protected ? ' U0001f512' : '')",
      ],
    ],
  ],
  [
    'repo_commit_activity.ts',
    [
      [
        "'- hafta ' + w.week + ': ' + (w.total ?? 0) + ' commit'",
        "'- hafta ' + pathNum(w, 'week') + ': ' + pathNum(w, 'total') + ' commit'",
      ],
    ],
  ],
  [
    'repo_compare.ts',
    [
      [
        "'- ' + f.filename + ' (+' + (f.additions ?? 0) + '/-' + (f.deletions ?? 0) + ')'",
        "'- ' + pathStr(f, 'filename') + ' (+' + pathNum(f, 'additions') + '/-' + pathNum(f, 'deletions') + ')'",
      ],
    ],
  ],
  [
    'repo_directory_read.ts',
    [
      [
        "(r.json ?? []).filter((e: JsonRow) => e.type === 'file').slice(0, 20)",
        "asRecordArray(r.json).filter((e) => pathStr(e, 'type') === 'file').slice(0, 20)",
      ],
    ],
  ],
];

let changed = 0;
let missed = [];
for (const [name, pairs] of REWRITES) {
  const file = path.join(ROOT, name);
  let text = await readFile(file, 'utf8');
  const before = text;
  for (const [from, to] of pairs) {
    if (!text.includes(from)) {
      missed.push(`${name}: pattern not found`);
      continue;
    }
    text = text.replace(from, to);
  }
  // Ensure the helpers are imported from core/input.
  const needsPath = /pathStr|pathNum|asRecordArray/.test(text);
  if (needsPath && !/pathStr|pathNum|asRecordArray/.test((text.match(/^import .*core\/input\.js.*$/m) ?? [''])[0])) {
    const existing = /^import \{ ([^}]+) \} from '(\.\.\/\.\.\/core\/input\.js)';$/m.exec(text);
    const helpers = ['pathStr', 'pathNum', 'asRecordArray'];
    if (existing) {
      const names = existing[1]
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean);
      const merged = [...new Set([...names, ...helpers])].join(', ');
      text = text.replace(existing[0], `import { ${merged} } from '${existing[2]}';`);
    } else {
      const lines = text.split('\n');
      let last = -1;
      for (let i = 0; i < lines.length; i++) if (/^import .*;$/.test(lines[i])) last = i;
      lines.splice(last + 1, 0, `import { ${helpers.join(', ')} } from '../../core/input.js';`);
      text = lines.join('\n');
    }
  }
  if (text !== before) {
    await writeFile(file, text, 'utf8');
    changed++;
  }
}
console.log(`rewrote ${changed}/${REWRITES.length} file(s)`);
for (const m of missed) console.log('  MISS ' + m);
