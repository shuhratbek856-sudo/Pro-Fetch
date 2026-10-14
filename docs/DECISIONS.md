# Decisions

Each entry records what was chosen, why, and what was rejected. The rejected alternative is the
part that carries the reasoning.

---

## D-001: Composites must read the raw document, not a rendering of it

**Status:** accepted

### Context
Fetch-once made composites hand their extractors a *rendered* body: `pro_fetch_fetch_url` returns
markdown and `pro_fetch_html_to_text` returns text with the markup stripped. The extractors look for
markup a renderer removes — `<script type="application/ld+json">`, `<img alt>`, `itemtype`,
`hreflang` — so a page with a full structured-data block was reported as having none.

### Decision
`fetchSource()` in `src/core/composite.ts` performs one real request and returns the response body.
`audit_page`, `fetch_ingest` and `page_diff` all use it.

### Rationale
A false negative the model cannot distinguish from the truth is worse than an expensive one. It was
invisible: nothing errored, the transcript simply asserted the page lacked data it had.

### Rejected alternatives
- **Leave the conversion in place and document it.** Still reports false negatives; documentation
  does not help a caller reading a wrong answer.
- **Pass converted text to extractors that mention `text`.** Works only where the schema happens to
  accept it, which is not the set of tools that need markup.

### Consequences
Every extractor receives the complete document. `verify:static` asserts the invariant by file, and
reintroducing a rendering was confirmed to fail the check.

---

## D-002: Bytes are identified before any decoder sees them

**Status:** accepted

### Context
Leptonica, behind tesseract.js, rejects undecodable input *from its own worker thread*. That
rejection reaches the process as an uncaught exception, so no `try`/`catch` in the handler contains
it. Passing a PDF to an OCR tool terminated the server and took all 572 tools with it.

### Decision
`assertImagePayload()` checks signature *and* structure — a marker plus a terminator — before the
native library is called. It is applied at every entry point, including the shared `ocr()` helper.

### Rationale
There are three separate OCR tools in three files. Guarding the one that crashed first left its
siblings able to crash, so coverage is by decoder, not by the tool that happened to fail.

### Rejected alternatives
- **Signature check only.** Four bytes of PNG magic pass, and the native decoder then dies on them —
  the exact crash the check exists to prevent. Both truncated-file and wrong-type cases needed.
- **Catch the rejection.** It does not arrive as a promise rejection; it is a synchronous throw on a
  worker thread. Nothing in this process can catch it.

### Consequences
An undecodable payload now produces a typed error naming what was expected. Verified on a clean
install: `--ignore-scripts` does not break this path, because the input never reaches the decoder.

---

## D-003: Revert the OCR worker pool

**Status:** accepted

### Context
The documented "OCR runs sequentially" limitation was measured as false: four concurrent calls ran
3.9× faster than the same calls in sequence, and a canvas rendering of HELLO was read back at 96%
confidence. A worker pool was then built, taking a repeat call from 239 ms to 16 ms — 14.9×.

It appeared to make the suite crash, so the pool was reverted. That diagnosis was then disproved:
the reverted tree crashed 6/14 and 2/10, and a further 10 `npm run check` runs split 5 PASS / 5 FAIL.
The crash is a Node 24.21.0 teardown bug in a native module's cleanup hook, present before and after
the pool. See "Known Regressions" in `docs/IMPLEMENTATION_STATUS.md` for the isolation table.

### Decision
Revert to one worker per call, created and terminated inside the request. Record the measurement so
the latency win is known and not rediscovered as a "limitation".

### Rationale
The pool's 14.9× applies only to a caller issuing 2+ OCR calls in one process, and the smart profile
reaches OCR through `capability_call`, so the common path is one call per task. Trading an
unproven complication for a win on an uncommon path, while believing it fixed an unrelated failure,
was wrong in both directions.

