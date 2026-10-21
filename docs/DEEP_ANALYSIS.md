# Deep analysis — pro-fetch-mcp

**Date:** 2026-10-21
**Commit analysed:** `54da148` (audit closed) — tree clean at the time of writing
**Method:** every claim below is a measurement taken during this analysis, not a recollection.
The commands are listed next to the numbers so each one can be re-run.

---

## 1. Scope and method

The question this document answers: **what is this project actually, and what is actually known
to work about it?**

Three passes were used:

1. **Measurement** — re-ran every gate the project owns and recorded the real output.
2. **Reading** — read the core layer, the entry points and the guard code rather than trusting
   names or comments.
3. **Live use** — drove the built server over the real MCP protocol (stdio, raw JSON-RPC) and made
   real tool calls, including live network calls and a real file write.

What was **not** inspected, and therefore not claimed:

- Linux and macOS runtimes. This machine is Windows; the CI workflow is validated by parsing, and
  by nothing else.
- Live provider paths (GitHub, search providers, LLM gateways, object storage, OAuth). The
  implementations exist and are exercised by unit tests with recorded fixtures, but no live key was
  available, so no live provider call is claimed.
- The 20 "SPECS" packs whose bodies live in a `switch` branch. Their per-tool source cannot be
  resolved by the current resolver, and that limit is analysed in §6 rather than hidden.

---

## 2. Measured state

| Measure | Value | Command |
|---|---:|---|
| Source files / lines | 554 / 46 805 | `Get-ChildItem src -Recurse -Filter *.ts` + `Measure-Object -Line` |
| Core layer | 54 files / 14 591 lines | same, `src/core` |
| Tool layer | 496 files / 32 013 lines | same, `src/tools` |
| Test files / lines | 51 / 11 089 | same, `tests/` |
| Test cases | **1051** (0 skipped) | `npm test` → `TEST_RUN_PASS files=51 tests=1051` |
| Scripts / docs | 24 / 7 | directory counts |
| Registered tools | **672**, all names unique | `npm run verify:registry` → `REGISTRY_VERIFICATION_PASS` |
| Categories | **42** | same |
| Smart profile | **11** tools | same |
| Type check | exit 0 | `npx tsc --noEmit` |
| Schema audit | dead 0, unread-required 0, open schemas 0 | `npx tsx scripts/audit-schema.mts` |
| Composite coverage | 672/672 reachable, 0 closed | `npm run measure:coverage` |
| Placeholders (`TODO`/`FIXME`/`NOT_IMPLEMENTED`) | **0** | word-boundary scan over `src/**` |
| Empty handler bodies | **0** | regex `async handler(...) {}` scan |
| `any` usages | 58 | `: any` / `as any` / `<any>` scan |
| Live MCP session | **ALL PASS** | raw JSON-RPC client against `dist/server.js` |

### The full category inventory (42)

`github` 49 · `browser` 41 · `convert` 30 · `collaboration` 28 · `data` 26 · `research` 26 ·
`codehost` 25 · `database` 24 · `security` 24 · `devops` 24 · `extract` 24 · `admin` 24 ·
`git` 23 · `crawl` 22 · `search` 20 · `http` 19 · `productivity` 18 · `knowledge` 18 ·
`storage` 16 · `docs` 15 · `archive` 15 · `media` 15 · `document` 13 · `i18n` 12 · `apitest` 12 ·
`auth` 12 · `sql` 11 · `monitoring` 10 · `imageproc` 9 · `qr` 9 · `encoding` 9 · `schema` 6 ·
`opendata` 5 · `units` 5 · `zip` 5 · `llm` 5 · `time` 5 · `chess` 4 · `geo_data` 4 · `binary` 4 ·
`phonetics` 3 · `color` 3

---

## 3. Architecture

Four entry-point files, one core layer, one tool layer:

```
src/server.ts     MCP stdio server (JSON-RPC), process guards, stdout reserved for the protocol
src/router.ts     listTools(profile) / callTool(name, args)
src/loader.ts     imports every category; reads PRO_FETCH_PROFILE once, at module load
src/env.ts        .env loading, PRO_FETCH_* configuration
src/core/         54 files: HTTP client, guards, execution engine, composites, discovery, cache
src/tools/        496 files: 42 categories, one tool per file in the newer categories
```

The dependency direction is one-way: `tools → core`, `core → node/undici`. Nothing in `core`
imports a tool; tools reach each other only through `dispatch()`, which is what makes the policy
layer, the execution engine and the audit tooling apply to every call uniformly.

