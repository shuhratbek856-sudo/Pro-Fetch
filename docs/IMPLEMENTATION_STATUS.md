# Implementation Status

> This file is the agent's memory across context loss. It is written to disk, not held in context.
> Update it after every completed work item.

**Last updated:** 2026-10-18

## Scope Actually Covered (read before claiming more)

Registered tools: **672**. Categories: **42**. Tests: **936** across **42** files. Packaged files: **556**.
`npm run check` exit 0.

This increment: two new categories, each built so the measurement could fail.

### `qr` — 9 tools, Reed-Solomon over GF(256) and a real encoder

The tables are checked against computed geometry rather than trusted: every version/level row must
have `data + EC codewords` exactly equal to the symbol's codeword capacity. That check found **19
transcribed rows that could not fit** (Q version 7 claimed 244 codewords against a capacity of 196),
and they were removed rather than patched from memory. Measured ceilings per level: L 1-21, M 1-20,
Q 1-6, H 1-10. `maxVersion()` is 6 because it is the version every level covers, and it is computed
from the tables so a row added later raises it.

Two geometry defects were found the same way and are worth recording because both produced a
self-consistent wrong answer:

- `ALIGNMENT_CENTRES` was missing its version-1 entry, shifting the whole table. Version 6 reserved 8
  alignment patterns instead of 2 and computed a capacity of 158 where the standard needs 172.
- The data-module reading order dropped column 0 entirely, because strips were stepped
  (`right -= 2`) rather than built from the right edge. Version 1 held 200 data modules (25 codewords)
  where the standard's table says 26.

`decodeMatrix` reads level and mask *from the matrix* rather than accepting them as arguments. A
reader told the answer is not a reader — that is what would let an encoder bug hide behind a passing
round trip. The tool output states plainly that a round trip does not prove a scanner reads the
symbol; no camera path exists.

### `sql` — 11 tools, a real lexer and a risk classification

A lexer rather than a regex, because the interesting part of SQL is what is *not* a keyword: `''`
inside a string, a quoted identifier that is not the keyword it spells, a dollar-quoted body hiding
semicolons, a nested block comment. Each of those splits a statement in the wrong place if the reader
gets it wrong, and `pro_sql_split` proves it does not by counting them.

The formatter's safety property is asserted rather than stated: format, tokenize, compare the token
streams. Measured across 10 statements including a PostgreSQL function body and a string containing a
semicolon.

Six real defects were found while building it, all by measurement:

| Defect | Measured consequence |
|---|---|
| Schema/alias ambiguity resolved by adjacency, not pattern | `FROM users u` reported schema `users` with name `u` |
| `INSERT INTO t (a, b)` skipped the table with the column list | `INSERT INTO logs (a, b) VALUES (1,2)` reported zero tables |
| CTE hid the real verb | `WITH x AS (DELETE FROM t RETURNING *)` classified as a read |
| Depth counted before the first paren | `SELECT a FROM t` reported depth 1 |
| `?` placeholders keyed on text | every `?` received the first `?`'s value |
| `PARAMETER_GAP` required a `?` to be present | a purely numbered query was never checked |

### Prior increment: audit round 2

14 confirmed defects fixed, 2 refuted, 1 documented limitation unchanged.

- Registered tools: **572**. Tool source files: **395** under `src/tools/`.
- **`npm run audit:schema`: dead properties 54 -> 0, empty `required` 46 -> 0** (excluding 8
  verified `OPTIONAL_BY_DESIGN` listing tools whose every argument is an optional filter).
- 49 GitHub tools, 13 data/admin/docs tools and the schema module behind them were changed.
- The other ~380 tool files are untouched. That work is real and is still open.

Two thirds of the 572 are deliberately skipped by the audit and are not part of the debt:

- **419** sit in `CATEGORY_SCHEMA_CATEGORIES`, whose schemas `applyCategorySchema` rewrites at load
  time, so the source file is not the schema.
- **20** are delegating handlers that forward the whole `input` to `runIntegrationTool`, so nothing
  they declare is unreachable.

What was actually wrong, beyond schema noise:

| Defect | Measured | Fixed |
|---|---|---|
| GitHub tools declaring a 17-property block copied from siblings | 40 of 49 read <= 3 of them; 529 dead | per-tool `ghSchema([...])` |
| `inputSchema.required` never enforced at dispatch | `{}` reached GitHub and returned 404 | `assertRequiredPresent` in the central guard |
| `text2` declared "for diff" and ignored | 11 data tools | 7 implemented, 4 removed (no coherent diff) |
| `detail` declared and never read | 3 composites | `capability_map` +49%, `capability_call` -91% |
| `section` declared and never read | `w3c_spec_read` | `extractSection` implemented |

## Current State

- **Phase:** Defect sweep by measurement — hunting real gaps, refuting presumed ones
- **Active task:** None. The MexaPlan/SmartToDo/MaxEffort tools were removed on request and the code returned to its exact previous state; the specification and the agent working rules remain as documents. `npm run check` green end to end.
- **Blocked on:** nothing except `pro_research_deep`, which is upstream (Serper quota / Medium bot protection)

## Prior State (superseded)

- **Phase:** Smart System strengthening + verification-integrity repair
- **Active task:** None. Smart System increment complete; `npm run check` green end to end.
- **Blocked on:** nothing

## Resume Instruction

> Read `docs/DECISIONS.md` for reasoning, then continue the action below.

**Next exact action:** the next credential-free category. The rule learned building `qr` and `sql` is
what to carry over: find an *independent* check the data must satisfy, because a round trip only proves
self-consistency. `qr` used geometry; `sql` used token preservation.

```powershell
cd C:\Users\user\Downloads\pro-fetch\pro-fetch-mcp
node scripts/verify-registry.mts   # confirm 672 and read per-category counts
```

Start with the largest untouched categories (`github` 49, `browser` 41, `convert` 30). Re-run
`npm run check` after each. Do **not** batch a whole category with a scripted find-and-replace:
that is what corrupted `src/server.ts`, `src/core/media-tools.ts` and two test files (see Known
Regressions).

## Workstreams

Status legend: `NOT_STARTED` / `IN_PROGRESS` / `DONE` / `BLOCKED` / `SKIPPED`

| # | Workstream | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | Content reuse: fetch once, read real markup | DONE | `tests/content-reuse.test.ts` 26 tests; live Wikipedia 15/16 steps | Static guard confirms the raw-source invariant |
| 2 | Conditional steps (content gates) | DONE | plain page 6/16 steps; gate count always reported | |
| 3 | Deduplication with per-step labels | DONE | 6 identical steps → 1 dispatch, 6 distinct labels | |
| 4 | Composite coverage (8 empty categories, 182 tools) | DONE | `npm run measure:coverage` → 373/571 static + 3 dynamic executors | 571/571 reachable |
| 5 | Process resilience (4 process-killers) | DONE | `tests/resilience.test.ts` 12 tests | tesseract/ws/batch, each guarded |
| 6 | Windows npm resolution (9 tools dead) | DONE | `npm list` OK, license report 592 packages | `npm-cli.js` via `process.execPath` |
| 7 | SQLite without a system binary | DONE | clean install and `--ignore-scripts` both verified | `SQLITE_UNAVAILABLE` when neither engine runs |
| 8 | Consistent `repo` specifier both formats | DONE | `tests/repo-specifier.test.ts` 10 tests | Traversal still rejected segment-by-segment |
| 9 | Concurrent download coalescing | DONE | `ingest` 15 steps → 1 request, live | In-flight only; nothing retained |
| 10 | Ready-to-send discovery payload | DONE | `capability_map` names the right executor | Test asserts every named tool exists |
| 11 | Publish | DONE | `pro-fetch-mcp@0.3.0` live on npm (`latest` tag); install test passed — boots with `smart` profile, 10 tools | npmjs.com/package/pro-fetch-mcp |
| 12 | Credentialed tools against live APIs | IN_PROGRESS | GitHub 4/4 + Serper live OK; matrix v2 running with real args | v1 used a fake `owner/repo` → 55 false 404s |
| 13 | OCR worker pool | DONE | Reverted — see D-003 | 14.9× figure recorded, not implemented |
| 14 | Linux / macOS (+ Alpine degraded) | DONE (config) | Workflow validated by parse; macos added; Alpine fixed | Runs on push; this env is Windows-only |
| 15 | CI reliability (Node 24 teardown) | DONE | `npm run check` 8/8 + 4/4 after flag (was 5/10) | `dangerouslyIgnoreUnhandledErrors` + guard |
| 16 | Upstream JSON decoding | DONE | 29 sites via `parseUpstreamJson`; 6/6 live public APIs OK | Found live via GDELT |
| 17 | Provider failure messages | DONE | Redirect loops name bot protection; `gist_id` fails fast | Found by the credential matrix |
| 18 | Credentialed matrix (real args, `.env` loaded) | DONE | 92 work / 36 correct refusals / 33 arg gaps / 0 unexplained | v1's 55 were all bad test args |
| 19 | GitHub repo + README | DONE | Public repo `shuhratbek856-sudo/Pro-Fetch`, 24 commits on `main`, bilingual README; temp scripts + 5.2 MB `eng.traineddata` removed (commit 9d406eb) | Pushed via GCM browser auth — the fine-grained PAT can read but not push (measured 403) |
| 20 | Smart System: argument inference | DONE | `src/core/argument-inference.ts`; `tests/smart-system-strengthened.test.ts` | `inferId`, `inferQuery`, `inferArguments` |
| 21 | Smart System: result synthesis | DONE | `src/tools/admin/pro_synthesize.ts`; smart profile 10 -> 11 | Findings / contradictions / gaps |
| 22 | Smart System: nested composition | DONE | `MAX_COMPOSITE_DEPTH = 3` in `capability_call.ts` | Depth guard tested |
| 23 | Verification integrity (false-pass repair) | DONE | `scripts/run-tests.mjs`; retry proven not to mask failures | D-004 |
| 24 | **Strengthen the remaining ~390 tool files** | **NOT_STARTED** | Measured above | The actual outstanding scope |
| 24 | **Schema precision, github category** | DONE | `audit:schema` dead 529 -> 0; `tests/github-schema.test.ts` 12 tests | `src/tools/github/_schema.ts` |
| 25 | Required-argument enforcement | DONE | `assertRequiredPresent`; `{}` now fails locally, never reaches GitHub | Central, in `github-input-guard.ts` |
| 26 | `text2` / `detail` / `section` declared-but-unimplemented | DONE | 7 comparisons live, 4 params removed, 2 detail knobs live, `extractSection` live | 0 dead properties |
| 27 | **Remaining ~380 untouched tool files** | **NOT_STARTED** | Measured above | Not yet audited for non-schema defects |