### Rejected alternatives
- **Keep the pool and accept the flake.** The flake was never the pool's.
- **Await `terminate()`.** Already what the code does; 4/10, unchanged, and the fault is in Node.
- **`isolate: true`, `afterAll` teardown.** 3/8 and 2/6. Neither addressed it.
- **Fix the crash in tesseract's `terminateWorker`.** It discards `terminate()`'s promise, but our own
  `await` is correct and isolated: 0/15. The fix would require patching the dependency.

### Consequences
OCR keeps its per-call cost. The 14.9× figure is recorded if a future need justifies revisiting it,
and the crash is now attributed to the environment rather than to project code.

---

## D-004: Only concurrent downloads share; nothing is cached

**Status:** accepted

### Context
`pro_fetch_ingest` fans out fifteen steps, three of which need the original bytes — the PDF
converter, the CSV converter and the archiver. Each downloaded the same file, so one page cost
several identical requests to one host.

### Decision
`downloadToBuffer` coalesces requests that are already in flight, keyed on the URL *and* the byte
and time limits. The entry is removed in a `finally` block, so a failed download does not poison the
URL.

### Rationale
A retained cache would go stale and hold large buffers in memory. In-flight sharing gets the actual
win — a composite that needs one file three times — without either cost.

### Rejected alternatives
- **A TTL cache.** Staleness is the failure mode a model cannot detect: it would report an old price
  as current. The concurrent case is what actually happened, and it needs no retention.
- **Pass bytes as base64 to the converters.** Millions of characters of base64 flow through the
  arguments, the tool result and the usage stats, and it is what makes the composite slow rather than
  the request count.

### Consequences
Measured live: `pro_audit_page` 16 steps → 1 request; `pro_fetch_ingest` 15 steps → 1 request. A 1
MiB caller is never handed a concurrent 50 MiB request's buffer.

---

## D-005: `repo` accepts both `owner/repo` and a bare name

**Status:** accepted

### Context
All 42 GitHub tools and all 24 codehost tools document `repo` as "Repository nomi" with no format,
then require opposite shapes: GitHub's guard rejected `owner/repo` outright while the codehost tools
require it.

### Decision
Both forms are accepted. The combined form is validated segment by segment, and rewritten to
`owner` + `repo` in the guard that every GitHub call already passes through — so no handler was
touched. An explicit owner still wins over the prefix.

### Rationale
Segment-by-segment validation keeps the security property: allowing the separator cannot admit a
traversal, a leading slash, or an over-long path. `a/b/c`, `../etc/passwd`, `a/../../b` and
`/owner/name` are all still rejected.

### Rejected alternatives
- **Widen the regex to include `/`.** Would accept `a/b/c`, a route rather than a repository, and
  forward an unvalidated trailing segment into a URL.
- **Fix one tool's documents and leave the others.** The caller learns whichever tool they meet
  first; the inconsistency is the defect.

### Consequences
One format everywhere. `tests/repo-specifier.test.ts` asserts the rejection cases explicitly so the
widening cannot be reintroduced without that test failing.

---

## D-006: A failing command keeps its stdout
**Status:** accepted

### Context
`npm audit` exits 1 when it finds vulnerabilities — a finding, not a failure — and writes the report
to stdout. The error handler read only stderr, so the entire report was discarded and the caller got
`COMMAND_FAILED_1: Command failed:` with nothing after it. The message was 8 characters long.

### Decision
The error falls back to stderr, then stdout, then the generic message. A 1 MiB caller in the
coalescing key is kept separate from a larger one for the same reason: the bounds are part of what
was asked for.

### Rejected alternatives
- **Leave it.** The tool reported failure while the answer it was asked for was being thrown away.
- **Special-case `npm audit`'s exit code.** Treats the symptom for one command and leaves every
  other command that reports on stdout still broken.

### Consequences
The message grew from 8 characters to 1359, containing the actual findings. Any command that reports
on its standard output now keeps that output on failure.
## D-007: The suite ignores unhandled errors from native teardown

