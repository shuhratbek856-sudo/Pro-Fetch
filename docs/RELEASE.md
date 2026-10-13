# Release

How to publish `pro-fetch-mcp`, and what is already verified.

## Preconditions (all verified)

| Check | Evidence |
|---|---|
| `npm run check` green | 237 tests, 14 files, 4 verifications, format clean |
| Tarball clean | 444 files, no `.env`, no keys, no `.d.ts`, shebang present (`verify:package`) |
| Name free | `npm view pro-fetch-mcp` → 404 |
| `npm publish --dry-run` | PASS (runs `prepublishOnly` → full `npm run check` first) |

## Publish (requires the maintainer's npm account)

```bash
npm login
npm publish
```

That is the entire remaining procedure. `prepublishOnly` runs the full verification chain before
anything is uploaded, so a broken tree cannot be published by accident. The package is unscoped, so
it publishes public by default; no `publishConfig` is needed.

## After publishing

```bash
npm view pro-fetch-mcp version
npx -y pro-fetch-mcp --help   # bin entry: dist/server.js
```

## What this does not do

- No version bump is included. Bump `version` in `package.json` and add a `CHANGELOG.md` entry first
  when the next release is cut.
- No GitHub release is created. The repository has no remote configured (`git remote` is empty);
  pushing and tagging are separate steps the maintainer runs.
- No provenance attestation (`--provenance` needs CI OIDC; the workflow does not configure it).
