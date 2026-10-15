# Implementation Status

> This file is the agent's memory across context loss. It is written to disk, not held in context.
> Update it after every completed work item.

**Last updated:** 2026-10-14

## Scope Actually Covered (read before claiming more)

The request was "strengthen all 500+ tools". Status as of this increment, measured:

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

- **Phase:** Smart System strengthening + verification-integrity repair
- **Active task:** None. Smart System increment complete; `npm run check` green end to end.
- **Blocked on:** nothing

## Prior State (superseded)

- **Phase:** Product-readiness hardening (round 4)
- **Active task:** Revert the OCR worker pool — it costs process stability for latency on a rarely used tool
- **Blocked on:** nothing

## Resume Instruction

> Read `docs/DECISIONS.md` for reasoning, then continue the action below.

**Next exact action:** pick the next unstrengthened category, audit before editing, one category per
increment:

```powershell
cd C:\Users\user\Downloads\pro-fetch\pro-fetch-mcp
node scripts/verify-registry.mts   # confirm 572 and read per-category counts
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