## Measured Counts

Recompute with a real command. Exclude dependency directories, build output, caches, and VCS internals.

| Category | Count | Command used |
|---|---:|---|
| Registered tools | 572 | `npm run verify:registry` |
| Tool source files | 395 | `Get-ChildItem src\tools -Recurse -Filter *.ts` |
| Tool files changed this increment | 5 | `git diff --name-only -- src/tools/` |
| Tool files changed this increment | 65 | `git diff --name-only -- src/tools/ \| Measure-Object` |
| Schema audit: dead properties | 0 | `npm run audit:schema` (was 54, 529 in github) |
| Schema audit: empty required | 0 | `npm run audit:schema` (was 46) |
| Tools audited inline | 133 | `npm run audit:schema` (419 padded, 20 delegating skipped) |
| Source files (src/) | 439 | `node scripts/verify-static.mjs` (source_files) |
| Schema helper | `src/tools/github/_schema.ts` | `ghSchema(keys, required)` |
| Test files | 16 | `npm test` (runner enforces the count) |
| Tests | 278 | `npm test` -> `TEST_RUN_PASS files=17 tests=278` |
| Tests | 267 | `npm test` -> `TEST_RUN_PASS files=16 tests=267` |
| Commits | 26 | `& 'D:\Git\cmd\git.exe' log --oneline \| Measure-Object` |
| Real TODO/stub | 0 | `Select-String 'TODO\|FIXME\|NOT_IMPLEMENTED'` minus `Todoist` |

## Verification Log

Only real runs. A command with no output is not a pass.

| Date | Command | Result | Notes |
|---|---|---|---|
| 2026-10-12 | `npm run check` | PASS | 239 tests, 15 files, 4 verifications |
| 2026-10-13 | `npm run check` ×8 after vitest flag | 8/8 PASS (was 5/10) | Control: failing assertion still exits 1 |
| 2026-10-13 | `npm publish` | PASS | `+ pro-fetch-mcp@0.3.0`, `latest` tag; install test: BOOT OK (smart, 10 tools) |
| 2026-10-12 | `npx vitest run` × 10 at HEAD | 0 crashes / 10 | Baseline before the worker pool |
| 2026-10-12 | `npx vitest run` × 10 with worker pool | 4 crashes / 10 | Regression introduced by this change |
| 2026-10-12 | `npx vitest run tests/<file>` for every file alone | 0 crashes | Only manifests in combination |
| 2026-10-12 | `isolate: true` added to vitest.config | 3 crashes / 8 | Did not fix it |
| 2026-10-12 | `afterAll(shutdownOcrWorkers)` | 2 crashes / 6 | Did not fix it |
| 2026-10-12 | `await worker.terminate()` | 4 crashes / 10 | Tesseract itself does not await it |
| 2026-10-12 | Fuzz: 572 tools × 18 hostile inputs | 10,278 calls, 0 crashes | 153 s |
| 2026-10-12 | Decoder sweep: 25 tools × 7 payloads | 175 pairs, 0 bad outcomes | |
| 2026-10-12 | `npm pack` → clean install → MCP probe | 572 tools, 10/10 protocol | |
| 2026-10-12 | `npm install --ignore-scripts` | 572 tools load; SQLite reports `SQLITE_UNAVAILABLE` | |
| 2026-10-12 | SSRF / traversal / SQL-write probes | all BLOCKED | |
| 2026-10-12 | OCR on canvas-rendered "HELLO" | found, confidence 96, 239 ms first call | |
| 2026-10-12 | OCR pooled second call | 16 ms — 14.9× | The win being traded away |
| 2026-10-12 | `npm publish --dry-run` | PASS | 247.3 kB, 443 files, prepublish tests ran |

## Known Regressions

| What broke | Detected by | Status |
|---|---|---|
| `src/server.ts` identifiers mangled (`a`->`l`: `StdioServerTrlnsport`, `clllTool`) | `npm run check` -> `verify:static` reported missing process guards | RESOLVED - restored from git, single-string replace used instead |
| `src/core/media-tools.ts` corrupted (binary diff) | `git diff` showed `Bin` for a `.ts` file | RESOLVED - restored from git |
| `tests/all-tools.test.ts` + `tests/advanced-runtime.test.ts` lost `expect(listTools(` (esbuild "Transform failed") | `npx vitest run` reported 2 failed suites | RESOLVED - restored from git, edited with exact-match tool |
| A run that stopped after 22% of its assertions reported PASS | Crash truncated the fork; `dangerouslyIgnoreUnhandledErrors` suppressed the non-zero exit | RESOLVED - flag removed, `scripts/run-tests.mjs` enforces completeness |

### Root cause of the corruption above

A PowerShell helper written as `foreach ($pair in $pairs) { $t.Replace($pair[0], $pair[1]) }` was
called with a flat `@('a','b')` instead of an array of pairs. `$pair` then became a *string*,
and `$pair[0]` / `$pair[1]` indexed **characters**. The result was a whole-file single-character
substitution applied by string `.Replace()`. Three source files and two test files were damaged
this way before the cause was found.

Rule that follows from it: use the exact-match edit tool for repository files. Never write a
find-and-replace helper in a shell and never let it operate on a whole file.

### The teardown crash - remeasured

Still an environment fault, not project code, but now handled rather than hidden:

| Change | Aborts per 10 runs | Full runs (16 files / 267 tests) |
|---|---:|---|
| Baseline `forks` + `singleFork: true` + masking flag | 4 | 0 - the flag reported truncated runs as green |
| `forks` + `singleFork: true`, flag removed | 1 | 4/5 |
| `forks` + `isolate: true` | 3 | 3/6 |
| `threads` pool | 0 | 9/9, but 1 test fails: `process.chdir()` is thread-incompatible |
| **`forks` + `singleFork: false` (shipped)** | **0** | **10/10** |

`pool: 'forks'` is kept because `tests/product-readiness.test.ts` calls `process.chdir()`.
`scripts/run-tests.mjs` retries up to 3 times, and **only** on the native-abort signature with
zero failed assertions, so a real failure can never be retried into a pass. Verified by injecting a
failing assertion: result was `attempts: 1`, no retry.

## Session Log

Newest last. Record what changed on disk, not what was discussed.

### Session 26 - Smart System strengthening + verification repair

Files changed:

- `src/core/argument-inference.ts` (new) - `inferId` (arXiv/DOI), `inferQuery` (prefix-stripping),
  `inferArguments` (task vs query vs id kept distinct)
- `src/tools/admin/pro_synthesize.ts` (new) - composite that groups findings, contradictions, gaps
- `src/tools/admin/capability_map.ts` - `suggested_call` now pre-fills inferred arguments
- `src/tools/admin/capability_call.ts` - nested composition with `MAX_COMPOSITE_DEPTH = 3`
- `src/tools/admin/index.ts`, `src/core/profile.ts` - registration; smart profile 10 -> 11
- `src/tools/github/repo_full_clone.ts` - failure now names the requested ref (found by a real
  network flake in `provider-failures.test.ts`, where "fetch failed" hid which ref was tried)
- `scripts/run-tests.mjs` (new) - refuses to pass a truncated run; retries only on the native abort
- `vitest.config.ts` - removed `dangerouslyIgnoreUnhandledErrors`; `singleFork: false`
- `scripts/tool-counts.json` - 572 / admin 24 / profiles 11,73,178,572 / `testFiles`, `testCount`
- `package.json` - `test` and `test:coverage` route through the runner
- `tests/smart-system-strengthened.test.ts` (new) - 25 tests
- `tests/all-tools.test.ts`, `tests/advanced-runtime.test.ts` - counts updated to measured values

Verification, all real runs:

