# pro-fetch-mcp

Professional fetch, deep-research & GitHub MCP server — **572 MCP tool, 26 categories, one security engine**.

A model gets the tools it actually needs: the default `smart` profile exposes **11 meta-tools** that compose all 572, so any MCP client works without drowning in schemas.

![npm version](https://img.shields.io/npm/v/pro-fetch-mcp?label=npm)
![node](https://img.shields.io/badge/node-%3E%3D22.13-blue)
![license](https://img.shields.io/npm/l/pro-fetch-mcp)
![tests](https://img.shields.io/badge/tests-306%20passing-brightgreen)

## Why

- **572 working tools** — fetch, crawl, extract, convert, OCR, search, research, git, GitHub, GitLab/Gitea/Forgejo/Bitbucket, SQLite, security, Slack/Jira/Linear/Notion, storage, and more. Every one is a real implementation, not a stub.
- **Smart System** — 11 meta-tools (`pro_capability_call`, `pro_capability_map`, `pro_research_deep`, …) that dispatch to the full catalog in a single round trip. Batch execution, BM25 task-to-tool discovery, and a `detail` mode that cut a 17-step audit from 43 KB to 3.8 KB (**91% token savings**, measured).
- **Security is the engine, not a warning** — SSRF guard with DNS pinning, workspace sandbox with symlink tracking, per-call permission policy, credential stripping on cross-origin redirects, HTTPS→HTTP downgrade blocking. Every composite call passes through the same `dispatch()` gate.
- **Degrades, never dies** — native binaries (sharp, canvas, tesseract) are lazy-loaded; missing git/docker/kubectl produce a clear `COMMAND_NOT_FOUND`; the server boots and serves 500+ tools on a host with none of them.

## Quick start

```bash
npx -y pro-fetch-mcp        # stdio MCP server, zero config
```

Any MCP client — Claude Desktop, Cursor, Qwen, VS Code, your own harness:

```json
{
  "mcpServers": {
    "pro-fetch": {
      "command": "npx",
      "args": ["-y", "pro-fetch-mcp"],
      "env": { "PRO_FETCH_PROFILE": "smart" }
    }
  }
}
```

Ready-to-copy config: [`mcp.example.json`](mcp.example.json).

Credentials go in a `.env` next to the server (or `*_FILE` env vars pointing at a file — never the value itself). `.env` is never committed and never ships in the npm package.

| Credential | Unlocks |
|---|---|
| `GITHUB_TOKEN` | code search, private repos, higher rate limits |
| `SERPER_API_KEY` | Google-backed web search |
| `OPENAI_API_KEY` | audio transcription, embedding hybrid retrieval |
| `SEARCH_API_KEY` | Brave search (DuckDuckGo fallback otherwise) |
| `GITLAB_TOKEN`, `SLACK_BOT_TOKEN`, `JIRA_TOKEN`, … | the matching adapter pack — see [`.env.example`](.env.example) |

## The Smart System

Most MCP clients choke on hundreds of tool schemas. `smart` (the default) shows the model **11 tools** that compose everything:

| Tool | What it does |
|---|---|
| `pro_capability_call` | **Batch executor** — runs a list of `{tool, arguments}` in one call; each result returns its own `ok`/`error` |
| `pro_capability_map` | Plain-language task → exact tools with their schemas (BM25 + morphological expansion) |
| `pro_fetch_tool_execute` | Call any tool by exact name |
| `pro_research_deep` | Search → read → facts → verify → report |
| `pro_fetch_ingest` | Any URL → clean structured data (page, PDF, CSV, feed) |
| `pro_audit_page` | One page → every relevant extraction |
| `pro_repo_audit` | Repo → full report (metadata, README, tree, issues, PRs, releases) |
| `pro_pr_review` | PR → full review (diff, checks, reviews, comments) |
| `pro_site_scan` | Crawl a site and explain it |
| `pro_data_pipeline` | Load, profile and transform a dataset |

Three round trips become one:

```jsonc
{ "tool": "pro_capability_call", "arguments": {
  "calls": [
    { "tool": "pro_fetch_web_search",      "arguments": { "query": "RAG architecture 2025" }, "label": "search" },
    { "tool": "pro_fetch_academic_search", "arguments": { "query": "retrieval augmented generation" }, "label": "papers" },
    { "tool": "pro_fetch_news_search",     "arguments": { "query": "RAG news" }, "label": "news" }
  ]
}}
```

**Security is not weakened by composition.** Every internal call goes through the central `dispatch()`, so `PRO_FETCH_ALLOWED_TOOLS`, `PRO_FETCH_READ_ONLY`, the SSRF check, the output sandbox and timeouts apply unchanged. If `pro_capability_call` itself is not on the allowlist, it does not run.

## Tool catalog

<details>
<summary><b>All 26 categories — 572 tools</b></summary>

| Category | Tools | Category | Tools |
|---|---:|---|---:|
| github | 49 | crawl | 22 |
| browser (Playwright) | 41 | search | 20 |
| convert | 30 | http | 19 |
| collaboration (Slack/Linear/Jira/Notion) | 28 | knowledge (local store) | 18 |
| research | 26 | productivity (Gmail/Calendar/Todoist) | 18 |
| data | 26 | storage (S3/Drive/Dropbox/OneDrive) | 16 |
| codehost (GitLab/Gitea/Forgejo/Bitbucket) | 25 | media (sharp/EXIF/QR/OCR/PDF) | 15 |
| extract (CSS/XPath/JSONPath/OG) | 24 | archive | 15 |
| devops (docker/kubectl/terraform/npm) | 24 | docs (arXiv/npm/PyPI/RFC/PubMed) | 15 |
| database (SQLite/Postgres/MySQL/Redis) | 24 | auth (sessions & keys, in-memory only) | 12 |
| security (OSV/secret scan/SBOM) | 24 | apitest (OpenAPI/GraphQL/WSDL) | 12 |
| admin (discovery, metrics, policy) | 24 | i18n | 12 |
| git | 23 | monitoring | 10 |

</details>

**Profiles** control how many schemas the model sees — not the security boundary:

| Profile | Tools | Contents |
|---|---:|---|
| `minimal` | 73 | http, convert, admin |
| `standard` (default) | 178 | + github, search, extract, auth |
| `smart` | 11 | the Smart System above |
| `full` | 572 | everything |

Real access control lives in the environment: `PRO_FETCH_ALLOWED_TOOLS`, `PRO_FETCH_DENIED_TOOLS`, `PRO_FETCH_DENIED_CATEGORIES`, `PRO_FETCH_READ_ONLY`, `PRO_FETCH_MUTATION_ALLOWLIST`, `PRO_FETCH_OUTPUT_ROOT` — enforced on every call, including calls made through the meta-executor.

## Security model

- **SSRF guard** — outbound HTTP(S) resolves and verifies DNS, pins the connection; `HTTP_PROXY`/`HTTPS_PROXY` require an explicit opt-in because a remote proxy resolves DNS itself.
- **Workspace sandbox** — with `PRO_FETCH_OUTPUT_ROOT`, every `output_path` and browser `storage_state_path` write is contained (symlinks and junctions are followed and rejected on escape).
- **GitHub input guard** — `owner`/`repo`/`path`/`gist_id`/SHAs are validated centrally; traversal, deep paths and API-relevant characters are rejected.
- **Redirect safety** — credentials are stripped on cross-origin hops; HTTPS→HTTP downgrades are blocked; redirect *loops* are reported as bot protection, not as a hop count.
- **Process hardening** — media bytes are identified by signature *before* any decoder sees them (a hostile file cannot crash a worker thread), every `import().then()` chain carries a `.catch()`, and `uncaughtException`/`unhandledRejection` handlers log to stderr instead of killing the server.
- **Secrets** — diagnostics report only whether a credential is present and its source, never its value.

Full boundary list: [SECURITY.md](SECURITY.md).

## Requirements & graceful degradation

**Node.js ≥ 22.13** (required by `pdfjs-dist@6`). Everything else is optional:

| Optional | Effect when absent |
|---|---|
| `sharp`, `@napi-rs/canvas`, `tesseract.js` binaries | media tools fail individually; server boots and serves the rest |
| `git`, `docker`, `kubectl`, `terraform`, `psql`, `redis-cli` | those tools answer `COMMAND_NOT_FOUND` with a precise message |
| Playwright browsers | browser pack reports it needs `npx playwright install --with-deps chromium` |
| npm build scripts (`--ignore-scripts`) | SQLite tools report `SQLITE_UNAVAILABLE` with the fix (`npm rebuild better-sqlite3`) |

SQLite needs **no system binary** — it uses the bundled `better-sqlite3` driver (the `sqlite3` CLI is only a fallback). On Windows, npm tools invoke `npm-cli.js` through `process.execPath`, so `npm audit`, `npm outdated` and license reports work there too.

## Development

```bash
npm ci
npm run check   # verify:static → verify:registry → build → test → verify:package → format:check
```

- **306 tests** (Vitest): SSRF, redirects, permission policy, output sandbox, timeouts, every tool's input contract, and live provider-failure behaviour.
- `verify:registry` boots the real registry and asserts **572 tools / 26 categories / all four profile counts**.
- `npm run audit:schema` checks every schema against the code behind it: a property a tool's handler never reads, or a required argument nothing reads, or an open schema that accepts anything. It currently reports **0 dead properties and 0 unread required across 552 audited tools**, and all 572 schemas reject properties they do not declare.
- `verify:package` proves the published tarball has the shebang, the `files` allowlist, and **zero credentials or source files**.
- The MCP protocol itself was exercised live: `initialize`, `tools/list` (572/572 unique, valid schemas), `tools/call` for every smart tool, hidden tools refused, clean JSON-RPC on stdout.

## License

[MIT](LICENSE)

---

[O'zbekcha versiya](README.uz.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md)
