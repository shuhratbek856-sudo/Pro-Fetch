# Security Policy

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue. Include the tool name,
the input that triggers it, and what you observed. Expect an acknowledgement within a few days.

## Threat model

This server runs as a **local stdio child process** of an MCP client. It is trusted by the machine
it runs on, but the *arguments* it receives come from a model and may be influenced by remote content
(page text, API responses, fetched documents). The controls below exist to contain that.

### Controls that are enforced on every call

| Control | Env var | Effect |
|---|---|---|
| Tool allowlist | `PRO_FETCH_ALLOWED_TOOLS` | Non-listed tools are rejected before the handler runs |
| Tool denylist | `PRO_FETCH_DENIED_TOOLS` | Listed tools are rejected |
| Category denylist | `PRO_FETCH_DENIED_CATEGORIES` | Whole categories are rejected |
| Read-only mode | `PRO_FETCH_READ_ONLY=true` | Mutating tools and any non-GET/HEAD/OPTIONS HTTP method are rejected |
| Write allowlist | `PRO_FETCH_MUTATION_ALLOWLIST` | Named exceptions to read-only mode |
| Output sandbox | `PRO_FETCH_OUTPUT_ROOT` | `output_path` / `storage_state_path` must resolve inside this directory, following symlinks and junctions |
| Browser JavaScript | `PRO_FETCH_ALLOW_JS=true` | Required for `evaluate` / `execute` / `script` browser tools |
| Shell commands | `PRO_FETCH_ALLOW_COMMANDS=true` | Required for `npm test` / `npm build`, and still needs `confirm=true` per call |

All of these are enforced in `assertToolAllowed` (`src/core/security-policy.ts`), which runs inside
the shared execution engine — including for tools invoked indirectly through
`pro_fetch_tool_execute`.

### Network containment

- Outbound HTTP(S) resolves DNS **before** connecting and rejects private, loopback, link-local and
  otherwise special-purpose addresses (`src/core/ssrf-guard.ts`).
- The validated address is **pinned at connect time**, so a second DNS answer cannot retarget the
  request (DNS rebinding).
- Across an origin change, `authorization`, `cookie`, `x-api-key` and similar headers are stripped.
- `HTTPS → HTTP` downgrade redirects are blocked unless `PRO_FETCH_ALLOW_HTTPS_DOWNGRADE=true`.
- Using `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` requires `PRO_FETCH_ALLOW_UNPINNED_PROXY_DNS=true`,
  because a remote proxy resolves the target itself and local pinning cannot be guaranteed.
- Response bodies are read through a streaming size cap, not buffered unbounded.

### Command execution

`execFile` is used with an argument array; no shell string is ever built. Arguments pass through
`safeSegment` (rejects empty, `.`, `..`, leading `-`, control characters) and paths through
`safeLocalPath` (workspace containment that resolves symlinks). Database tools accept only
read-only SQL.

### Secret handling

- Secret values are never returned by diagnostics; they report `configured` / `source` only.
- Error messages are redacted before they leave the process: values from secret-shaped input keys,
  `Bearer`/`Basic` credentials, credential-bearing query parameters, and `scheme://user:pass@` URLs.
- `.env` and `qwen-mcp.json` are git-ignored and excluded from the published package by the
  `files` allowlist. `.env.example` ships with every value empty.

## Known limitations

- **Profiles are not a security boundary.** `PRO_FETCH_PROFILE` controls which tool *schemas* reach
  the model, not which tools may run — the `smart` profile depends on `pro_fetch_tool_execute`
  reaching tools outside its visible set. Use the allowlist/denylist above for enforcement.
  `PRO_FETCH_ENFORCE_PROFILE=true` turns the profile into a hard allowlist, and is rejected in
  combination with `smart`.
- **Outbound requests carry whatever credentials you configure** for the matched provider. A tool
  reached through the meta-executor is not more restricted than a directly listed one.
- **Local CLI tools trust their workspace.** `PRO_FETCH_WORKSPACE` bounds git/devops/database
  access to a directory, but anything inside that directory is fair game.
- **Rate limiting is per-process.** It does not coordinate across multiple server instances.