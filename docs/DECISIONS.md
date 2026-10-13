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
it. Passing a PDF to an OCR tool terminated the server and took all 571 tools with it.

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