**Request path (measured, not assumed):** `server.ts` → `router.callTool` → `dispatch` (in
`core/tool.ts`) → argument validation (`assertRequiredPresent`, `assertNoUnknownArguments`) →
`assertToolAllowed` (profile allow/deny, read-only mode, confirmation) → `executeTool`
(`core/execution-engine.ts`: category semaphore → global semaphore → timeout) → the handler → the
sink guards (`assertWritable`, `assertSafeUrl`) fire at the point of use.

**The single most important structural property**: the write and network guards are enforced *at
the sink*, not by a list of "which tools write". `assertWritable` is called from 11 places,
`assertSafeUrl`/`resolveSafeUrl` from 49, and a tool added tomorrow is covered by writing to a
sink rather than by updating a list. The mutation *table*
(`core/mutation-sinks.generated.ts`) exists only to stop `readOnlyHint` from lying to the model —
the enforcement does not depend on it.

---

## 4. Correctness, subsystem by subsystem

Classification vocabulary: `IMPLEMENTED_AND_VERIFIED` / `IMPLEMENTED_NOT_FULLY_VERIFIED` /
`PARTIALLY_IMPLEMENTED` / `NOT_IMPLEMENTED` / `BLOCKED_BY_ENVIRONMENT`.

| Subsystem | State | Evidence |
|---|---|---|
| HTTP client (fetch, redirects, retries, timeouts, cache, proxy) | IMPLEMENTED_AND_VERIFIED | 19 `http` tools; batch-4 fixes pinned in `tests/audit-batch4-fixes.test.ts`; live fetch of `example.com` and a 32 KB Wikipedia page over MCP |
| Timeout semantics (one budget per call, queueing included) | IMPLEMENTED_AND_VERIFIED | `tests/audit-batch7-fixes.test.ts` (4 tests); HTTP + engine both measured |
| Security: SSRF, DNS pinning, private-IP block, protocol allowlist | IMPLEMENTED_AND_VERIFIED | `tests/dns-rebinding.test.ts` (8), `tests/core.test.ts` (16), `tests/security-boundaries.test.ts` (29); live: `http://127.0.0.1/secret` refused over MCP |
| Security: output sandbox, path containment, symlink escape | IMPLEMENTED_AND_VERIFIED | `tests/output-containment.test.ts` (9), `tests/zip-safety.test.ts` (9), `tests/hardening.test.ts` (7); live: `pro_pdf_new` wrote a real PDF inside the sandbox |
| Security: read-only mode, mutation confirmation, profile allow/deny | IMPLEMENTED_AND_VERIFIED | `tests/operator-policy-regressions.test.ts` (18), `tests/mode.test.ts` (20), `tests/profile-switch.test.ts` (6) |
| Security: credential handling, child-process env, redaction | IMPLEMENTED_AND_VERIFIED | `tests/security-boundaries.test.ts` (29) — a real child process is spawned and its environment read back; `childEnv` allowlist + credential filter, `NODE_OPTIONS` never forwarded |
| Rate limiting and network gates | IMPLEMENTED_AND_VERIFIED | `core/ratelimit.ts` (refill + status, pinned in `tests/audit-batch6-fixes.test.ts`), `core/execution-engine.ts` semaphores |
| Agent runtime: dispatch, execution engine, composites, batch execution | IMPLEMENTED_AND_VERIFIED | `tests/smart-system-quality.test.ts` (49), `tests/handler-regression.test.ts` (29), `tests/audit-batch7-fixes.test.ts`; live: `pro_capability_call` ran a 2-step plan, `ok: 2, failed: 0` |
| Tool discovery (BM25 + synonyms + schema) | IMPLEMENTED_AND_VERIFIED | `tests/audit-batch6-fixes.test.ts`; measured on the real registry: "scholar" → arxiv tool first, "arxiv paper"/"pdf convert"/"crawl site" unchanged |
| Schema contract (declared vs read) | IMPLEMENTED_AND_VERIFIED | `audit:schema` → dead 0, unread-required 0, open schemas 0; `tests/schema-narrowing.test.ts` (14), `tests/unknown-arguments.test.ts` (6) |
| Mutation classification (read-only hints) | IMPLEMENTED_AND_VERIFIED | `tests/security-boundaries.test.ts` recomputes the table with the same scanner — 474/474 tool bodies, 0 unreadable |
| Encoding / conversion / time / units / SQL / QR / zip / binary | IMPLEMENTED_AND_VERIFIED | `tests/sql-lexer.test.ts` (57), `tests/qr-reed-solomon.test.ts` (46), `tests/units-conversion.test.ts` (43), `tests/time-arithmetic.test.ts` (32), `tests/zip-formats.test.ts` (29), `tests/binary-formats.test.ts` (13) |
| Providers (GitHub, search, LLM, storage, OAuth, databases) | IMPLEMENTED_NOT_FULLY_VERIFIED | implementations exist and are unit-tested with fixtures; **no live key was available in this environment**, so no live provider call is claimed. 30 `getCredential` call sites across 6 tool files |
| SPECS packs (20 categories, one dispatcher each) | PARTIALLY_IMPLEMENTED | `audit:schema` reports 262 tools with undeclared reads and `skipped_delegating=20`; their per-tool source cannot be resolved, so their schemas cannot be checked per tool. Not proven wrong — proven unchecked |
| Browser tools | IMPLEMENTED_NOT_FULLY_VERIFIED | `tests/pinned-proxy.test.ts` (18) launches a real Chromium and passes once the browser build is installed; this machine had a mismatched build (see §7) |
| Durable persistence | NOT_IMPLEMENTED (by design, and documented) | the cache and the auth/session store are in-memory; `README.md` states this. File artifacts are written to the sandbox/cache directory. No claim of durability is made anywhere |

