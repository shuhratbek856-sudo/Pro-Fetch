<div align="center">

# pro-fetch-mcp

### 672 MCP tools · 42 categories · one security engine

Fetch, deep-research and GitHub as an MCP server — with a Smart System that composes the whole
catalog in a single round trip.

[![npm](https://img.shields.io/npm/v/pro-fetch-mcp?label=npm&logo=npm)](https://www.npmjs.com/package/pro-fetch-mcp)
[![node](https://img.shields.io/badge/node-%3E%3D22.13-5FA04E?logo=node.js)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/pro-fetch-mcp?color=blue)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-1038%20passing-success?logo=vitest)](./)

</div>

---

Most MCP clients choke on hundreds of tool schemas, so this server has two faces:

| | What you get | Use it when |
|---|---|---|
| **`smart`** *(default)* | 11 meta-tools that reach all 672 | You want small context and full capability |
| **`full`** | every tool listed individually | Your client can afford the schemas |

Either way every call goes through the same central `dispatch()` gate. **Composition never weakens
the security boundary.**

---

## ✨ Why

**🔒 Security is the engine, not a warning.** SSRF guard with DNS pinning, workspace sandbox with
symlink tracking, per-call permission policy, credential stripping on cross-origin redirects, HTTPS→HTTP
downgrade blocking. Composite calls pass the same gate as direct ones.

**🧩 672 working tools.** Fetch, crawl, extract, convert, OCR, web and academic search, deep research,
git, GitHub, GitLab/Gitea/Forgejo/Bitbucket, SQLite/Postgres/MySQL/Redis, OSV and SBOM,
Slack/Jira/Linear/Notion, S3/Drive/Dropbox. Every one is a real implementation.

**📐 Schemas that match the code.** `npm run audit:schema` compares every schema against the code
behind it - currently **0 dead properties, 0 unread required arguments**, and all 672 schemas reject
properties they do not declare.

**♻️ Degrades, never dies.** Native binaries are lazy-loaded. A missing `git`, `docker` or `kubectl`
produces a precise `COMMAND_NOT_FOUND`. The server boots and serves 500+ tools on a host with none of
them installed.

---

## 🚀 Install

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

Ready-to-copy config: [`mcp.example.json`](./mcp.example.json)

---

## 🧠 The Smart System

`smart` shows the model **11 tools** that compose everything else:

| Tool | What it does |
|---|---|
| `pro_capability_call` | **Batch executor** — runs a list of `{tool, arguments}` in one call; each result carries its own `ok`/`error` |
| `pro_synthesize` | Collapses many tool results into one coherent answer |
| `pro_capability_map` | Plain-language task → exact tools with their schemas (BM25 + morphological expansion) |
| `pro_fetch_tool_execute` | Call any tool by exact name |
| `pro_research_deep` | Search → read → facts → verify → report |
| `pro_fetch_ingest` | Any URL → clean structured data (page, PDF, CSV, feed) |
| `pro_audit_page` | One page → every relevant extraction |
| `pro_repo_audit` | Repo → full report (metadata, README, tree, issues, PRs, releases) |
| `pro_pr_review` | PR → full review (diff, checks, reviews, comments) |
| `pro_site_scan` | Crawl a site and explain it |
| `pro_data_pipeline` | Load, profile and transform a dataset |

**Three round trips become one:**

```jsonc
{ "tool": "pro_capability_call", "arguments": { "calls": [
  { "tool": "pro_fetch_web_search",      "arguments": { "query": "RAG architecture 2025" }, "label": "search" },
  { "tool": "pro_fetch_academic_search", "arguments": { "query": "retrieval augmented generation" }, "label": "papers" },
  { "tool": "pro_fetch_news_search",     "arguments": { "query": "RAG news" }, "label": "news" }
]}}
```

**Then three answers become one paragraph:**

```jsonc
{ "tool": "pro_synthesize", "arguments": {
  "results": [
    { "tool": "pro_fetch_web_search",      "output": "…" },
    { "tool": "pro_fetch_academic_search", "output": "…" },
    { "tool": "pro_fetch_news_search",     "output": "…" }
  ],
  "task": "Summarise the current state of RAG, citing where each claim comes from"
}}
```

`pro_capability_map`'s `detail` mode is worth knowing: it cut a 17-step audit from **43 KB to 3.8 KB** —
91% token savings, measured.

---

## ⚙️ Configuration

`PRO_FETCH_PROFILE` controls **how many schemas the model sees**. It is *not* the security boundary.

| Profile | Tools | Contents |
|---|---:|---|
| `minimal` | 73 | http, convert, admin |
| `standard` *(default)* | 178 | + github, search, extract, auth |
| `smart` | 11 | the Smart System above |
| `full` | 672 | everything |

The profile can also be changed **at runtime** — `pro_fetch_profile_switch` takes effect on the next
request, and asking for `full` switches to `full`:

```json
{"tool": "pro_fetch_profile_switch", "arguments": {"profile": "full"}}
```

Set `PRO_FETCH_PROFILE_CEILING` to pin a maximum the switch may not pass. Unset by default, because
the operator's instruction is what should govern; set it when the server is shared and the model must
stay inside a smaller surface regardless of what is asked.

Real access control lives in the environment and is enforced on **every** call, including calls made
through the meta-executor:

- `PRO_FETCH_ALLOWED_TOOLS` — allowlist by name or `*`
- `PRO_FETCH_DENIED_TOOLS` — denylist, applied after the allowlist
- `PRO_FETCH_DENIED_CATEGORIES` — deny whole categories
- `PRO_FETCH_READ_ONLY` — block every mutating operation
- `PRO_FETCH_MUTATION_ALLOWLIST` — permit specific mutations under read-only
- `PRO_FETCH_OUTPUT_ROOT` — contain every file write

If `pro_capability_call` itself is not on the allowlist, it does not run.

---

## 🚦 Simple and MAX mode

`PRO_FETCH_MODE` selects how much capacity one batch may use. **Simple is the default**, and it behaves
exactly as the versions before this option existed.

| | simple *(default)* | MAX |
|---|---|---|
| calls per `pro_capability_call` | 5 000 | 9 999 999 999 |
| concurrency, network, category | 64 / 64 / 16 | 512 each |
| how a large batch runs | one batch | chunked, `PRO_FETCH_BATCH_CHUNK` (1000) at a time |
| self-serve ceiling | — | `PRO_FETCH_MAX_SELF_SERVE` (99 999), then the user is asked |

```bash
PRO_FETCH_MODE=max          # MAX, server-wide
PRO_FETCH_MAX_BATCH=250     # holds MAX back down, in either mode
```

The model can also pick per batch, which is usually what you want — the size of a sweep is a decision
about the work, not about the server:

```json
{ "tool": "pro_capability_call", "mode": "max", "calls": [ … ] }
```

`mode` on a call lifts **that batch's** ceiling only. It cannot widen concurrency, because the semaphores
are built at start-up and a handler runs after — so `PRO_FETCH_MODE=max` remains the only way to raise
those, and the two are deliberately not interchangeable. Omitting `mode` uses the server's setting.

MAX exists for one job the default cannot do: a sweep whose size is counted in the thousands rather than
the dozens — reading a whole repository, or crawling a documentation set. It raises *capacity* only.
It is not a reach grant: lifting these four numbers cannot reach anything a single small call could not
already reach.

Above the self-serve line the tool **refuses and says so**, because "read everything in this project"
can mean four hundred requests or four hundred thousand, and only the person asking knows which was
meant. The caller re-sends with `confirm_large_batch: true` after the user agrees.

**What MAX mode does not change.** Network containment is not capacity, and none of it moves:

- private, loopback, link-local and `.internal` addresses stay blocked
- the protocol allowlist stays — no `file:`, no `gopher:`
- credentials in a URL stay rejected
- DNS pinning stays — the connection remains on the address that was checked
- `PRO_FETCH_OUTPUT_ROOT` containment, symlink-escape detection, and credential layering are untouched

`tests/mode.test.ts` asserts the security probes **with MAX mode switched on**, so a future change that
routes a containment limit through the mode fails the suite instead of shipping quietly.

One capacity ceiling is also held in MAX mode: `PRO_FETCH_MAX_PER_HOST_CONCURRENCY`. Every other bound
limits what this process can do; that one limits how many requests reach a *single remote host*, so
raised without limit a batch becomes a denial of service aimed at somebody else's server. It stays at
8 by default and at 512 at most. It is listed by name in `src/core/bounded-env.ts` so the decision is a
visible edit rather than something buried in a comment.

---

## 🔑 Credentials

Put credentials in a `.env` next to the server, or use `*_FILE` env vars pointing at a file —
**never the value itself**. `.env` is never committed and never ships in the npm package.

| Credential | Unlocks |
|---|---|
| `GITHUB_TOKEN` | code search, private repos, higher rate limits |
| `SERPER_API_KEY` | Google-backed web search |
| `OPENAI_API_KEY` | audio transcription, embedding hybrid retrieval |
| `SEARCH_API_KEY` | Brave search (DuckDuckGo fallback otherwise) |
| `GITLAB_TOKEN`, `SLACK_BOT_TOKEN`, `JIRA_TOKEN`, … | the matching adapter pack — see [`.env.example`](./.env.example) |

---

## 📦 Tool catalog

The complete, per-tool reference — every name and description, generated straight from the running
registry with `npm run dump:catalog` — lives in [`docs/TOOL_CATALOG.md`](docs/TOOL_CATALOG.md). For a
source-grounded system map (entry point, `dispatch()` gate, composites, profiles, MAX mode), see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

<details>
<summary><b>All 42 categories - 672 tools</b></summary>

| | | |
|---|---|---|
| 🐙 github — **49** | 🎭 browser *(Playwright)* — **41** | 🔄 convert — **30** |
| 💬 collaboration — **28** | 📊 data — **26** | 🔬 research — **26** |
| 🌿 codehost — **25** | 🛠 admin — **24** | 🗄 database — **24** |
| 📦 devops — **24** | 🧪 extract — **24** | 🛡 security — **24** |
| ⑂ git — **23** | 🕷 crawl — **22** | 🔎 search — **20** |
| 🌐 http — **19** | 🧠 knowledge — **18** | 📅 productivity — **18** |
| ☁ storage — **16** | 🗃 archive — **15** | 📚 docs — **15** |
| 🖼 media — **15** | 🔌 apitest — **12** | 🔐 auth — **12** |
| 🌐 i18n — **12** | 📈 monitoring — **10** | |

<sub>auth is an in-memory session and key store; storage covers S3, Drive, Dropbox and OneDrive;
docs covers arXiv, npm, PyPI, RFC and PubMed.</sub>

</details>

---

## 🛡 Security model

- **SSRF guard** — outbound HTTP(S) resolves and verifies DNS, then pins the connection.
  `HTTP_PROXY`/`HTTPS_PROXY` require explicit opt-in, because a remote proxy resolves DNS itself.
- **Workspace sandbox** — with `PRO_FETCH_OUTPUT_ROOT`, every `output_path` and browser
  `storage_state_path` write is contained. Symlinks and junctions are followed and rejected on escape.
- **GitHub input guard** — `owner`/`repo`/`path`/`gist_id`/SHAs are validated centrally; traversal, deep
  paths and API-relevant characters are rejected.
- **Redirect safety** — credentials are stripped on cross-origin hops, HTTPS→HTTP downgrades are
  blocked, and redirect *loops* are reported as bot protection rather than as a hop count.
- **Process hardening** — media bytes are identified by signature *before* any decoder sees them, so a
  hostile file cannot crash a worker thread. Every `import().then()` chain carries a `.catch()`, and
  `uncaughtException`/`unhandledRejection` handlers log to stderr instead of killing the server.
- **Secrets** — diagnostics report only whether a credential is present and where it came from, never
  its value.

Full boundary list: [SECURITY.md](./SECURITY.md)

---

## 📋 Requirements

**Node.js ≥ 22.13** — required by `pdfjs-dist@6`. Everything else is optional, and the server tells
you exactly what it needs:

| Optional dependency | What happens without it |
|---|---|
| `sharp`, `@napi-rs/canvas`, `tesseract.js` binaries | media tools fail individually; the rest of the server is unaffected |
| `git`, `docker`, `kubectl`, `terraform`, `psql`, `redis-cli` | those tools answer `COMMAND_NOT_FOUND` with a precise message |
| Playwright browsers | the browser pack reports it needs `npx playwright install --with-deps chromium` |
| npm build scripts *(`--ignore-scripts`)* | SQLite tools report `SQLITE_UNAVAILABLE` with the fix (`npm rebuild better-sqlite3`) |

SQLite needs **no system binary** — it uses the bundled `better-sqlite3` driver; the `sqlite3` CLI is
only a fallback. On Windows, npm tools invoke `npm-cli.js` through `process.execPath`, so `npm audit`,
`npm outdated` and license reports work there too.

---

## 🛠 Development

```bash
npm ci
npm run check   # verify:static → verify:registry → build → test → verify:package → format:check
```

Each step answers a different question:

| Step | What it proves |
|---|---|
| `verify:static` | Structural invariants must not regress: the tool count in `package.json` and in the READMEs, the smart profile's required meta-tools, the intent-search synonym vocabulary, no template dispatcher in the MAX packs, OSV batch bounds, knowledge content size, Windows `npm-cli.js` resolution, image-byte validation before OCR |
| `verify:registry` | Boots the real registry: **672 tools / 42 categories / all four profile counts**, every tool has a schema and a handler, and the published counts in both READMEs still match |
| `test` | **1038 tests** across 49 files - SSRF, redirects, permission policy, output sandbox, timeouts, every tool's input contract, every internal tool reference, live provider-failure behaviour |
| `verify:package` | The published tarball has its shebang and `files` allowlist, and **zero credentials or source files** |
| `audit:schema` *(on demand)* | Schemas against their code — 0 dead properties, 0 unread required |

The MCP protocol itself was exercised live: `initialize`, `tools/list` (672/672 unique, valid schemas),
`tools/call` for every smart tool, hidden tools refused, clean JSON-RPC on stdout.

---

<div align="center">

**MIT** · [Oʻzbekcha](README.uz.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

</div>