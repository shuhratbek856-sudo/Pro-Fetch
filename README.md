<div align="center">

# pro-fetch-mcp

**572 MCP tools · 26 categories · one security engine**

Fetch, deep-research and GitHub as an MCP server — with a Smart System that composes the whole
catalog in a single round trip.

[![npm](https://img.shields.io/npm/v/pro-fetch-mcp?label=npm&logo=npm)](https://www.npmjs.com/package/pro-fetch-mcp)
[![node](https://img.shields.io/badge/node-%3E%3D22.13-5FA04E?logo=node.js)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/pro-fetch-mcp?color=blue)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-306%20passing-success?logo=vitest)](./)

</div>

---

Most MCP clients choke on hundreds of tool schemas. So this server ships two faces:

- **`smart` profile (default)** — 11 meta-tools that reach all 572. Small surface, full power.
- **`full` profile** — every tool, for clients and harnesses that can afford it.

Either way, every call goes through the same central `dispatch()` gate. Composition never weakens
the security boundary.

---

## Contents

- [Why](#why)
- [Install](#install)
- [The Smart System](#the-smart-system)
- [Configuration](#configuration)
- [Credentials](#credentials)
- [Tool catalog](#tool-catalog)
- [Security model](#security-model)
- [Requirements](#requirements)
- [Development](#development)

---

## Why

<table>
<tr><td width="50%">

**572 working tools**

Fetch, crawl, extract, convert, OCR, web and academic search, deep research, git, GitHub,
GitLab/Gitea/Forgejo/Bitbucket, SQLite/Postgres/MySQL/Redis, OSV and SBOM, Slack/Jira/Linear/Notion,
S3/Drive/Dropbox, and more. Every one is a real implementation.

</td><td width="50%">

**Security is the engine, not a warning**

SSRF guard with DNS pinning, workspace sandbox with symlink tracking, per-call permission policy,
credential stripping on cross-origin redirects, HTTPS→HTTP downgrade blocking. Each composite call
passes the same gate.

</td></tr>
<tr><td>

**Degrades, never dies**

Native binaries (sharp, canvas, tesseract) are lazy-loaded. Missing `git`, `docker` or `kubectl`
produce a precise `COMMAND_NOT_FOUND`. The server boots and serves 500+ tools on a host with none
of them.

</td><td>

**Schemas that match the code**

`npm run audit:schema` compares every schema against the code behind it. Currently: 0 dead
properties, 0 unread required arguments, and all 572 schemas reject properties they do not declare.

</td></tr>
</table>

---

## Install

```bash
npx -y pro-fetch-mcp
```

Zero config, stdio transport. Works with Claude Desktop, Cursor, Qwen, VS Code, or your own harness:

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

Ready-to-copy config: [`mcp.example.json`](./mcp.example.json).

---

## The Smart System

`smart` shows the model **11 tools** that compose everything else:

| Tool | What it does |
|---|---|
| `pro_capability_call` | **Batch executor** — runs a list of `{tool, arguments}` in one call; each result carries its own `ok`/`error` |
| `pro_synthesize` | Turns many tool results into one coherent answer |
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
{
  "tool": "pro_capability_call",
  "arguments": {
    "calls": [
      { "tool": "pro_fetch_web_search",      "arguments": { "query": "RAG architecture 2025" }, "label": "search" },
      { "tool": "pro_fetch_academic_search", "arguments": { "query": "retrieval augmented generation" }, "label": "papers" },
      { "tool": "pro_fetch_news_search",     "arguments": { "query": "RAG news" }, "label": "news" }
    ]
  }
}
```

Then collapse the three answers into one:

```jsonc
{
  "tool": "pro_synthesize",
  "arguments": {
    "results": [
      { "tool": "pro_fetch_web_search",      "output": "…" },
      { "tool": "pro_fetch_academic_search", "output": "…" },
      { "tool": "pro_fetch_news_search",     "output": "…" }
    ],
    "task": "Summarise the current state of RAG, citing where each claim comes from"
  }
}
```

`pro_capability_map`'s `detail` mode is worth knowing about: it cut a 17-step audit from **43 KB to
3.8 KB** — 91% token savings, measured.

---

## Configuration

`PRO_FETCH_PROFILE` controls how many schemas the model sees. It is **not** the security boundary.

| Profile | Tools | Contents |
|---|---:|---|
| `minimal` | 73 | http, convert, admin |
| `standard` *(default)* | 178 | + github, search, extract, auth |
| `smart` | 11 | the Smart System above |
| `full` | 572 | everything |

Real access control lives in the environment and is enforced on **every** call, including calls made
through the meta-executor:

| Variable | Effect |
|---|---|
| `PRO_FETCH_ALLOWED_TOOLS` | Allowlist by name or `*` |
| `PRO_FETCH_DENIED_TOOLS` | Denylist, applied after the allowlist |
| `PRO_FETCH_DENIED_CATEGORIES` | Deny whole categories |
| `PRO_FETCH_READ_ONLY` | Block every mutating operation |
| `PRO_FETCH_MUTATION_ALLOWLIST` | Permit specific mutations under read-only |
| `PRO_FETCH_OUTPUT_ROOT` | Contain every file write |

If `pro_capability_call` itself is not on the allowlist, it does not run.

---

## Credentials

Put credentials in a `.env` next to the server, or use `*_FILE` env vars pointing at a file —
**never the value itself**. `.env` is never committed and never ships in the npm package.

| Credential | Unlocks |
|---|---|
| `GITHUB_TOKEN` | code search, private repos, higher rate limits |
| `SERPER_API_KEY` | Google-backed web search |
| `OPENAI_API_KEY` | audio transcription, embedding hybrid retrieval |
| `SEARCH_API_KEY` | Brave search (DuckDuckGo fallback otherwise) |
| `GITLAB_TOKEN`, `SLACK_BOT_TOKEN`, `JIRA_TOKEN`, `OPENAI_API_KEY`, … | the matching adapter pack — see [`.env.example`](./.env.example) |

---

## Tool catalog

<details>
<summary><b>All 26 categories — 572 tools</b></summary>

| Category | Tools | Category | Tools |
|---|---:|---|---:|
| github | 49 | monitoring | 10 |
| browser *(Playwright)* | 41 | search | 20 |
| convert | 30 | http | 19 |
| collaboration *(Slack/Linear/Jira/Notion)* | 28 | knowledge *(local store)* | 18 |
| data | 26 | productivity *(Gmail/Calendar/Todoist)* | 18 |
| research | 26 | storage *(S3/Drive/Dropbox/OneDrive)* | 16 |
| codehost *(GitLab/Gitea/Forgejo/Bitbucket)* | 25 | archive | 15 |
| admin *(discovery, metrics, policy)* | 24 | docs *(arXiv/npm/PyPI/RFC/PubMed)* | 15 |
| database *(SQLite/Postgres/MySQL/Redis)* | 24 | media *(sharp/EXIF/QR/OCR/PDF)* | 15 |
| devops *(docker/kubectl/terraform/npm)* | 24 | apitest *(OpenAPI/GraphQL/WSDL)* | 12 |
| extract *(CSS/XPath/JSONPath/OG)* | 24 | auth *(sessions & keys, in-memory only)* | 12 |
| security *(OSV/secret scan/SBOM)* | 24 | i18n | 12 |
| git | 23 | crawl | 22 |

</details>

---

## Security model

- **SSRF guard** — outbound HTTP(S) resolves and verifies DNS, then pins the connection.
  `HTTP_PROXY`/`HTTPS_PROXY` require explicit opt-in, because a remote proxy resolves DNS itself.
- **Workspace sandbox** — with `PRO_FETCH_OUTPUT_ROOT`, every `output_path` and browser
  `storage_state_path` write is contained. Symlinks and junctions are followed and rejected on escape.
- **GitHub input guard** — `owner`/`repo`/`path`/`gist_id`/SHAs are validated centrally; traversal,
  deep paths and API-relevant characters are rejected.
- **Redirect safety** — credentials are stripped on cross-origin hops, HTTPS→HTTP downgrades are
  blocked, and redirect *loops* are reported as bot protection rather than as a hop count.
- **Process hardening** — media bytes are identified by signature *before* any decoder sees them, so a
  hostile file cannot crash a worker thread. Every `import().then()` chain carries a `.catch()`, and
  `uncaughtException`/`unhandledRejection` handlers log to stderr instead of killing the server.
- **Secrets** — diagnostics report only whether a credential is present and where it came from, never
  its value.

Full boundary list: [SECURITY.md](./SECURITY.md).

---

## Requirements

**Node.js ≥ 22.13** — required by `pdfjs-dist@6`. Everything else is optional, and the server tells
you what it needs:

| Optional dependency | What happens without it |
|---|---|
| `sharp`, `@napi-rs/canvas`, `tesseract.js` binaries | media tools fail individually; the rest of the server is unaffected |
| `git`, `docker`, `kubectl`, `terraform`, `psql`, `redis-cli` | those tools answer `COMMAND_NOT_FOUND` with a precise message |
| Playwright browsers | the browser pack reports it needs `npx playwright install --with-deps chromium` |
| npm build scripts *(`--ignore-scripts`)* | SQLite tools report `SQLITE_UNAVAILABLE` with the fix (`npm rebuild better-sqlite3`) |

SQLite needs **no system binary** — it uses the bundled `better-sqlite3` driver; the `sqlite3` CLI is
only a fallback. On Windows, npm tools invoke `npm-cli.js` through `process.execPath`, so
`npm audit`, `npm outdated` and license reports work there too.

---

## Development

```bash
npm ci
npm run check   # verify:static → verify:registry → build → test → verify:package → format:check
```

What that runs, and what each is for:

| Step | What it proves |
|---|---|
| `verify:static` | structural invariants that must not regress: the tool count in `package.json` and in this file, the smart profile's required meta-tools, the intent-search synonym vocabulary, the absence of a template dispatcher in the MAX packs, OSV batch bounds, knowledge content size, Windows `npm-cli.js` resolution, and image-byte validation before OCR |
| `verify:registry` | boots the real registry: **572 tools / 26 categories / all four profile counts**, every tool has a schema and a handler, and the published counts in both READMEs still match |
| `test` | **306 tests** across 19 files — SSRF, redirects, permission policy, output sandbox, timeouts, every tool's input contract, live provider-failure behaviour |
| `verify:package` | the published tarball has its shebang and `files` allowlist, and **zero credentials or source files** |
| `audit:schema` *(on demand)* | schemas against their code — 0 dead properties, 0 unread required |

The MCP protocol itself was exercised live: `initialize`, `tools/list` (572/572 unique, valid
schemas), `tools/call` for every smart tool, hidden tools refused, clean JSON-RPC on stdout.

---

<div align="center">

**MIT** · [Oʻzbekcha](README.uz.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

</div>