**Status:** accepted

### Context
Node 24.21.0 aborts in `node::RemoveEnvironmentCleanupHook` after the tests have passed: 5 red
exits in 10 full runs with all assertions green each time. Isolated probes attribute it to the
toolchain — a deliberately unterminated tesseract worker is 10/10, better-sqlite3 is 1/10 — and no
code change on this side moved the rate.

### Decision
`dangerouslyIgnoreUnhandledErrors: true` in `vitest.config.ts`, with the justification comment and
a `verify:static` guard that fails if the flag or its comment is removed.

### Rationale
Failing the build on that would make CI report the environment instead of the code. Real defects
still fail loudly: every tool call in the suite is awaited, so a handler that throws surfaces as a
failed assertion. Verified with a control test that asserts `1 === 2`: the run still exits 1.

### Rejected alternatives
- **Leave the flake.** A contributor cannot tell their breakage from the environment's, which is
  what happened here five times before the cause was isolated.
- **Split native tests into a separate run.** The crash is not tied to any file — each file alone
  is 0/N — so no split isolates it.
- **`pool: 'threads'`.** 0/10 passing. Worse in every direction.

### Consequences
`npm run check` went from 5/10 to 8/8 and 4/4 green. If the toolchain is fixed, the flag and its
guard come out together.

---

## D-008: One helper parses every upstream JSON body

**Status:** accepted

### Context
Providers answer throttling with a 200 and a non-JSON body. Parsing that blindly produced
`Unexpected token 'O'` — observed live against GDELT — which tells the caller nothing. The same
bare pattern existed in ~40 places.

### Decision
`parseUpstreamJson(response, provider)` in `src/core/json-response.ts` is the single decode path.
It names the provider, the status, the content type and the body preview. `verify:static` rejects a
bare `JSON.parse` on a network body anywhere else; the four remaining ones are listed in the test
because each is already guarded.

### Rationale
One message shape means the model learns one failure rather than forty wordings. Migrating by hand
per call site kept every type assertion intact — and exposed four places where the old code relied
on `any`, which now carry explicit types instead.

### Rejected alternatives
- **Fix only the tool that crashed.** The next provider to throttle would produce the next
  `Unexpected token`. Coverage by decoder, not by incident.