---

## 5. Security analysis

Controls are enforced by runtime services, not by prompt text or UI warnings.

| Control | Enforcement point | Call sites | Adversarial test |
|---|---|---:|---|
| SSRF: private/loopback/metadata addresses blocked | `core/ssrf-guard.ts` → `resolveSafeUrl` | 49 | `dns-rebinding.test.ts`, `core.test.ts` |
| DNS pinning (no second lookup) | `core/http-client.ts` (`dispatcherFor` + pinned `Agent`) | 5 | `dns-rebinding.test.ts` |
| Protocol allowlist, credentials-in-URL refused | `ssrf-guard.ts` | — | `core.test.ts` |
| Cross-origin redirect: credential headers stripped by pattern | `http-client.ts` `CREDENTIAL_TARGET_HEADER` | 1 | `audit-batch4-fixes.test.ts` |
| Write containment + symlink resolution | `core/path-containment.ts`, `output-dir.ts` | 11 | `output-containment.test.ts`, `hardening.test.ts` |
| Archive safety (entries, inflation cap, traversal) | zip tools | — | `zip-safety.test.ts`, `zip-inflate-cap.test.ts` |
| Read-only mode, per-category/per-tool deny | `security-policy.ts` | 3 | `operator-policy-regressions.test.ts` |
| Unknown / undeclared arguments refused | `required-arguments.ts` | 2 | `unknown-arguments.test.ts` (live: `output_name` refused) |
| Credential redaction in output and logs | `core/tool.ts:1011` | 30 | `security-boundaries.test.ts` |
| Child process environment filtered | `core/child-env.ts` | 1 (central) | `security-boundaries.test.ts` (a real child is spawned) |
| Timeouts, rate limits, concurrency caps | execution engine, `ratelimit.ts`, `network-gate.ts` | — | `audit-batch7-fixes.test.ts` |

**Limitations, stated plainly:**

- The sandbox boundary is a directory, not an operating-system sandbox. A tool that can execute a
  child process can write wherever the OS allows; the read-only mode and the write guard are
  enforced in the server, not by the kernel.
- A proxy named by the caller for one request is a trust decision: the proxy resolves the target
  hostname, so local DNS pinning cannot be guaranteed across that hop. The tool says so in its
  output (`D-024`).
- The auth/session store is in memory: a restart forgets it. The README says this.

---

## 6. The verification system itself

The project has five gates, and they check different things. This is the part of the project that
makes the rest believable, so it is worth stating what each one can and cannot catch.

| Gate | What it catches | What it cannot catch |
|---|---|---|
| `verify:static` | tool counts in `package.json`/READMEs, profile meta-tools, vocabulary, package size, credential-free assets | behaviour |
| `audit:schema` | declared properties that no code reads; required properties no code reads; open schemas | behaviour inside a `switch` branch (see SPECS) |
| `verify:registry` | every tool has a schema and a handler; names unique; counts match the manifest | handler correctness |
| `npm test` (51 files, 1051 cases) | behaviour, including adversarial cases | code paths behind a credential |
| `verify:package` | the published tarball has no credentials and no source | runtime |
| live MCP session | the assembled product, over the real protocol | paths not exercised |

**The runner's strictness is a feature worth naming.** `scripts/vitest-summary.mjs` treats *skipped*
tests as failures, and the run in this analysis proved why: with the Chromium build missing,
`tests/pinned-proxy.test.ts` could not collect, 18 tests were reported as skipped, and the suite
was reported as a **failure** rather than a green tick. The project's own rule — "skipping was
tried first and rejected: it converts a real failure into a green tick" — held in the harness
itself.

