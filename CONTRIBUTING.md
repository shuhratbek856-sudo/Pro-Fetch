# Contributing

## Setup

Requires Node.js >= 22.13 (`pdfjs-dist@6`).

```bash
npm ci
npm run check
```

`npm run check` runs, in order:

| Step | What it proves |
|---|---|
| `verify:static` | No credential patterns in shipped files, `.env.example` is secret-free, no template dispatcher, declared tool counts are consistent |
| `verify:registry` | The **live** registry matches `scripts/tool-counts.json`: 559 tools, 26 categories, 4 profile sizes, unique names, every handler and schema valid |
| `build` | `tsc` compiles clean under `strict` |
| `test` | The full Vitest suite passes |
| `verify:package` | The publishable tarball has a working shebang, an explicit file allowlist, and no credentials or stray type/source files |

## Loop

```bash
npm run dev            # tsx watch-free run of the stdio server
npm test               # unit + regression suite
npm run test:coverage  # with v8 coverage thresholds
npm run lint           # type check only (tsc --noEmit)
npm run format         # prettier --write
```

## Conventions

- **No `any`.** Tool input is `Record<string, unknown>`. Use the accessors in `src/core/input.ts`
  (`str`, `num`, `bool`, `arr`, `obj`, `pathStr`, `pathNum`) rather than casting. `view(input)` is
  the compatibility shim for `const p = input as any`; prefer the explicit helpers in new code.
- **Format before committing.** `npm run format` keeps lines under 120 characters.
- **Tool responses:** return `result()` / `md()` / `jsonBlock()` / `fail()` from `src/core/format.ts`.
- **Classification is single-source.** Mutating-vs-read-only lives in `src/core/tool-classification.ts`
  so the MCP `annotations` and the `PRO_FETCH_READ_ONLY` gate cannot disagree. Change it there, not
  in a handler.
- **Profile rules live in `src/core/profile.ts`.** `loader.ts` imports every tool index as a side
  effect, so importing it from `core/` closes a cycle — see the header of that file.

## Adding a tool

1. Create `src/tools/<category>/<name>.ts` exporting `defineTool({...})` as default.
2. Register it in `src/tools/<category>/index.ts`.
3. Update the expected count in `scripts/tool-counts.json`.
4. Add a regression test in `tests/handler-regression.test.ts` covering the happy path and at
   least one failure path.
5. `npm run check`.

The registry check will fail on a count mismatch, which is intentional: it stops a tool from
landing without a matching test and manifest update.

## Security notes

- Never commit `.env`, `mcp.json`, or any `*_FILE` secret target. `.gitignore` covers these,
  but a ZIP of the folder bypasses that — `verify:package` and `verify:static` check the shipped
  file set instead.
- Keep real API keys in `.env` for local runs; use `<NAME>_FILE` for anything you would not paste
  into a chat. Relative `*_FILE` paths resolve against the package root, not the working directory.
- Anything that shells out goes through `execFile` (never a shell string) and `safeSegment` /
  `safeLocalPath` in `src/core/max-platform-tools.ts`.