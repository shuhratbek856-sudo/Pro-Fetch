# Tool Expansion Plan — 572 → 1000

> Grounded in a measured inventory of the 572 registered tools, plus research on the surrounding API
> and MCP ecosystem. Counts are targets for planning, not claims that the tools exist.

**Last updated:** 2026-10-15

## Baseline (measured, `PRO_FETCH_PROFILE=full`)

572 tools across 26 categories. The 428-tool gap is not a shortage of ideas — it is concentrated in
whole categories that do not exist yet, plus depth in categories that stopped at the obvious CRUD.

| Category | Count | Note |
|---|---:|---|
| github | 49 | deepest category; genuinely covered |
| browser | 41 | deep |
| convert | 30 | deep |
| collaboration | 28 | Slack-shaped |
| research | 26 | good |
| data | 26 | good |
| codehost | 25 | GitLab + Gitea + Bitbucket |
| extract | 24 | good |
| admin | 24 | meta-executor |
| devops | 24 | Docker + K8s |
| database | 24 | SQLite-shaped |
| security | 24 | good |
| git | 23 | local git |
| crawl | 22 | good |
| search | 20 | good |
| http | 19 | good |
| knowledge | 18 | good |
| productivity | 18 | Gmail-shaped |
| storage | 16 | Dropbox-shaped |
| media | 15 | good |
| archive | 15 | cache + Wayback |
| docs | 15 | arXiv/DOI/PubMed/RFC |
| auth | 12 | thin |
| apitest | 12 | thin |
| i18n | 12 | thin |
| monitoring | 10 | thinnest |

## What the research showed is missing

Signals, in descending weight:

- **Knit MCP advertises 10 000+ tools across HRIS, ATS, CRM, Accounting, Calendar, Meeting, Ticketing.**
  None of those seven verticals exist here at all.
- **Firecrawl's 2026 list names GitHub, Vercel, Linear, Notion, Supabase, Stripe, Figma** as the hosted
  MCP default. Only GitHub and Supabase-shaped database work is present.
- **MapTiler-class geospatial** — geocoding, reverse geocoding, static maps, elevation, vector tiles.
  Nothing in the 26 categories touches coordinates.
- **apis.io industry taxonomy** covers weather, geospatial, finance, healthcare, legal, education,
  travel, jobs, real estate — as separate industries. Pro-Fetch has one `search` category spanning all
  of them thinly instead of one category each.

## Proposed new categories — 430 tools

Ordered by value-per-tool, which is not the same as category size. A category earns its place when a
whole job becomes possible that no combination of existing tools can do today.

### Tier 1 — whole jobs that are impossible today (≈ 180)

| Category | Target | Why it cannot be assembled from what exists |
|---|---:|---|
| `llm` | 26 | No provider can be called. No embeddings, no rerank, no model routing, no token accounting. |
| `finance` | 22 | Stripe/ledger/invoice/rate/tax. Payments is the single largest SaaS integration surface. |
| `crm` | 20 | Salesforce/HubSpot objects, deals, contacts, activities. |
| `calendar` | 18 | Google/Outlook/CalDAV events, free-busy, recurrence. `productivity` is Gmail only. |
| `hr` | 18 | HRIS/ATS — jobs, candidates, offers, payroll exports. |
| `maps` | 16 | geocode, reverse-geocode, routes, places, elevation, distance-matrix. |
| `ticketing` | 16 | Jira/Linear/YouTrack — issues, boards, transitions. `codehost` covers the git side only. |
| `design` | 14 | Figma files, nodes, variables, export. |
| `queues` | 14 | Kafka/SQS/RabbitMQ/NATS produce, consume, ack, dead-letter. |
| `vector` | 14 | index, upsert, query, filter, hybrid search. |

### Tier 2 — formats and protocols the pipeline cannot yet speak (≈ 130)