| Command | Result |
|---|---|
| `node scripts/verify-static.mjs` | `STATIC_VERIFICATION_PASS` |
| `npx tsx scripts/verify-registry.mts` | `REGISTRY_VERIFICATION_PASS registered=572; categories=26; smart=11` |
| `npm test` x10 | 10/10 `TEST_RUN_PASS files=16 tests=267` |
| injected failing assertion | `TEST_RUN_FAIL`, `attempts: 1` - retry correctly declined |
| `npm run check` | exit 0 - static, registry, build, tests, package, format all pass |

Not done: the ~390 untouched tool files. See the scope note at the top.


## Session Log (continued)

### Session 27 - Tool strengthening, increment 1 (github + dead-parameter sweep)

Files:

- `src/tools/github/_schema.ts` (new) - `ghSchema(keys, required)`, 18-property vocabulary, `additionalProperties: false`, build-time guards for unknown keys
- `src/tools/github/*.ts` - 49 files moved off the pasted 17-property block
- `src/core/github-input-guard.ts` - `assertRequiredPresent` added
- `src/core/text-comparison.ts` (new) - `measureOrCompare`, `hasSecondText`
- `src/tools/data/*.ts` - `text2` implemented in 7, removed in 4
- `src/tools/docs/w3c_spec_read.ts` - `extractSection` implemented
- `src/tools/admin/capability_map.ts` and `capability_call.ts` - `detail` now reads
- `scripts/audit-schema.mts` (new) - the measurement, kept; `npm run audit:schema`
- `tests/github-schema.test.ts` (new) - 12 tests
- 3 one-off migration scripts written, used, then deleted (no-ops afterwards)

Two findings worth remembering:

1. `inputSchema.required` is a declaration to the MCP client and nothing enforces it. Calling `pro_gh_repo_readme` with `{}` reached GitHub and returned 404. Presence checking belongs in `assertRequiredPresent`, centrally - not in 28 handlers, which is where it went first and had to be removed again.
2. Routing `detail` through `detailMode` silently stripped schemas from every `capability_map` call, because "unset" and "summary" became one state. `tests/smart-system-quality.test.ts` caught it. Raw `p.detail` is compared instead.

Verification, all real runs:

| Command | Result |
|---|---|
| `npm run audit:schema` | `with_dead_properties=0 with_required_empty=0` |
| `npx tsc --noEmit` | exit 0 |
| `npm test` | `TEST_RUN_PASS files=17 tests=278` |
| `npm run check` | exit 0 - static, registry, build, tests, package, format |

Not done: ~380 untouched tool files, and no non-schema audit of the 419 padded or 20 delegating tools yet.


### Session 28 - Delegating + padded tool audit (required arguments)

What the audit found, all by calling the tools rather than reading the schemas:

| Defect | Scale | Fix |
|---|---|---|
| `inputSchema.required` enforced nowhere | 552 tools now guarded centrally | `core/required-arguments.ts` |
| `required: ['text','target_lang']` on 6 i18n tools that never read `target_lang` | i18n | per-tool map |
| `script_convert`/`transliterate` read `to_script`, declared only `target_lang` - silent no-op | 2 tools | declare aliases; refuse a language code |
| `to_script`/`from_lang`/`to_lang`/`html` accepted by code, absent from schema | 4 properties | added to shared vocabulary |
| `required: ['url']` on 6 apitest tools; 5 also take inline content | apitest | per-tool map, `anyOf` where alternative |
| `openapi_try` sat after `bodyFor`, so calling an endpoint demanded a spec document | 1 tool | branch hoisted above `bodyFor` |
| `required: ['url']` on 15 media tools that also take `base64` | media | `anyOf` |
| `crawl_pause_resume` requires `url`; `controlCrawlJob` reads `job_id`/`action` | 1 tool | corrected |
| `link_graph` requires `url`; it reads `pages` | 1 tool | corrected |
| `release_watch` describes `url` as an alternative to `repository`, then requires `url` | 1 tool | `anyOf` |

Two errors of my own, both caught by tests rather than by review:

1. Presence checking ran *before* the github guard, so the documented `repo: "owner/name"` form looked
   like a call missing `owner`. `tests/repo-specifier.test.ts` caught it. Order reversed.
2. Requiring `target_script` broke the `to_script` alias, and the script is optional anyway
   (`convertScript` defaults to latin). `tests/handler-regression.test.ts` caught it.

Audit scope also corrected: the first version skipped 419 padded tools, and the second reported
552 audited. `scripts/tool-source-map.mts` now follows one delegation hop, so a tool whose handler
is `return controlCrawlJob(input)` is measured against `controlCrawlJob`, not against its own stub.

| Command | Result |
|---|---|
| `npm run check` | exit 0 - static, registry, build, 18 files / 292 tests, package, format |
| `npm run audit:schema` | audited 552, with_dead_properties=0 |
| npx tsc --noEmit | exit 0 |


### Session 29 - Audit resolution: four resolver bugs, one real defect

Triaging the numbers from session 28 turned out to be mostly the measurement, not the code.
`with_unread_required` walked 31 -> 20 -> 2 -> 1 and the last one was real.

| Resolver bug | False findings it caused |
|---|---|
| helper calls not followed (`runGit` -> `requireConfirmation`) | every `confirm` requirement |
| delegation pattern required the arg list to be exactly `(input)` | 14 crawl tools |
| a file defining two tools resolved both names to the first | `pro_pr_review` |
| handler body ran to end of file, not to its matching brace | any multi-tool handler |

Real defect found at the end of that chain: `pro_fetch_export_bundle` declared `required: ['url']`
while exporting the whole cache and never reading `url`. It now takes an optional `prefix` that
filters cache keys, and the filter is implemented rather than declared.

**`with_unread_required = 0` across all 552 audited tools.**

Still open, and deliberately not touched this increment:

| Measure | Count | Why it is not a defect to fix blindly |
|---|---:|---|
| `with_dead_properties` | 179 | comes from `CATEGORY_SCHEMA_PROPERTIES`, a deliberate per-category vocabulary. `browser` alone is 41 tools each declaring the full browser vocabulary. Narrowing it is a redesign of the published schema, not a bug fix. |
| `with_required_empty` | 132 | likely mostly listing tools where every argument is an optional filter, like the 5 already allow-listed. Needs triage per category. |

Browser measured, not fixed: 26 of its 41 tools route through `runBrowserAction(input)`, which needs
an `action` argument, and 15 through `runBrowserTool(name, input)`, which switches on the name. A
derivation script confirmed only 11 branches of `runBrowserTool` exist, so 4 of the 15 share a
fall-through. That work is next and was not started.

| Command | Result |
|---|---|
| `npm run check` | exit 0 |
| `npm run audit:schema` | audited 552, unread_required=0 |


### Session 30 - Browser investigated, and found to have no defect

The plan was to narrow the browser vocabulary from 41 tools down to the fields each reads. Measured
first, and the measurement says there is nothing to fix:

| Measure (41 browser tools) | Count | Verdict |
|---|---:|---|
| `unread_required` | 0 | no required argument is wrong |
| `required_empty` | 38 | correct: verified by calling them, e.g. `pro_browser_browser_back` with `{}` fails with "Browser session 'default' yo'q" - a real runtime condition, not an argument error |
| `dead_properties` | 41 | the deliberate `CATEGORY_SCHEMA_PROPERTIES` vocabulary |

The dead properties are the only finding, and they come from a named, intentional per-category
vocabulary rather than a copy-paste. Narrowing them is a redesign of the published schema and would
change what callers may send, so it needs a product decision, not a bug fix.

A derivation script was written to build the per-tool table from the code, and was **discarded
unapplied**: it reproduced the branch logic faithfully but missed declarations that sit *between* branches
(`const selector = string(input, 'selector')` is on the line before `if (name === 'browser_click')`), so
its output would have removed `selector` from a tool that cannot work without it. Shipping a generator
that produces a confidently wrong table is worse than shipping none, and applying one without full
confidence is exactly the unverified change this project forbids.

What a future pass needs: gap reads between branches resolved, then the table applied only after every
tool's current `required` list is verified to survive it.

| Command | Result |
|---|---|
| `npm run check` | exit 0 - static, registry, build, 18 files / 292 tests, package, format |
| `npm run audit:schema` | audited 552, unread_required=0 |


### Session 31 - category vocabulary narrowed, then the resolver fixed behind it

The user asked for the ~328 tools that had not been strengthened. The measurable defect across
them was `CATEGORY_SCHEMA_PROPERTIES`: every tool in a category declared the same ~20-property
vocabulary and each read one to five. With `additionalProperties: false` that padding invites a caller
to send arguments the tool cannot honour, and nothing in the schema says which are real.

| Measure | Before | After |
|---|---:|---:|
| tools declaring >= 1 property their code never reads | 179 of 552 | **0** |
| `unread_required` | 0 | 0 |
| tools with neither `required` nor `anyOf` that still demand an argument | 1 of 123 | **0 of 123** |
| average properties per tool (572 tools, 2724 total) | not measured | 4.8 |

`src/core/schema-narrowing.ts` runs once from `loader.ts` and drops a category property when the
tool's resolved source never reads it. `src/core/source-resolver.ts` does the resolving, and getting it
right took four corrections, each found by asking what a tool does rather than by reading it:

- **grouped branches.** `runMediaTool` dispatches with `if (name === 'a' || name === 'b' || ...)`. A pattern
  anchored on `name === 'x')` matched none of a group, leaving 11 of 15 media tools on the whole runner.
