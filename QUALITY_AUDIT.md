# Pro-Fetch MAX quality audit

## Scope

This audit covers the packaged source snapshot, tool registry, configuration hygiene, selected safety guards, and local static checks. It is not a claim that all third-party integrations were live-tested.

## Findings addressed in this revision

- Removed an unnecessary index signature from `SearchItem` so the concrete `WebSearchResult` type can be passed to the ranking function without weakening its type contract.
- Added input-size and shape validation to OSV batch queries before any network call (1 MiB maximum, 1–1000 query objects, and basic field-shape checks).
- Kept knowledge document content bounded to 1 MiB and limited updated titles to 10 KiB.
- Added regression tests for malformed/oversized OSV batch payloads and read-only SQL guards (multi-statement SQL and write-capable CTEs).
- Removed unused helper code from the MAX platform module.

## Findings addressed in revision v3

- **Missing `.env.example`** made `verify:static` (and therefore `npm run check`) fail on its first step. The file is now included and lists every environment variable the code reads (secret values empty).
- **Registry had 499 tools, not 501.** The `github` pack had 45 tools while tests/README expect 47, so `all-tools.test.ts` would fail (total, per-category, unique names, `standard`/`full` profile sizes). Added `pro_gh_repo_contributors` and `pro_gh_release_read` (the original two names were not recoverable from the archive; these are replacements chosen to match the existing naming pattern).
- **`verify:static` could not detect the above**, because it sums declared numbers from the tests. Added `npm run verify:registry`, which loads the real registry and compares categories, total, unique names and profile sizes; it is part of `npm run check`.
- **Unvalidated values in GitHub API paths.** 29 github tools concatenated `owner/repo/sha/...` into `https://api.github.com/...` paths without encoding, so a value such as `repo: "x/../../user"` or `per_page: "20&x=1"` could reach a different endpoint with the user's token. A central guard (`src/core/github-input-guard.ts`, called from `assertToolAllowed`) now rejects such values for the whole `github` category. The two new tools also use `encodeURIComponent`.
- **Timed-out handlers held concurrency slots forever.** Handlers are not cancellable, so a hung handler kept its category/global slot; eight hung calls could block a category permanently. Slots are now force-released after `PRO_FETCH_ABANDON_GRACE_MS` (default 30 s, logged as `tool.abandoned`).
- **`PRO_FETCH_OUTPUT_ROOT` used `path.resolve`**, which does not follow symlinks, so a link inside the sandbox could escape it. Containment now compares real paths (`realResolve`), consistent with the workspace check in the MAX pack.
- **`engines.node >= 22.13`** added (required by `pdfjs-dist@6`).
- Regression tests: `tests/hardening.test.ts`.

## Known limitations / not changed

- Tool `annotations` and the `PRO_FETCH_READ_ONLY` gate now derive from one shared rule set
  (`src/core/tool-classification.ts`), so they can no longer drift. The earlier divergence — 44 tools
  annotated write-capable without matching the read-only filter, and `cache_tune` /
  `knowledge_rebuild` annotated `readOnlyHint: true` despite mutating state — is resolved.
- `src/core/max-platform-tools.ts` has been reformatted: its longest line went from ~4.9k characters
  to 310, and the file is no longer minified-style. The `any` usage across `src/` dropped from 254
  to 54 during the same pass; what remains is local JSON/DOM handling that needs individual review.
- Live API/CLI integrations are still unverified: they need user-owned credentials and installed
  CLIs.

## Template / placeholder status

There is no `runTemplateTool` / `template-tools` dispatcher. The MAX pack uses shared category/provider handlers and per-tool specs. Shared handlers are a normal code-reuse pattern, not themselves templates. The registry count is a count of registered tool definitions; it must not be interpreted as 501 independently implemented provider backends. Provider operations still require supported credentials/CLI programs and should be integration-tested against the actual service.

## Verification status

- Static verification: passed.
- ZIP structure / secret-pattern scan: `npm run verify:package` now asserts the published file set.
- `verify:static` and `verify:registry` (live registry, third-party packages stubbed): passed. New regression tests and both new github handlers were executed in an isolated harness and passed; removing each fix makes the corresponding test fail.
- Full TypeScript build (`tsc`) and the complete Vitest suite: **verified** on Node v24.21.0 /
  npm 11.19.0 / Windows — `npm run check` passes end to end. CI repeats `npm ci && npm run check`
  across Node 22.13 and 24 on Ubuntu and Windows.
- Live API/CLI integrations: not run; they require user-owned credentials, installed CLIs, and explicit test environments.

## Recommended release gate

On Windows, from the extracted project root:

```powershell
npm ci
npm run check
```

Do not enable write-capable integrations until their credentials, confirmation behavior, least-privilege permissions, and provider-specific regression tests have been validated.

## Follow-up quality pass (2026-10-10)

- Added `scripts/tool-counts.json` as an independent registry-count manifest. The static checker no longer derives its total from `tests/all-tools.test.ts`; the runtime registry checker now compares loaded tools against the separate manifest and checks duplicate names, handler presence, descriptions, object schemas, and required-property declarations.
- Hardened custom GitLab/Gitea/Forgejo/Bitbucket base URLs: URL protocol/host is checked with the SSRF guard, and a custom host is rejected unless explicitly listed in `PRO_FETCH_ALLOWED_CODEHOST_HOSTS`. This prevents sending a configured code-host credential to an arbitrary `base_url` supplied as tool input.
- These changes do not prove every external integration works. The complete build and test suite still must pass on a dependency-complete environment, followed by credentialed integration tests.