| Category | Target | Gap |
|---|---:|---|
| `graphqlish` | 14 | GraphQL schema introspect, query, persisted queries. |
| `binary` | 16 | Parquet, Arrow, Avro, MessagePack, CBOR, Protobuf, gRPC reflection. |
| `spreadsheet` | 16 | xlsx/ods read+write, formulas, sheets, ranges. |
| `imageproc` | 16 | resize, crop, convert, watermark, sprite, EXIF write, colour space. |
| `audiovideo` | 14 | FFmpeg wrapper: transcode, trim, concat, thumbnails, waveform, loudness. |
| `emailparse` | 12 | RFC822/MIME parse, attachments, DKIM/SPF headers, thread reconstruction. |
| `document` | 14 | PDF merge/split/rotate/form-fill/watermark, DOCX read/write. |
| `datastore` | 12 | Redis, Elasticsearch, ClickHouse, InfluxDB, Neo4j, Postgres wire. |
| `schema` | 10 | JSON Schema validate/coerce/generate, OpenAPI generate from code. |
| `encoding` | 6 | base64/32/58/85, URL, HTML entity, punycode, JWT decode, JWT verify. |

### Tier 3 — verticals with thin-but-present roots (≈ 80)

| Category | Target | Existing root to deepen |
|---|---:|---|
| `weather` | 12 | none — new, but small and self-contained |
| `geo_data` | 10 | none — OpenStreetMap, Nominatim, Overpass |
| `govdata` | 12 | none — data.gov, CKAN, SEC EDGAR, Congress, USPTO |
| `science` | 10 | `docs` has arXiv/PubMed; add NASA, NOAA, USGS, PDB, Crossref, OpenAlex |
| `finance_data` | 10 | none — quotes, fundamentals, FX, crypto prices, indices |
| `legal` | 8 | none — CourtListener, EUR-Lex, patents |
| `education` | 8 | none — course catalogs, standards, open textbooks |
| `seofit` | 8 | `monitoring` has URL watch; add SERP, backlinks, Core Web Vitals |
| `identity` | 8 | `auth` is 12 tools of credentials; add SCIM, OIDC discovery, JWKS, SAML metadata |
| `ads` | 8 | none — Google/Meta Ads read + reporting |

### Tier 4 — depth in existing categories (≈ 40)

| Category | Target | Specific holes |
|---|---:|---|
| `devops` | +12 | Helm, Terraform plan/state, ArgoCD, Prometheus queries, Grafana, Vault |
| `security` | +10 | Semgrep, Trivy, Gitleaks, nuclei, CVSS scoring, SBOM generation |
| `browser` | +8 | CDP sessions, network interception, HAR capture, cookie jars, storage state |
| `git` | +6 | bisect, worktree, sparse-checkout, submodules, notes, hooks |
| `media` | +4 | sprite sheets, colour extraction, dominant colour, thumbnail grid |

**Total: 180 + 130 + 80 + 40 = 430.** 572 + 430 = 1002, then reconcile to 1000 by trimming the two
weakest Tier 4 entries — the number should land on 1000 by measurement, not by assertion.

## Sequencing

Each wave must leave the repository green and must not weaken an existing category to fund a new one.

1. **Wave 0 — foundations.** `llm` first, because embeddings and reranking are inputs to `research`,
   `knowledge` and `vector`. 26 tools, unlocks three other categories.
2. **Wave 1 — formats.** `binary`, `spreadsheet`, `graphqlish`, `encoding`, `schema`. Pure functions,
   high test coverage per tool, no credentials.
3. **Wave 2 — vertical SaaS.** `finance`, `crm`, `calendar`, `ticketing`, `design`, `hr`. Each needs a
   credential shape; the credential layer already exists from `auth`.
4. **Wave 3 — infrastructure.** `queues`, `datastore`, `vector`, `devops` depth.
5. **Wave 4 — verticals.** weather, geo_data, govdata, science, finance_data, legal, education, seo,
   identity, ads.

Per tool, the bar is the existing bar: a schema whose properties match what the handler reads, a real
handler that performs the operation, an entry in `tool-counts.json`, a test, and a hand-verified call.
`tests/composite-tool-names.test.ts` already rejects a tool that references a name that does not exist —
that is what let three broken composites ship for months.

## Not claimed

- No tool in the table above exists yet. These are targets derived from a measured inventory and from
  research, and each one still has to earn its schema against a real handler.
- The 428 figure is arithmetic on measured numbers, not a delivered capability.
- The category boundaries are proposals. `geo_data` vs `maps` and `finance` vs `finance_data` are the
  two that are most likely to be wrong, and both should be settled before implementation rather than
  after 80 tools exist on the wrong side of the line.