- **gap declarations through a helper.** A dispatcher may resolve its input once before branching -
  `const media = await bytesFromInput(input)` - and that is where `base64` is read.
- **a brace in a return type.** `bytesFromInput(...): Promise<{ bytes: Buffer; ... }>` - the signature pattern
  `[^{]*\\{` took the *type literal's brace as the function body. An intermediate attempt allowed one
  level of braces in the type; it failed on `Promise<{ a: { b: string } }>` and broke 59 tools' required
  properties, so a scan replaced it rather than an extension of it.
- **a module-local reader.** `gapReads` knew only the shared input helpers; `bytesFromInput` calls `str`,
  which is local to `media-tools.ts`.

Two findings were real, not measurement:

| Tool | Advertised | Actually | Fix |
|---|---|---|---|
| `pro_fetch_screenshot_page`, `..._full_page` | `base64` | the branch drives a browser and returns before `bytesFromInput`; base64 answered "Noma'lum media tool" | require `url` |
| `pro_fetch_collab_jira_*` (7 tools) | - | `base` read only from `JIRA_BASE_URL`, and the refusal said `MISSING_INPUT: 'base'`, naming an argument it never read | accepts `base`, error names both sources |

Also corrected: all 30 convert tools stated one five-way `anyOf` across two different source readers
(`readTextSource` takes text/content/data/url, `readBinarySource` takes base64/url), so each advertised
alternatives it cannot read. Verified by calling every tool with every alternative it advertises:
100 calls, 100 accepted. `AUTH_TOOL_PROPERTIES` suppressed the union with each tool's own declarations,
so `pro_fetch_bearer_fetch` lost `body` and `max_chars` although it reads both; and its `anyOf`
advertised `bearer_token`, which only `runIntegrationTool` reads - sending it failed.

**Environment note, not a clean run:** the first `npm run check` after the jira change failed with 9 vitest
worker timeouts (`Timeout calling fetch ... ssr`), 97 of 304 tests completing, **zero** failed. The
immediate re-run passed 19/19 files and 304 tests. That is the Node 24 + vitest 2.1.9 `forks` flakiness
already recorded in docs/DECISIONS.md, but it is an observation rather than a clean pass.

| Command | Result |
|---|---|
| `npm run check` | exit 0 - static, registry, build, 19 files / 304 tests, package, format |
| `npm run audit:schema` | audited 552 - dead 0, unread_required 0, required_empty 117 |
| `git` | 21cf6cb |

`required_empty = 117` is now measured, not assumed: all 123 candidates were called with `{}`. 55 stop
on a real precondition (`CREDENTIAL_MISSING`, `CONFIRMATION_REQUIRED`, no session) which a schema
correctly does not describe; the remaining 68 do work. Zero demand an undeclared argument.

Files: 444 under `src` (396 tool files), 19 test files, 16 scripts.


### Session 32 - closed schemas, and the inputs they were hiding

The previous session left one arm of the audit unbuilt: `undeclaredReads`, the inverse of the
dead-property check. A dead property misleads a caller; an undeclared read means a caller
**cannot** supply it, and with `additionalProperties: false` the call is rejected.

It reported 275 tools. Four categories it pointed at (`data`, `admin`, `http`, `docs`) had never
been in `CATEGORY_SCHEMA_CATEGORIES`, so `applyCategorySchema` never ran for them and
**83 schemas stayed open** - any extra argument accepted and ignored, so a typo like `max_tokns`
was indistinguishable from a correct one.

Closing them was only safe where a tool declares everything its code reads, and that is what the
arm measures. Real gaps found and fixed first:

| Tool | What it could not express |
|---|---|
| `pro_fetch_fetch_url` | `max_tokens` - the response was cut at 8 000 tokens, unchangeable |
| `pro_fetch_fetch_graphql` | `variables` - a query could not be parameterised at all |
| `pro_fetch_fetch_soap` | `action` - sent as `SOAPAction`, unroutable |
| `pro_fetch_diff_json` | `other`, the fallback second value |
| 13 github tools | `max_pages`, validated by `assertGithubInput` for every github tool |
| `pro_repo_audit` | `include_ci`, `include_security` - whether those sections run |
| `basic_auth_fetch`, `bearer_fetch` | `timeout_ms`, `max_bytes` - fixed values |
| 10 research tools | `topic`, the alias `value(input, 'query', 'topic')` accepts |
| 22 crawl tools | `include` / `exclude` / `pattern` / `urls` via the shared `runCrawlTool` |
| media tools | `mime_type`, returned by `bytesFromInput` |

Four `max_pages` additions were then removed again - `actions_runs`, `code_search`, `repo_search`
and `repo_file_history` do not read it, and the audit flagged them as dead the moment they were
added. Measurement is what kept that from shipping.

**The arm's own false positives were fixed, not worked around.** A bare array of strings was read
as a list of input keys, so the guard in `runCrawlTool` - a list of the four actions
`pause`, `resume`, `stop`, `list` tested with `includes` - marked all four as undeclared on all 22
crawl tools. Key lists are now recognised only inside a call that receives `input`.

| Measure | Before | After |
|---|---:|---:|
| open schemas | 83 | **0 of 572** |
| tools with an undeclared read | 275 | 234 |
| tools with a dead property | 0 | **0** |
| `unread_required` | 0 | 0 |

The 234 remaining are dominated by the nine SPECS packs and the shared browser and crawl
dispatchers, where per-tool resolution is not available. Two benign classes are known and recorded
rather than counted as clean:

- `default`, from `string(input, 'session_id', 'default')`, where the literal is a fallback value
  rather than a key. Syntactically indistinguishable from a key list.
- `user_agent` on media tools, which reaches them because the resolver follows a helper name into
  `browser-tools.ts`. It errs towards a wider schema, not a narrower one.

Also measured and found clean this session: no `TODO` / `FIXME` / `NOT_IMPLEMENTED` anywhere in
`src/tools`, no handler body under 25 characters, and a sweep of all 572 tools for error messages
that name an argument the tool does not declare - 12 hits, every one a false positive of the
pattern, since the matches were Uzbek words.

Files: 444 under `src` (396 tool files), 19 test files, 16 scripts. 74 tool files and 88 `src`
files changed since 482a8e8. 572 tools, 2 933 properties, 5.1 per tool, all 572 schemas closed.

| Command | Result |
|---|---|
| `npm run check` | exit 0 - static, registry, build, 19 files / 306 tests, package, format |
| `npm run audit:schema` | audited 552 - dead 0, unread_required 0, open_schemas 0, undeclared 234 |
| `git` | ef9a801 |


### Session 33 - SPECS per-tool resolution attempted, and reverted

The user asked for the remaining work to be finished, which is the 200 SPECS and composite tools:
nine packs registered without a file each, one dispatcher per pack. Every session so far recorded
them as "not per-tool verified", and this session was the attempt.

What was built, and it partly worked:

- `specCoordinates()` in `max-platform-tools.ts` exposing each tool's category, provider and action
  from the registration, rather than parsing the name. That was the right call on its own merits -
  `collaboration` registers `pro_fetch_collab_*`, so splitting a name on underscores guesses wrong
  for every such pack.
- `resolveSpecBranch` splitting a runner by provider (`if (provider === 'gitlab')`) then by action
  (`switch (action)`), carrying the preamble, because `runGit` reads `cwd`, `path`, `limit`,
  `revision` and `branch` before it branches.
- Two real resolver bugs found on the way: a `switch` case pattern that let one brace match span
  several brace-less cases, so `git_status`, `git_diff`, `git_log` and `git_blame` all resolved to
  identical source; and a fallback that only recognised cases whose body starts with `return`, which
  missed every case that opens with a guard - `case 'branch_create': ensureMutationAllowed(i, ...);
  return await run([...])`. Fixing both took the git pack from 15 dead properties and 14 unread
  required down to zero.

Then it was reverted, because it produced a source that was not the tool's source. Asking it for
`pro_fetch_collab_slack_post_message` returned a jumble: the preamble, a fragment of an unrelated
type annotation, `getCredential`'s body, `resolveSecretPath`'s body - and **not** the
`ensureMutationAllowed(i, 'Slack postMessage')` line that is the second statement of the case. The
audit then reported `confirm` as unread for four collaboration tools and three productivity tools it
had just read a moment earlier.

That is the failure mode this project forbids: a measurement that looks sharper while quietly being
wrong, used to justify edits. Reverted `src/core/source-resolver.ts` and
`src/core/max-platform-tools.ts` to `ef9a801`.

Restored state, re-measured:

| Measure | Value |
|---|---:|
| `with_dead_properties` | 0 |
| `with_unread_required` | 0 |
| `open_schemas` | 0 |
| `with_undeclared_reads` | 234 |

What the 234 are, stated plainly: for the nine SPECS packs the resolver returns the whole runner, so
every string literal in it - `'npm'`, `'audit'`, `'confirm'`, `'redis_arg'` - is counted as an input
key. They are not 234 proven defects and they are not 234 proven absences. They are 234 places where
this project has not yet looked properly.

What finishing it needs, which is why it is not a matter of trying again: `runCollaboration`,
`runProductivity` and `runCodehost` nest a `switch (action)` inside each `if (provider === ...)`
branch, and their case bodies are brace-less multi-statement blocks. Slicing those correctly means
tracking statement boundaries inside a switch, not brace matching - the same distinction that made
`functionsIn` need a scan for the body's opening brace. That is a separate piece of work, and until
it is done the honest statement is that the SPECS packs are declared but unverified.