- **A scripted rewrite without review.** The three already-guarded call sites (`github_auth_status`,
  `fetch_api`, dockerhub's conditional) each needed a different touch; a blind rewrite broke two of
  them and the diff review caught it.

### Consequences
29 call sites migrated, 6/6 live public APIs verified, 6 unit tests. The old `any`-typed decodes in
the docs readers now have explicit shapes.

---

## D-009: A redirect loop says so, and a missing id fails before the network

**Status:** accepted

### Context
The credential matrix surfaced two failures that sent the caller after the wrong thing:
remoteok.com loops `/` back to `/` for unknown user-agents (bot mitigation), reported as a hop
count; and `gist_read` called `/gists/undefined` and reported the 404 as "gist not found".

### Decision
The redirect follower detects a revisited URL and reports the loop with the URL and the likely
cause. `gist_read` validates `gist_id` before any request.

### Rationale
Both failures sent the caller after the wrong thing - counting redirects, hunting a missing gist.
The fix is at the layer where the knowledge lives: the follower knows the chain, the tool knows its
required input.

### Rejected alternatives
- **Spoof a browser user-agent for remoteok.** Evading bot protection is not something this server
  does. The honest answer is to say access was refused.
- **Leave the hop message.** Accurate about the mechanism, wrong about the meaning.

### Consequences
Both covered by `tests/provider-failures.test.ts` against the live providers, plus a
`verify:static` guard on the loop detection.

---

## D-010: A repository without `main` still downloads

**Status:** accepted

### Context
`repo_full_clone` defaulted the branch to `main`. Half the public repositories still default to
`master` - octocat/Hello-World among them - so those failed with a 404 that read as "repository not
found". The credential matrix surfaced it as one of twelve unexplained failures.

### Decision
When no ref is requested, try `main` then `master`. An explicitly requested ref is honoured exactly
and never retried. The failure names the tried branches.

### Rationale
The retry costs one extra request and only on the failure path. Querying the repository metadata for
its default branch first would cost a request on *every* call, including the overwhelmingly common
`main` case.

### Rejected alternatives
- **Require `ref` always.** Breaks every existing caller that relies on the default.
- **Silently fall back even for an explicit ref.** An override means something; retrying past it
  would download a branch the caller did not ask for.

### Consequences
Covered by three live tests in `tests/provider-failures.test.ts`: a `master` repo with no ref, a
missing repo naming the tried branches, and an explicit wrong ref tried exactly once.

---

## D-004: A truncated test run must fail, not pass

**Date:** 2026-10-14
**Status:** accepted

### Context

`vitest.config.ts` carried `dangerouslyIgnoreUnhandledErrors: true` with a comment explaining that
Node 24.21.0 aborts in `node::RemoveEnvironmentCleanupHook` when a native N-API module is torn down,
and that the flag existed so this environment fault would not redden the build.

The comment's claim - that the abort "fires at process exit, after every assertion has already
passed" - was false. Measured: the abort kills the shared fork mid-run. Vitest then prints a summary
covering only the files that had finished, commonly `Test Files 1 passed (2)` / `Tests 29 passed
(78)` out of 267, and the masking flag kept the exit code at 0.

So the setup did not fail on an environment fault after a verified run. It failed **silently, on a
run that had verified 11% of its assertions**, and reported success. Two "all tests pass" claims in
this project's history were produced by that mechanism.

### Decision

Remove the flag. Route `npm test` through `scripts/run-tests.mjs`, which passes only when all
expected test files and all expected tests actually completed and none failed. Switch the pool to
`forks` with `singleFork: false`, which measures 0 aborts in 10 runs against 4 in 10 for a shared
fork.

### Rationale

A false pass is worse than a red build: a red build costs a rerun, a false pass invalidates every
later claim that depends on it. The original intent - do not let an environment fault block real
work - is preserved, but by retrying a *failed* run and then failing loudly, instead of by
suppressing the exit code of a run that never finished.

The runner retries at most 3 times and only when the native-abort signature is present **and** zero
assertions failed. Verified by injecting a failing assertion: the result was `TEST_RUN_FAIL` with
`attempts: 1`, so a genuine defect cannot be retried into a pass.

### Rejected alternatives

- **Keep the flag, add a completion assertion elsewhere.** Same information, but the flag still lets
  a truncated run exit 0, so any invocation that bypasses the assertion is unprotected. `vitest run`
  stays usable directly and would keep lying.
- **Set `singleFork: false` and leave the flag.** Measured 0 aborts in 10 runs, but a flag that can
  hide a truncated run outlives the bug it was added for, and the next toolchain change re-opens it.
- **Use the `threads` pool.** Zero aborts and all 16 files run, but
  `tests/product-readiness.test.ts` calls `process.chdir()`, which is unavailable in worker threads,
  so it fails 1 test. Adopting it would mean weakening a legitimate assertion about cwd-independence.
- **Fix the abort from project code.** Searched rather than assumed: the project spawns no
  `worker_threads`, `handler-regression.test.ts` alone reproduces 0/10, excluding the suite that
  loads the native media binaries still reproduces 3/8, and `isolate: true` makes it worse. The
  fault is in Node's isolate disposal, above this codebase.

### Consequences

CI can still be reddened by an environment fault, and the first occurrence will be slower because it
retries. In exchange, a green run means 267 assertions actually ran, which is the property every
later correctness claim depends on. `scripts/tool-counts.json` now carries `testFiles` and
`testCount`, so adding or removing a suite without updating that file fails the build instead of
silently loosening the check.