---

## 7. What is not verified, and the environment findings

1. **`tests/pinned-proxy.test.ts` could not collect** until `npx playwright install chromium` was
   run: the installed `playwright` 1.63.0 expects browser build **1243**, and the machine's cache
   held only **1248** (a newer build from another project on the same machine, which had pruned
   the older one). CI installs the browser explicitly, with a comment saying why
   (`.github/workflows/ci.yml`), so the project is correct and the *local machine* was not. Fixed by
   installing the matching build; the suite then reported `TEST_RUN_PASS files=51 tests=1051`.
2. **Live provider calls** — no credential was available, so GitHub/Search/LLM/Storage/Auth paths
   are `IMPLEMENTED_NOT_FULLY_VERIFIED` and nothing more is claimed for them.
3. **262 tools with undeclared reads** — dominated by the 20 SPECS packs (one dispatcher per
   category, `switch` on the action). `closable_now=0`: the current resolver cannot reach into a
   branch, and the audit reports that honestly instead of guessing. An earlier session measured an
   empty-call probe over 198 of them: **0** demanded an argument their schema does not declare.
   Unverified is not the same as wrong, and this document does not convert it into "clean".
4. **130 tools with `required_empty`** — a tool whose schema declares a required argument but
   which stops on a real precondition first (`CREDENTIAL_MISSING`, `CONFIRMATION_REQUIRED`, no
   session). This is correct behaviour for those tools, and the number is reported rather than
   hidden.
5. **58 `any` usages** — concentrated in a handful of files (`json_diff.ts`, `registry_api_read.ts`,
   `media-tools.ts`, `form_extract.ts`, `table_to_dataframe.ts`). Type debt, not a defect; the
   type check is otherwise clean.
6. **One intermittency** — one `npm run check` run in this session failed with the known Node 24 +
   vitest 2.1.9 worker-teardown flake (`Errors 1`, 47 of 48 files); the direct re-run and the
   full run were green. It is recorded in the project's decisions file, not explained away.
7. **Windows-only verification** — Linux/macOS are validated by workflow parsing only.

---

## 8. Risk register

| # | Risk | Likelihood | Impact | Mitigation now |
|---|---|---|---|---|
| R1 | 262 unchecked tool schemas (SPECS packs) hide a real dead property | medium | medium | sink-level enforcement still applies; empty-call probe found 0 schema gaps |
| R2 | A provider path breaks against a live API without any test noticing | medium | high | provider-failure tests exist; live calls are the operator's check |
| R3 | A local machine without the matching Playwright build fails the suite | high (hit here) | medium | CI installs the browser; the runner refuses to call skips a pass |
| R4 | 58 `any` usages hide a type error at a boundary | low | medium | `tsc --noEmit` is green and runs in every gate |
| R5 | In-memory cache/auth loses state on restart | high | low | documented in the README; no durability is claimed |
| R6 | The proxy path cannot pin DNS across the hop | low | medium | explicit consent, stated in the tool output (`D-024`) |

---

## 9. Findings that were reported and are not defects

Recorded because the audit's credibility depends on them being visible, not because they need work:

`stop_on_error` (the composite honours it) · the semaphore's slot handover (no double counting) ·
the refill formula inside `take()` (correct; the *status* reader was the defect, fixed as F12) ·
the http cache key's SHA-256 (fine; the missing part was the token limit, fixed as F10) ·
CSV quoting inside a field · month clamping, leap 29 February, negative epoch, between-zero time
invariants · `1,500 kg` thousands separator · the "time fixes" item of the small-fix list (the time
invariants measured correct) · the `Todoist` matches in a `TODO` scan (a service name).

---

## 10. Recommendations, in order

1. **Resolve the SPECS packs per tool** (R1). It needs statement-boundary tracking inside a
   `switch`, not brace matching — a resolver change in `core/source-resolver.ts`, then
   `audit:schema` should report `with_undeclared_reads` below the SPECS floor. Until then the
   honest label stays `PARTIALLY_IMPLEMENTED`.
2. **Record the Playwright build requirement** in the README's local-setup section, next to the CI
   step, so a developer on a machine that has pruned old builds is not surprised (R3).
3. **Pay down the `any` debt** in the five files that hold 58 of them (R4).
4. **Run the live provider matrix** with real keys on a machine that has them, and store the
   results as the evidence the project currently lacks (R2).

None of these are defects that the current build misrepresents to a caller — which is the
distinction the rest of this project has been about.