| Command | Result |
|---|---|
| `npm run check` | exit 0 - 19 files / 306 tests |
| `npm run audit:schema` | audited 552 - dead 0, unread_required 0, open_schemas 0, undeclared 234 |
| `git` | reverted to ef9a801, working tree clean |

### Session 34 - MAX mode: capacity raised, containment untouched

Reported from real use of the smart profile: `pro_site_scan` 0/7, `pro_data_pipeline` 1/5,
`pro_repo_audit` refusing the argument its own description invites, `pro_research_deep` 13/18 and then
refused outright. Then: read every file in a repository, and lift every limit.

**Composites referenced tool names that do not exist.** `pro_site_scan` called `pro_crawl_robots_check`
(six more like it, `fetch_` missing); `pro_data_pipeline` called `pro_data_csv_stats` (nine more);
`pro_repo_audit` called `pro_sec_ossv_query`, and no `pro_sec_` prefix exists at all. A wrong name
answers "Nomalum tool" while the composite still returns `isError: false` and reports every step FAILED
- the caller is told the scan succeeded and the numbers say 0/7. Two more found by scanning every
string literal against the registry: `URL_OR_TEXT_TOOLS` listed `pro_fetch_audit_page` when the tool is
`pro_audit_page`, so the audit page never received its url-or-text alternative; and
`ARCHIVE_TOOL_PROPERTIES` listed `pro_fetch_cache_delete`, which does not exist.

`pro_repo_audit` also had its schema and handler disagreeing outright - schema required `owner` and
`repo`, handler read only `repository`, so neither spelling worked. Now an `anyOf` over both, plus
`repo` in `owner/repo` form as the other 48 tools allow.

`pro_research_deep` required `topic` while the other 23 research tools require `query`, and the handler
already read both. The read step then failed on `max_bytes`: measured, Google's own RAG page is 2.16 MiB
against a 2 MiB ceiling. Raised to 8 MiB, and `readTextSource` gained `allowTruncated`, which
`html_to_text` enables because stripping markup over a cut-off response still yields the text that
arrived - stated in the output, not swallowed. Off by default, because a partial CSV parse is wrong
data rather than less data.

**The 50-call batch cap was not what its comment claimed.** The comment said it existed so one call
could not fan out and exhaust the process; `runParallel` fans out 8 at a time and the engine's
semaphores govern the rest, so a batch of 500 was never 500 simultaneous requests. What it bounded was
the response, which is one MCP message. Now `PRO_FETCH_MAX_BATCH`, default 5 000. Measured at a ceiling
of a million: 964 calls, 952 succeeded, 24 s, 22 KB summary.

**Then the real restriction turned up:** every `boundedEnv` call carried a *maximum* as well as a
default, so `PRO_FETCH_MAX_CONCURRENCY=1000` against a ceiling of 256 was silently discarded. Raising
the default alone would have changed nothing at all. Ceilings raised; measured simple 100000 -> 4096,
max -> 100000.

**MAX mode** (`src/core/mode.ts`, D-008): simple stays the default and unchanged; MAX lifts capacity to
9 999 999 999, chunks a large batch instead of fanning it out, and refuses above
`PRO_FETCH_MAX_SELF_SERVE` (99 999) until the caller states `confirm_large_batch: true` - which it can
only do after the user has agreed. Network containment is untouched, verified by probing SSRF,
protocol, credentials-in-URL and metadata addresses **with MAX mode on**: 6/6 blocked in both modes.
`PRO_FETCH_MAX_PER_HOST_CONCURRENCY` is held in MAX mode and named as the one exception, because it
bounds requests to a *third party's* server.

| Command | Result |
|---|---|
| `npm run check` | exit 0 - 21 files / 328 tests |
| `pro_site_scan` via `dist/server.js` | 7/7 steps ok, FAILED=0 (was 0/7) |
| `pro_data_pipeline` with real CSV | 4/5 (was 1/5); the fifth is a real refusal, not an unknown tool |
| `pro_repo_audit` | 17/17 ok, all three argument spellings |
| `pro_research_deep` | 17/17 steps (was 13/18, then refused outright) |
| batch at ceiling 1 000 000 | 964 calls, 952 ok, 24.4 s, 22 KB |
| SSRF probes, simple and MAX | 6/6 blocked in both |

**Unresolved:** news 429 (Serper quota) and Medium 403 (bot protection) are upstream answers, not
defects here. The SPECS packs from Session 33 remain declared but unverified.

### Session 35 - MAX mode enabled; tool expansion to 1000 planned

User enabled MAX mode and asked for deep internet research plus a sorted set of tools to reach 1000.

**MAX mode switched on** in `.env`: `PRO_FETCH_MODE=max`. Verified through the live MCP path, not
in-process - `pro_capability_call` with `mode: "max"`, `confirm_large_batch: true`, and
`detail: "full"` returned real results for 10 concurrent web searches.

**Measured the baseline** rather than trusting the manifest: 572 tools across 26 categories,
`minimal` 73 / `standard` 178 / `smart` 11 / `full` 572.

**Answered the batch question with a measurement, not an assurance.** With `confirm_large_batch: true`,
a batch still does not go out at once: `PRO_FETCH_BATCH_CHUNK` awaits each chunk before starting the next.
Proved it by timing - 20 real HTTP requests at `PRO_FETCH_BATCH_CHUNK=1` took 11.38 s, which is
sequential. Also stated the limit honestly: 9 999 999 999 is a *ceiling*, not a plan. At the measured
~446 req/s it is ~260 days; with `chunk=1` at ~0.57 s per request it is ~180 years, and a
`detail: "full"` response would be ~50 TB. The ceiling is generous; the ceiling is not infinity.

**One unfixed finding:** a fetched README came back truncated at ~32 KB regardless of `max_bytes`
(8 MB requested, 32 185 bytes returned, and only 3 headings parsed out of a document with dozens).
`readTextSource` is not the limiter - the value passed through. The cap is somewhere downstream, most
likely the MCP result envelope. Not yet located.

**Research that grounded the gap analysis** (read, not assumed): Knit MCP advertises 10 000+ tools
across HRIS, ATS, CRM, Accounting, Calendar, Meeting, Ticketing - none of those seven verticals exist
here. Firecrawl's 2026 list names GitHub, Vercel, Linear, Notion, Supabase, Stripe, Figma as the hosted
default. MapTiler-class geospatial (geocoding, reverse geocoding, static maps, elevation) has no home in
any of the 26 categories. apis.io's industry taxonomy treats weather, geospatial, finance, healthcare,
legal, education, travel, jobs and real estate as separate industries; Pro-Fetch has one thin `search`
category spanning all of them.

**Plan written** to `docs/TOOL_EXPANSION_PLAN.md`: 430 new tools in four tiers, `llm` first because
embeddings and reranking are inputs to `research`, `knowledge` and `vector`. Two category boundaries
(`geo_data` vs `maps`, `finance` vs `finance_data`) are flagged as likely wrong and should be settled
before implementation rather than after 80 tools sit on the wrong side of them.

| Command | Result |
|---|---|
| `npm run check` | exit 0 - 21 files / 333 tests (before this session's doc changes) |
| profile inventory, measured | minimal 73, standard 178, smart 11, full 572 |
| `mode:"max"` + 10 searches via MCP | ok, real results |
| 20 requests, `PRO_FETCH_BATCH_CHUNK=1` | 11.38 s - sequential, confirmed |
| 200 requests, chunk 1000 | 0.4 s (446 req/s) |
| awesome-mcp-servers README | truncated at 32 185 bytes - unresolved |

**Next exact action:** implement Wave 0 - `src/tools/llm/`, 26 tools. First file
`src/tools/llm/index.ts` exporting the category, then providers under `src/tools/llm/providers/`.
Run `npm run audit:schema` before declaring the wave done; a new category that ships schemas which do
not match their handlers reproduces the exact defect class that cost three composites their steps.
### Session 36 - llm (577) and encoding (586); credential-free first

MAX mode on (`PRO_FETCH_MODE=max` in `.env` - gitignored, so it does not appear in commits). Measured
through the live MCP path rather than in-process: 1 000 calls 0.1 s, 5 000 calls 0.4 s, 20 000 calls
1.3 s in one invocation; 100 000 refused without `confirm_large_batch`, which is the designed
behaviour. Also measured that a large batch is queued, not fanned out: 20 real HTTP requests at
`PRO_FETCH_BATCH_CHUNK=1` took 11.38 s.

Called out for writing a plan and calling it work. Correct, and the correction is the two categories
below rather than another document.

**`llm`, 572 -> 577.** `src/core/llm-gateway.ts` plus `src/tools/llm/`. Chat, completions, embeddings,
provider status, model comparison. Anthropic and OpenAI differ more than in field names, so both shapes
are handled in the gateway and a caller writes one message list; Ollama's `/api/embeddings` is a third
shape and is folded into the same tool.

**`encoding`, 577 -> 586.** `src/tools/encoding/tools.ts`. Base32/58/85, JWT decode and verify,
punycode, HTML entities, URL, UUID v4/v7, ULID/nanoid/KSUID.

The lesson worth keeping: credential-free categories can be *verified*, so they go first. A category
behind an API key cannot be exercised until someone holds that key, and every claim about it would
have been an assertion.

Six defects found, four of them mine:

  - `JSON.parse` on a network body; the project requires `parseUpstreamJson`
  - nine dead properties from a shared `PROVIDER_PROPERTIES` block
  - a `llm` category vocabulary that put `model`/`timeout_ms`/`max_chars` on `pro_llm_providers`,
    which reads no input; the category is now listed with an empty vocabulary
  - an error message naming `pro_llm_ollama_embed` before anything implemented it
  - hand-written punycode encoded "münchen" as "mnchen-to0" instead of "mnchen-3ya"; replaced with
    `domainToASCII`
  - Ascii85 emitted the partial-group form instead of Adobe's padded form, so every input whose length
    was not a multiple of four failed to round-trip

| Command | Result |
|---|---|
| `npm run check` | exit 0 - 21 files / 333 tests |
| `npm run audit:schema` | `with_dead_properties=0`, `open_schemas=0`, `with_unread_required=0` |
| `npx tsx scripts/verify-registry.mts` | registered=586; categories=28; smart=11; unique_names=586 |
| encoding round-trips | 30/30 across 3 alphabets x 10 lengths |
| punycode | 5/5 hosts, round-trip and the known value |
| JWT verify | valid, invalid, and refused-without-key all correct |

**Next exact action:** `src/tools/schema/` - JSON Schema validate, coerce, infer, generate, OpenAPI
generate, `$ref` resolve. Six tools, pure JS, no dependency, and immediately testable the way `encoding`
was. Then `src/tools/document/` on `pdf-lib` (merge, split, rotate, watermark, form fill, metadata)
and `src/tools/imageproc/` on `sharp`.

**Not buildable without a new dependency**, named so it is a decision rather than an omission: Parquet,
Arrow, Avro, Protobuf, MessagePack, CBOR.
### Session 37 - schema category (586 -> 592)

Asked, in effect, for every credential-free tool. `schema` is pure JS with no dependency, so it can be
verified end to end the way `encoding` was - which is the reason both went first and the reason the
remaining credential-free work should follow the same shape.

  src/tools/schema/tools.ts   validate, coerce, infer, generate, openapi, ref

Four defects, all found by measuring:

  - `value` was returned raw instead of parsed, so every instance failed its `type` check and a schema
    with no errors in it reported one.
  - `properties.length` on an object is undefined, so every generated TypeScript interface was
    `[key: string]: unknown` - which type-checks and then rejects every attribute the caller used.
  - Arrays were unwrapped before validation, so `minItems`, `maxItems`, `uniqueItems`, `items` and
    `contains` never ran. Those keywords were silently dead.
  - The audit called `value` a dead property while `pro_schema_infer`, reading the same keys, was not
    flagged. The difference: one read it through a module-local helper. The audit resolves property
    reads from the handler body and does not follow a helper. Both are inline now.

Also: `schema` was absent from `CATEGORY_SCHEMA_CATEGORIES`, so its six schemas were never closed.
A PowerShell edit had reported success on an anchor that had not matched, and the value was never
written - which is the argument for checking the file after a scripted edit rather than trusting its
exit code.

| Command | Result |
|---|---|
| `npm run check` | exit 0 - 21 files / 333 tests |
| `npm run audit:schema` | `with_dead_properties=0`, `open_schemas=0`, `with_unread_required=0` |
| `npx tsx scripts/verify-registry.mts` | registered=592; categories=29; smart=11; unique_names=592 |
| schema keyword tests | required, type, pattern, minimum, minLength, minItems, uniqueItems, items all caught with paths |
| coerce | "30" -> 30, "1,5" -> 1.5, "ha" -> true |
| infer round-trip | inferred schema re-validates the sample |
| $ref | inlined; cycle detected |

**Next exact action:** `src/tools/document/` on `pdf-lib`, which is already installed: merge, split,
rotate, watermark, form fill, page extraction, metadata read/write. Then `src/tools/imageproc/` on
`sharp`. Both credential-free.

**Still needs a new dependency** and is therefore not started: Parquet, Arrow, Avro, Protobuf,
MessagePack, CBOR. That is a decision for the user, not an omission.
### Session 38 - document category written but NOT passing; tree left red and uncommitted

Asked again, third time, whether every credential-free tool has been created. Answer: no. Four
categories now exist that did not (llm, encoding, schema, document); the rest are not built.

**`document`, 592 -> 605.** 13 tools on pdf-lib, which is already installed: new, merge, split, rotate,
watermark, info, metadata read/write, form read/fill, remove pages, reorder, flatten, blank.

Functionally verified against real PDFs before anything else was checked - a PDF was created, then
reloaded and inspected with pdf-lib rather than trusted because the handler returned a path:

  pdf_new 3 pages -> reload shows 3
  pdf_rotate "1-2" 90 -> 1=90, 2=90, 3=0
  pdf_merge two 3-page PDFs -> 6
  pdf_metadata write -> reload shows the title and author
  pdf_remove_pages "2" -> 2 remain
  pdf_split every / "1,3" -> 3 files / 2 pages
  wrong page count, pages=9, and a corrupt PDF are all refused with a real error

**Four defects found and fixed while writing it:**

  - `required: ['url']` on seven tools while the handler also accepts `base64`. Passing only `base64`
    was refused. Now an `anyOf`, including the two-argument forms `['url','text']` and `['url','order']`.
  - `pdf.removePage` takes one index, not an array. Removing lowest-first shifts the indices above it;
    it now removes highest-first.
  - `output_name` on `pro_pdf_merge` was declared and never read. Removed - it was my own placeholder.
  - Junk left in `pro_pdf_info`: `void` statements and a `PDF_STRING` export kept "so the linter does
    not remove names the type map references". There was no such type map. Removed.

**Still broken - this is why nothing was committed.**

`npm run check` fails: `tests/schema-narrowing.test.ts` reports 34 dead properties, all of them
`url`, `base64` and `max_bytes` on the new tools, plus `with_unread_required=1` on `pro_pdf_form_fill`.

Cause: those properties are read inside `readBinarySource(input, label)`, a helper in another module.
The audit resolves property reads from the handler body and does not follow the helper - the same
limitation that made `value` look dead in `pro_schema_validate` during Session 37.

Three attempts, none sufficient:
  1. `restateConvertAlternatives` was gated on `tool.category === 'convert'`, so a new category built
     on `readBinarySource` was skipped. Gate changed to test the source for a reader call. Correct, and
     not sufficient.
  2. Added the reader's argument list to `readsPropertyStrictly`. Correct, and not sufficient.
  3. Added the same rule to `readsProperty`. Correct, and not sufficient.

So `scripts/audit-schema.mts` and/or `tests/schema-narrowing.test.ts` keep their own copy of the read
detection rather than importing the two functions in `src/core/schema-narrowing.ts`. Nothing here was
found by guessing - each failure was located by reading what the harness actually calls.

**Next exact action:** open `tests/schema-narrowing.test.ts` and `scripts/audit-schema.mts` and find the
`readsProperty` they import or re-implement. The fix is to have them use
`src/core/schema-narrowing.ts`'s version, which now knows what `readBinarySource` and `readTextSource`
read. Then re-run `npm run audit:schema` and `npm run check`; both must be clean before commit.

**Working tree state:** uncommitted, `npm run check` red. Manifest, both READMEs, package.json,
verify-static.mjs and three test files are already moved to 605. Nothing is pushed.

**Not built, credential-free, and available on what is installed:** `imageproc` on sharp (resize, crop,
convert, watermark, sprite, dominant colour), `geo_data` on OpenStreetMap/Nominatim/Overpass,
`govdata` on CKAN/data.gov/SEC EDGAR, plus `color`, `time`, `zip` and `science` in pure JS.

**Needs a dependency and so needs a decision:** Parquet, Arrow, Avro, Protobuf, MessagePack, CBOR.

### Session 38b - the split was attempted by script and reverted

Tried to split `document/tools.ts` into thirteen single-tool files with a script. The script produced
duplicated helper bodies in some files, missing `pdf-lib` imports in others, and a broken index. It
produced worse code than what it replaced, so it was reverted: the verified single-file version is back,
`tsc` clean, `npx tsx scripts/verify-registry.mts` PASS at 605 tools / 30 categories / smart 11.

The script was the wrong tool. Splitting means each file needs its own imports decided by what it
actually uses, and a regex cannot decide that - it duplicated `parsePages` into files that did not call
it and omitted `PDFDocument` from a file that did. Doing it by hand, thirteen small files, is the
correct approach and is not something to attempt in the last of the context.

Root cause of the original problem, confirmed by measuring rather than guessing:

    pro_pdf_split    length 2203   readBinarySource present: false   url present: false
    pro_pdf_rotate   length 1863   readBinarySource present: false   url present: false
    pro_pdf_merge    length 4059   readBinarySource present: true    url present: false

The resolver returns a truncated handler body for a file holding several tools. `pro_pdf_merge` escapes
it because its body is long enough to contain the call; the shorter ones do not. So `url`, `base64` and
`max_bytes` read inside `readBinarySource` are invisible, and all thirteen tools report them as dead.

**Next exact action:** split `src/tools/document/tools.ts` by hand into `merge.ts`, `split.ts`,
`rotate.ts`, `watermark.ts`, `info.ts`, `metadata.ts`, `form_read.ts`, `form_fill.ts`,
`remove_pages.ts`, `reorder.ts`, `flatten.ts`, `new.ts`, `blank.ts`, each with only the imports it uses,
plus an `index.ts` that imports them by name. Then `npm run audit:schema` must report
`with_dead_properties=0` and `npm run check` must exit 0 before anything is committed.

**Still red, still uncommitted:** `tests/schema-narrowing.test.ts` reports the dead properties above.
Everything else passes - static verification, registry verification, `tsc`, and the functional PDF tests.
### Session 39 - document split by hand, the helper rule, and the binary dependencies

`document` is green and committed. The audit's false positive is resolved and the rule behind it is
written into the code at each site.

Root cause, measured: the schema audit resolves property reads from the handler body and does not follow
a helper.

    pro_pdf_rotate   source length 1863   readBinarySource present: false
    pro_pdf_merge    source length 4059   readBinarySource present: true

`pro_pdf_merge` escaped because its body was long enough to contain the call. Splitting into one tool
per file fixed the truncation. Renaming `load` to `open` did not - it only moved the problem. Calling
`readBinarySource` directly in the handler body cleared it. Third occurrence of this exact shape after
`readInstance` in schema; the rule is now stated at each site instead of being rediscovered.

| Command | Result |
|---|---|
| `npm run check` | exit 0 - 21 files / 333 tests |
| `npm run audit:schema` | `with_dead_properties=0`, `open_schemas=0`, `with_unread_required=0` |
| `npx tsx scripts/verify-registry.mts` | registered=605; categories=30; smart=11; unique_names=605 |
| PDF functional tests | 14/14, each result reloaded with pdf-lib rather than trusted |

Installed at the user's request: `apache-arrow`, `@bufbuild/protobuf`, `avsc`, `parquet-wasm`. These are
dependencies only. No tool uses them yet, and the commit says so rather than implying otherwise.

A first split attempt was scripted and reverted - it duplicated helpers into files that did not call them
and omitted imports from files that did. A regex cannot decide imports. The second attempt worked
because the per-file dependency map was measured before writing anything.

**Next exact action:** `src/tools/imageproc/` on `sharp`, which is installed: resize, crop, convert,
watermark, sprite, dominant colour, thumbnail grid. One tool per file, each with `readBinarySource` called
directly in the handler body - not through a helper - from the first line rather than after a failure.

Then `geo_data` on OpenStreetMap/Nominatim/Overpass and `govdata` on CKAN/data.gov/SEC EDGAR, both
credential-free. Then `binary` on the four newly installed packages.
### Session 40 - the user's 13-item audit; four real defects fixed, three reported items were not real

A 13-item audit was supplied. Four items were real defects, three were not reproducible as reported, one
was my own test being wrong, two were already fixed, and two are upstream answers rather than code
problems. Every item was checked by calling the tool rather than by reading it.

Fixed and committed:

  - **#1 HIGH** `ollama` reported `ready: true` while `model: "ollama"` went to OpenAI and returned 401.
    `splitModel` now routes `provider/model` and a bare provider name, while leaving slash-containing
    model names (`meta-llama/Llama-3-8B`) on the default provider. Fixing the routing exposed a second
    false signal: the SSRF guard blocks loopback, so `checkProvider` now reports ollama not ready and
    names the guard. A status that does not predict the next call is worse than no status. `277b276`.
  - **#2 MEDIUM** `additionalProperties: false` was declared by every schema and enforced by none.
    240 of 605 tools accepted `totally_bogus_property` with `isError: false`, so a misspelled
    `max_tokens` produced a successful-looking result and no hint it was never read.
    `assertNoUnknownArguments` now runs beside `assertRequiredPresent`. Measured 365 rejected before,
    588 after; the remaining 17 declare no properties at all. The error names the intended key:
    `"max_tokns" -> "max_tokens"`. `204b766`.
  - **#8** `pro_gh_issues_search` failed on every call with `422 Query must include 'is:issue'`. The
    qualifier is now added unless the caller chose one, so `is:pr` still searches pull requests rather
    than being silently rewritten. `4bc37cb`.
  - **#7** `pro_gh_repo_directory_read` reported "0 fayl" for `src/tools`, which holds 23
    subdirectories and no files. Directories were filtered out without a word; they are now listed and
    the output distinguishes empty from unlisted.

Separately, `pro_fetch_security_license_report` returned `{count: 0}` without `cwd` and 601 with it.
`npm ls` prints `{}` and exits 0 in a directory with no package.json, so "no dependencies" and "wrong
directory" were indistinguishable. It now refuses and names the directory. `c2a55cf`.

Not real, and said so rather than credited:

  - **#3** `alg: none` is already refused with `Algoritm qo'llab-quvvatlanmaydi: none. HS256/384/512,
    RS*, ES*, EdDSA.`
  - **#4** `pro_gh_repo_file_read` returns full content for `package.json`.
  - **#5** `pro_gh_repo_full_clone` completes in 1.1 s. It downloads a tarball rather than cloning, so a
    30 s expectation does not match what the tool does.
  - **#6** `main`/`master` fallback works for three repositories including `torvalds/linux`.
  - **#9** my own test was wrong - it sent three different arguments to each tool at once, which the new
    enforcement correctly refused.

Still open: `global` was never a declared property of `pro_fetch_devops_npm_list`, so it was ignored in
silence. It is now refused, which is honest, but the flag still does nothing. Either implement it or
document its absence; neither is done.

| Command | Result |
|---|---|
| `npm run check` | exit 0 - 21 files / 333 tests |
| unknown-argument enforcement | 365/605 rejected before, 588 after |
| `pro_gh_issues_search` | 422 on every call before; plain, `is:pr` and `is:issue` all succeed now |
| `pro_gh_repo_directory_read` | `src/tools` reports 23 subdirectories instead of 0 files |
| `pro_fetch_security_license_report` | 601 packages with `cwd`; refuses with the directory named without it |

**Next exact action:** either implement `global` on the npm tools or record that it is unsupported, then
continue the credential-free categories - `imageproc` on sharp, `geo_data` on OpenStreetMap, `govdata`
on CKAN.

### Session 41 - the 198 unresolved tools, measured rather than assumed

Standing order: do not stop until every problem is fixed. Continuing.

I had described the SPECS packs as "declared but unverified" and called them the biggest remaining risk.
That was an overstatement, and this session measured it.

Measured: the resolver finds source for 407 of 605 tools and returns an **empty string** for 198. Those 198
are the SPECS pattern - one dispatcher per category where every tool calls `runX(input)` and the real
work sits in a `switch (action)`. Per-tool resolution needs statement-boundary tracking inside a switch,
which is the separate piece of work recorded in Session 33.

But source resolution is not the only evidence available, and the one that matters most needs no resolver
at all: call the tool. An empty call makes a tool name the arguments it demands, and an argument it
demands is an argument it reads.

    resolver topa olmagan: 198
    bo'sh chaqiruvda talab qilgan, hammasi sxemada:  129
    sxemada YO'Q kalit talab qilgan (defekt):         0

**Zero of 198 demand an argument their schema does not declare.** The remaining 69 ask for nothing on an
empty call, which is correct for the list and inspect tools they mostly are.

So the risk I named is real in principle - those 198 cannot be checked for dead properties, because
knowing which properties a `switch` branch reads requires resolving into the branch - and it is **not**
supported by evidence of a present defect. The distinction matters: unverified is not the same as wrong,
and I should not have written the first as though it were the second.

`--global` on the npm tools: forwarded and declared on the table-backed pair
(`pro_fetch_security_npm_audit`, `pro_fetch_security_npm_outdated`). The `devops` pair comes from the
SPECS packs, so its shape is among the 198 and is left alone rather than guessed at.

Correction carried forward: I reported 15 TODO markers in `max-platform-tools.ts`. There are none. The
grep matched the Todoist integration, and I read a service name as a code marker.

| Command | Result |
|---|---|
| `npm run check` | exit 0 - 21 files / 333 tests |
| resolver coverage | 407 of 605 sources resolved, 198 empty |
| empty-call probe on the 198 | 129 demanded arguments, 0 outside their schema, 0 defects |

**Next exact action:** `src/tools/imageproc/` on `sharp`, one tool per file, `readBinarySource` called
directly in the handler body. Then `geo_data` on OpenStreetMap/Nominatim/Overpass and `govdata` on
CKAN/data.gov/SEC EDGAR. Still unbuildable without a further decision: none - all seven remaining
credential-free categories now have what they need.

### Session 41-42 - imageproc, binary formats, and four classes of silent wrong answer

Standing order carried through both sessions: do not stop until every problem is fixed. Continuing.

**Counts (measured, not carried forward):** 605 -> 618 tools, 30 -> 32 categories, 22 -> 24 test files,
333 -> 373 tests. `npm run check` exit 0 at the end of each block.

| Category | Tools | Verified against |
|---|---:|---|
| imageproc | 9 | real pixels: resize read back through sharp, sprite frames counted in output, opacity read off the JSON |
| binary | 4 | a real `apache/parquet-testing` file, a hand-encoded Avro container, an apache-arrow IPC file, a hand-encoded FileDescriptorSet |

#### Four defects, one shape

Everything found in these sessions is the same failure: something went wrong and the interface reported
success. What changed is that this is now a *checkable* property rather than a lesson.

1. **`num()` floors.** `Math.floor(0.5) = 0`, and 0 is the "not supplied" fallback, so `brightness: 0.5`
   became "nothing was changed" with `isError: false`. Six silent no-ops across three tools were found by
   sweeping, not by fixing only the one that exposed it. `float()` now sits beside `num()` and the hazard
   is written at `num`'s definition, because `num(p, 'brightness', 0, -1, 1)` reads as ordinary clamping at
   the call site.
2. **A dependency that reported wrong answers.** `parquet-wasm` 0.9.0 returns `{__wbg_ptr: ...}` from
   `readMetadata` on Node 24; `num_rows` is `undefined` and the tool reported **0 rows for a file with 8**.
   Removed rather than kept "for later" - a broken dependency in `package.json` is worse than an absent
   one, because the next reader assumes the format is handled.
3. **A stream read before it flushed.** avsc's `RawDecoder` emits only once the writable side finishes;
   reading the count right after `write()` returns zero and looks like an empty block.
4. **Cyrillic homoglyphs in user-facing text.** Nine typos (`ёки`/`yoki`, `учун`/`uchun`,
   `kodеk`/`kodek` with U+0435). A sweep for `[\u0400-\u04FF]` separates the two legitimate Russian
   word lists from the mistakes.

#### Guard defects

Four guards could not fail correctly, and each failure was the guard's own staleness rather than real
drift:

    if (!readme.includes('606 MCP tool')) failures.push('README does not report 577 tools');
    if (countManifest.total !== 607)         failures.push('... expected 572');
    if (!/toBe\(606\)/.test(allToolsTest))     failures.push('does not assert 577 tools');

Three different numbers in three lines, each printed differently from the one it checked. All now read
from `tool-counts.json` or check that the test derives its count. The suite literals were the reason 606
survived in four assertions while the registry held 609: they were edited by hand, and a hand edit here
was a string `replace`, which rewrites only the first occurrence.

#### Tests that had to be rewritten, and why

- Two GitHub regressions moved to **offline** assertions against exported pure functions
  (`buildIssueQuery`, `renderDirectoryListing`). The live versions failed with `GitHub 403: API rate
  limit exceeded` (measured 0 of 60), which says nothing about the behaviour. Skipping was tried first
  and rejected: it converts a real failure into a green tick.
- `indexOf(composite) === -1` was replaced by a **ranking** assertion. Measured: with 605 tools the query
  returned one hit at 51.118; with 610, the same tool at 51.221 and the composite at 0.906 in second.
  Ranking improved and the test failed, because the old assertion tested absence from a five-slot
  window rather than the stated intent.
- `anyOf` had to be taught to `all-tools.test.ts` for the second time; a tool with `required: []` and an
  `anyOf` legitimately rejects `{}`.
- `pro_image_watermark` widths are asserted through `renderDirectoryListing`-style region matching after
  a `"width":` regex matched `source.width` instead - the assertion was testing the wrong field.

#### Corrections to my own claims

- "15 TODO markers in `max-platform-tools.ts" - there are none; the grep matched the Todoist integration.
- "SPECS packs are the biggest remaining risk" - overstated. Measured with an empty-call probe: 198
  tools unresolvable, 129 demand arguments on `{}`, **0** demand an argument outside their schema.
  Unverified is not the same as wrong.
- "All problems are fixed" - not true when said; six more were found afterwards, including three in the
  code written in the same session.
- `testFiles = 25` - fixtures were counted as tests. The real count is 24, now measured with
  `readdirSync` rather than typed.

#### Still open

- `pro_research_deep` 429/403 from third parties (Serper quota, Medium bot protection) - upstream, not
  a code defect.

Resolved on 2026-10-18 after measurement, and each resolution is worth recording because the item was
believed open and was not:

- **"Five credential-free categories not built"** was stale. `geo_data` (4), `color` (3), `time` (5) and
  `zip` (5) all exist and pass. Only `govdata` was genuinely absent and is now unnecessary: the
  `opendata` category (5) covers CKAN.
- **`global` on the `pro_fetch_devops_npm_*` pair** was stale and partly wrong. The flag lives on
  `pro_fetch_security_npm_audit` and `pro_fetch_security_npm_outdated`, and it *was* implemented - the
  handler appends `--global`. The real defect was that its schema declared `type: 'string'` with
  `description: 'global'` while the code's first branch tested `i.global === true`, so the natural
  value and `"yes"` and `1` were all silently ignored. Fixed: declared `boolean` with a 172-character
  description, and the type mismatch is now swept registry-wide.
- **Three thin descriptions** (`pro_fetch_xml_to_json`, `pro_gh_gist_read`, `pro_fetch_session_list`)
  were refuted by measurement rather than rewritten. BM25 discovery ranks each one in the **top 3** for
  its own natural-language query, and across a 96-tool sample the under-60-character descriptions found
  their tool exactly as often as the longer ones did (50/50 vs 46/46). The tool *name* carries the
  discriminating signal, so length is not what makes a description useful. Rewriting 334 terse
  descriptions on that basis would have been work done to no measured end.

| Command | Result |
|---|---|
| `npm run check` | exit 0 - 24 files / 373 tests, run five times across both sessions |
| `npm run audit:schema` | `with_dead_properties=0`, `open_schemas=0`, `with_unread_required=0` |
| `npm run verify:registry` | 618 registered, 32 categories, 11 smart, 618 unique names |
| imageproc functional probes | 7/7, 5/5, 12/12, 9/9, 12/12, 9/9, 9/9, 3/3 |
| binary functional probes | parquet 10/10, avro 11/11, arrow 11/11, protobuf 7/7 |
| `tests/binary-formats.test.ts` | 13/13 |
| `tests/float-hazard.test.ts` | 10/10 |
| GitHub anonymous quota | 0 of 60 - the reason two assertions moved offline |

**Next exact action:** `src/tools/geo_data/` on OpenStreetMap Nominatim and Overpass - both credential-free
and both reachable without a key. One tool per file, `readBinarySource` or the fetch path called directly in
the handler body, and every error path checked before the success path is written.

### Session 43 - MexaPlan/SmartToDo/MaxEffort: built, measured, then removed on request

Files changed:

- `docs/AGENT_WORKFLOW.md` (new) - the MexaPlan + SmartToDo + MaxEffort specification, copied
  byte-for-byte from the source document (46 903 bytes, 1 195 lines, verified identical).
- `AGENTS.md` (new) - the agent-facing working rules distilled from that specification: the mandatory
  flow, evidence-over-claims, the investigation-vs-modification scope split, stagnation recovery, and
  the security limits an agent may not cross.

Then, on the user's instruction, the implementation was removed and the code returned to its exact
previous state:

- `src/tools/agent/` (deleted) - `mexa_plan.ts`, `smart_todo.ts`, `max_effort.ts`, `plan_gate.ts`,
  `orchestrator.ts`, `index.ts`.
- `src/loader.ts` - the `import './tools/agent/index.js';` line removed.
- `src/core/tool.ts` - `'agent'` removed from `CATEGORY_SCHEMA_CATEGORIES`.

Verified, not assumed: `git diff --cached --stat` after `git add -A` lists **only** the two new
documents, so `src/loader.ts` and `src/core/tool.ts` are byte-identical to the previous commit.

Two defects were found and fixed while the tools existed, and both were caught by measurement rather
than by reading:

- `plan_gate.ts` declared `graph` as "Tekshiriladigraph" - a typo in the description a caller reads.
- The tool names were undiscoverable: BM25 tokenises `pro_agent_smart_todo` into "pro, agent, smart,
  todo", so a user asking to "audit my plan" got `pro_fetch_devops_npm_audit` and
  `pro_fetch_devops_terraform_plan_preview` instead, and "validate the task graph" got
  `pro_fetch_swagger_validate`. The names carry a 3x field boost in `intent-search.ts`, so a
  description change could not compete. Measured: `pro_agent_plan_gate` ranked #14 of 305 and
  `pro_agent_smart_todo` #16.

Profile switching was measured rather than assumed, because the first probe reported all four
profiles at 677 tools and that looked like a broken filter. It was a probe defect: `allTools()`
ignores the profile entirely, and the real filter is `listTools(profile)`. Measured with the correct
call: smart 11, minimal 73, standard 178, full 672 — monotonically increasing, every profile a
subset of `full`, `minimal ⊆ standard ⊆ full`, and `PRO_FETCH_PROFILE` read at module load in a
separate process gives the same count.

| Command | Result |
|---|---|
| `npm run check` | exit 0 - STATIC / TEST_RUN (44 files, 956 tests) / REGISTRY / PACKAGE |
| `npm run verify:registry` | `registered=672; categories=42; smart=11; unique_names=672` |
| profile-switch probe | smart 11, minimal 73, standard 178, full 672; monotonic, subset of full, ENV switch matches |
| `npx tsc --noEmit` | exit 0 |

**Next exact action:** the `agent` implementation is available as a branch-ready change if it is wanted
again; the specification it was built from is in `docs/AGENT_WORKFLOW.md` and the working rules in
`AGENTS.md`, both of which stand on their own without the tools.