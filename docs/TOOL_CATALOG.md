# Pro-Fetch — To'liq tool katalogi

> Bu fayl **`npm run dump:catalog`** (skript: `scripts/dump-catalog.mts`) orqali **haqiqiy reestr**dan
> avtomatik generatsiya qilinadi — qo'lda yozilmagan. Shu sababli nom va tavsiflar server
> `tools/list` da ko'rsatganningsizdan ham o'zgarmas. Qayta generatsiya:
> `npx tsx scripts/dump-catalog.mts`

**Jami:** 672 ta tool · 42 ta kategoriya · smart=11, minimal=73, standard=178, full=672

Belgilar: `S` = smart meta-toʻplamiga kiradi · `▸` = minimal/standard profilda ko'rinadi · `·` = faqat `full` profil.

## Kategoriya xulosasi

| Kategoriya | Tool | Nima bor |
|---|---:|---|
| `github` | 49 | GitHub API: repos, code, issues, PRs, releases, actions, advisories |
| `browser` | 41 | Playwright automation: navigate, click, fill, extract, tabs, cookies |
| `convert` | 30 | Format conversion: HTML/MD, CSV/JSON, image, units, encodings, etc. |
| `collaboration` | 28 | Slack / Jira / Linear / Notion issues, comments, transitions |
| `data` | 26 | Load, profile, query, join, transform datasets (tables) |
| `research` | 26 | Deep research pipeline: search → read → facts → verify → report |
| `codehost` | 25 | GitLab / Gitea / Forgejo / Bitbucket repos, issues, PRs, releases |
| `admin` | 24 | Smart System meta-tools, registry/config, diagnostics, batching |
| `database` | 24 | SQLite / Postgres / MySQL / Redis query & inspect (read-only gated) |
| `devops` | 24 | Docker / Kubernetes / Terraform / CI operations (COMMAND_NOT_FOUND safe) |
| `extract` | 24 | DOM/selector/regex/table/metadata extraction from HTML |
| `security` | 24 | OSV/SBOM scanning, header/CSP checks, secrets & CVE lookups |
| `git` | 23 | Local git: status, diff, log, blame, branch operations |
| `crawl` | 22 | Site crawl, sitemap/robots, link graph, site explain |
| `search` | 20 | Web, news, image, academic & vertical search (Serper/Brave/DDG) |
| `http` | 19 | HTTP client verbs, headers, retries, multipart, SSE/websocket |
| `knowledge` | 18 | Local knowledge store / embeddings / retrieval |
| `productivity` | 18 | Tasks, notes, calendars, snippets (provider-backed) |
| `storage` | 16 | S3 / Drive / Dropbox / OneDrive file operations |
| `archive` | 15 | Wayback + Internet Archive, local cache store, snapshots & diffs |
| `docs` | 15 | arXiv / npm / PyPI / RFC / PubMed package & paper metadata |
| `media` | 15 | Audio/video/image info, transcode, thumbnails, waveform |
| `document` | 13 | PDF / DOCX / XLSX / PPTX parse & text extraction |
| `apitest` | 12 | REST/GraphQL/OpenAPI/SOAP: fetch, parse, validate, mock, diff, probe |
| `auth` | 12 | Sessions, cookies, basic/bearer fetch, OAuth device flow, scope audit |
| `i18n` | 12 | Translate, transliterate, locale & RTL helpers |
| `sql` | 11 | — |
| `monitoring` | 10 | Watches, health checks, scheduled fetch & change alerts |
| `encoding` | 9 | Base64/URL/hex/hash/compress codecs |
| `imageproc` | 9 | Image processing: resize, crop, EXIF, QR, OCR pre/post |
| `qr` | 9 | — |
| `schema` | 6 | JSON Schema / validation / inference helpers |
| `llm` | 5 | LLM gateway: complete, embed, structured output |
| `opendata` | 5 | Public open-data providers (Crossref, OpenLibrary, Patents, GDELT) |
| `time` | 5 | Date/time parsing, diff, relative formatting, cron helpers |
| `units` | 5 | Unit & number formatting/normalization |
| `zip` | 5 | Archive (zip/tar) list, extract, create |
| `binary` | 4 | Parquet / Arrow / Avro / Protobuf readers (schema + rows) |
| `chess` | 4 | FEN parse/validate, legal moves, perft, square & position analysis |
| `geo_data` | 4 | Geo / maps / timezone / country helpers |
| `color` | 3 | Color conversion & contrast helpers |
| `phonetics` | 3 | Phonetic transcription helpers |

---

## github (49)

_GitHub API: repos, code, issues, PRs, releases, actions, advisories_

- `pro_gh_actions_runs` `  ▸` — List GitHub Actions workflow runs
- `pro_gh_branches_list` `  ▸` — List the branches of a repository
- `pro_gh_code_search` `  ▸` — Search code across GitHub repositories
- `pro_gh_commit_read` `  ▸` — Read one commit with its full diff
- `pro_gh_commits_list` `  ▸` — List commits with author and message filters
- `pro_gh_gist_read` `  ▸` — Read a Gist by ID
- `pro_gh_issue_comments` `  ▸` — Read the comments of an issue
- `pro_gh_issue_read` `  ▸` — Read a single issue with body and labels
- `pro_gh_issue_timeline` `  ▸` — Get the full event timeline of an issue
- `pro_gh_issues_list` `  ▸` — List repository issues with filters
- `pro_gh_issues_search` `  ▸` — Advanced issue search by label author and state
- `pro_gh_org_repos` `  ▸` — List the repositories of an organization
- `pro_gh_pr_checks` `  ▸` — Get CI check run statuses for a pull request
- `pro_gh_pr_diff` `  ▸` — Get the diff of a pull request
- `pro_gh_pr_files` `  ▸` — List the files changed in a pull request
- `pro_gh_pr_read` `  ▸` — Read a pull request with metadata and description
- `pro_gh_pr_review_comments` `  ▸` — Read inline review comments of a pull request
- `pro_gh_pr_reviews` `  ▸` — List the reviews of a pull request
- `pro_gh_prs_list` `  ▸` — List pull requests with open closed or merged filters
- `pro_gh_release_diff` `  ▸` — Get the diff between two releases
- `pro_gh_release_read` `  ▸` — Read one release (by tag, or the latest) with notes and assets
- `pro_gh_releases_list` `  ▸` — List releases with notes
- `pro_gh_repo_commit_activity` `  ▸` — Get weekly commit activity for the last year
- `pro_gh_repo_compare` `  ▸` — Compare two branches or commits
- `pro_gh_repo_contributors` `  ▸` — List repository contributors ranked by commit count
- `pro_gh_repo_dependents` `  ▸` — Get packages depending on this repository
- `pro_gh_repo_directory_read` `  ▸` — Read all files in a repository directory
- `pro_gh_repo_docs_extract` `  ▸` — Extract the docs folder plus CONTRIBUTING and ARCHITECTURE
- `pro_gh_repo_file_blame` `  ▸` — Get per-line authorship blame approximation of a file
- `pro_gh_repo_file_history` `  ▸` — Get the commit history of a single file
- `pro_gh_repo_file_read` `  ▸` — Read a single file from a repository in chunks
- `pro_gh_repo_fork_network` `  ▸` — Get the fork network of a repository
- `pro_gh_repo_full_clone` `  ▸` — Download a repository tarball for deep analysis
- `pro_gh_repo_info` `  ▸` — Get repository metadata such as language stars and license
- `pro_gh_repo_languages` `  ▸` — Get the language breakdown of a repository
- `pro_gh_repo_license` `  ▸` — Detect and return the repository license
- `pro_gh_repo_raw_file` `  ▸` — Fetch raw file content from a ref
- `pro_gh_repo_readme` `  ▸` — Fetch and render a repository README
- `pro_gh_repo_search` `  ▸` — Search repositories on GitHub
- `pro_gh_repo_stats` `  ▸` — Get contributors and participation statistics
- `pro_gh_repo_structure_summary` `  ▸` — Produce an AI-oriented map of what each folder does
- `pro_gh_repo_submodules` `  ▸` — List repository submodules
- `pro_gh_repo_topics` `  ▸` — List repository topics and tags
- `pro_gh_repo_tree` `  ▸` — List the full repository file tree with lazy loading
- `pro_gh_repo_wiki_read` `  ▸` — Read repository wiki pages
- `pro_gh_tags_list` `  ▸` — List the tags of a repository
- `pro_gh_user_profile` `  ▸` — Get a GitHub user profile and stats
- `pro_pr_review` `S ▸` — Review one pull request end to end: description, diff, changed files, checks, reviews, inline comments and issue timeline in a single call.
- `pro_repo_audit` `S ▸` — Full GitHub repository audit in one call: metadata, README, directory structure, languages, license, contributors, commit activity, open issues and pull requests, releases, topics and optionally CI status. Use this instead of calling a dozen GitHub tools by hand.

## browser (41)

_Playwright automation: navigate, click, fill, extract, tabs, cookies_

- `pro_browser_browser_action` `  ·` — Advanced browser actions: back, forward, get_state, get_html, get_text, get_url, get_title, hover, select, press, new_tab, list_tabs, switch_tab, close_tab, cookies_get, cookies_set, handle_dialog, list_sessions, close_session, close_all
- `pro_browser_browser_back` `  ·` — Go back in the browser session history
- `pro_browser_browser_clear_cookies` `  ·` — Clear all cookies in the browser session
- `pro_browser_browser_click` `  ·` — Click an element by selector in the open session
- `pro_browser_browser_close` `  ·` — Close the browser session
- `pro_browser_browser_close_all` `  ·` — Close all browser sessions
- `pro_browser_browser_close_session` `  ·` — Close a specific browser session and persist its state
- `pro_browser_browser_close_tab` `  ·` — Close a tab by index
- `pro_browser_browser_console_log` `  ·` — Read the browser console logs
- `pro_browser_browser_cookies` `  ·` — Get or set browser cookies for the session
- `pro_browser_browser_device_emulate` `  ·` — Emulate a device such as mobile tablet or desktop
- `pro_browser_browser_dialog` `  ·` — Arm handling of the next alert/confirm/prompt dialog (accept/dismiss)
- `pro_browser_browser_download` `  ·` — Click a selector and capture the resulting download
- `pro_browser_browser_drag` `  ·` — Drag an element and drop it onto a target selector
- `pro_browser_browser_evaluate_js` `  ·` — Evaluate JS in the page and requires PRO_FETCH_ALLOW_JS
- `pro_browser_browser_extract_after_action` `  ·` — Extract content after an interaction step
- `pro_browser_browser_form_fill` `  ·` — Shaklni maydonlar xaritasi orqali to‘ldirish va yuborish. fields - CSS selektor -> qiymat obyekti. submit_selector berilsa, shu tugma bosiladi; berilmasa, shakl yuborilmaydi va faqat qiymatlar to‘ldirilgan holda qoladi.
- `pro_browser_browser_forward` `  ·` — Go forward in the browser session history
- `pro_browser_browser_get_html` `  ·` — Return the full rendered HTML of the current page
- `pro_browser_browser_get_state` `  ·` — Return an accessibility-style state snapshot (links, buttons, inputs)
- `pro_browser_browser_get_text` `  ·` — Return the visible text content of the current page
- `pro_browser_browser_get_title` `  ·` — Return the current page title
- `pro_browser_browser_get_url` `  ·` — Return the current page URL
- `pro_browser_browser_hover` `  ·` — Hover over an element matched by CSS selector
- `pro_browser_browser_list_sessions` `  ·` — List all open browser session ids
- `pro_browser_browser_list_tabs` `  ·` — List all open tabs in the browser session
- `pro_browser_browser_login_session` `  ·` — Login oqimini bajarish va cookie saqlash. username_selector va password_selector orqali kirish ma’lumotlari to‘ldiriladi, submit_selector bosiladi va storage_state_path berilsa sessiya holati faylga yoziladi.
- `pro_browser_browser_network_log` `  ·` — Capture the network requests of the session
- `pro_browser_browser_new_tab` `  ·` — Open a new browser tab (optionally at a URL) and make it active
- `pro_browser_browser_open` `  ·` — Open a page in a headless browser session
- `pro_browser_browser_press_key` `  ·` — Press a keyboard key (optionally on a specific element)
- `pro_browser_browser_print_pdf` `  ·` — Print the current page to PDF
- `pro_browser_browser_reload` `  ·` — Reload the current page in the browser session
- `pro_browser_browser_screenshot` `  ·` — Screenshot the current browser state
- `pro_browser_browser_scroll` `  ·` — Scroll the page to bottom or by a number of pixels
- `pro_browser_browser_select` `  ·` — Select an option value in a <select> element
- `pro_browser_browser_set_headers` `  ·` — Set extra HTTP headers for all requests in the session
- `pro_browser_browser_switch_tab` `  ·` — Switch the active tab by index
- `pro_browser_browser_type` `  ·` — Type text into an input by selector
- `pro_browser_browser_upload_file` `  ·` — Upload a local file into a file input matched by selector
- `pro_browser_browser_wait` `  ·` — Wait for a selector navigation or timeout

## convert (30)

_Format conversion: HTML/MD, CSV/JSON, image, units, encodings, etc._

- `pro_fetch_atom_to_markdown` `  ▸` — Fetch an Atom feed and render items as Markdown
- `pro_fetch_csv_to_json` `  ▸` — Convert CSV to a JSON array
- `pro_fetch_csv_to_markdown_table` `  ▸` — Convert CSV to a Markdown table
- `pro_fetch_docx_to_markdown` `  ▸` — Convert a DOCX document to Markdown
- `pro_fetch_epub_to_text` `  ▸` — Extract text from an EPUB e-book
- `pro_fetch_html_to_markdown` `  ▸` — Convert raw HTML to clean Markdown
- `pro_fetch_html_to_text` `  ▸` — Convert HTML to plain text without markup
- `pro_fetch_ical_to_json` `  ▸` — Parse an iCalendar file into JSON events
- `pro_fetch_ipynb_to_markdown` `  ▸` — Convert a Jupyter notebook to Markdown with code and outputs
- `pro_fetch_json_minify` `  ▸` — Minify JSON by removing whitespace
- `pro_fetch_json_to_csv` `  ▸` — Convert a JSON array to CSV
- `pro_fetch_json_to_yaml` `  ▸` — Convert JSON to YAML
- `pro_fetch_markdown_to_html` `  ▸` — Convert simple Markdown to HTML
- `pro_fetch_mbox_to_text` `  ▸` — Parse an mbox email archive into text entries
- `pro_fetch_ocr_image` `  ▸` — Run OCR on an image and return detected text
- `pro_fetch_odt_to_text` `  ▸` — Extract text from an ODT document
- `pro_fetch_pdf_split_pages` `  ▸` — Split a PDF into page ranges and extract selected pages
- `pro_fetch_pdf_to_markdown` `  ▸` — Convert PDF to Markdown with structure preserved
- `pro_fetch_pdf_to_text` `  ▸` — Extract text from a PDF by URL
- `pro_fetch_pptx_to_text` `  ▸` — Extract text from PowerPoint slides
- `pro_fetch_readability_extract` `  ▸` — Extract the main article content from a cluttered page
- `pro_fetch_rss_to_markdown` `  ▸` — Fetch an RSS feed and render items as Markdown
- `pro_fetch_rtf_to_text` `  ▸` — Convert RTF to plain text
- `pro_fetch_text_to_json_lines` `  ▸` — Convert plain text lines to JSON Lines (JSONL)
- `pro_fetch_tsv_to_json` `  ▸` — Convert TSV to a JSON array
- `pro_fetch_vcard_to_json` `  ▸` — Parse vCard contacts into JSON
- `pro_fetch_xlsx_to_csv` `  ▸` — Convert an Excel sheet to CSV
- `pro_fetch_xlsx_to_json` `  ▸` — Convert an Excel sheet to JSON rows
- `pro_fetch_xml_to_json` `  ▸` — Convert XML to JSON
- `pro_fetch_yaml_to_json` `  ▸` — Convert YAML to JSON

## collaboration (28)

_Slack / Jira / Linear / Notion issues, comments, transitions_

- `pro_fetch_collab_jira_comments` `  ·` — jira: List issue comments. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_jira_issue_create` `  ·` — jira: Create issue after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_jira_issue_get` `  ·` — jira: Get issue. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_jira_issue_update` `  ·` — jira: Update issue after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_jira_projects` `  ·` — jira: List projects. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_jira_search` `  ·` — jira: Search Jira issues using JQL. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_jira_transitions` `  ·` — jira: List issue transitions. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_linear_issue_create` `  ·` — linear: Create issue after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_linear_issue_get` `  ·` — linear: Get issue. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_linear_issue_update` `  ·` — linear: Update issue after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_linear_issues` `  ·` — linear: List issues. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_linear_search` `  ·` — linear: Search issues/projects. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_linear_teams` `  ·` — linear: List teams. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_linear_users` `  ·` — linear: List users. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_notion_block_children` `  ·` — notion: List child blocks. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_notion_database_query` `  ·` — notion: Query database. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_notion_page_archive` `  ·` — notion: Archive page after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_notion_page_create` `  ·` — notion: Create page after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_notion_page_get` `  ·` — notion: Get page. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_notion_page_update` `  ·` — notion: Update page after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_notion_search` `  ·` — notion: Search pages and databases. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_slack_channels` `  ·` — slack: List conversations. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_slack_history` `  ·` — slack: Read channel history. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_slack_post_message` `  ·` — slack: Post message after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_slack_replies` `  ·` — slack: Read thread replies. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_slack_search` `  ·` — slack: Search messages. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_slack_user_get` `  ·` — slack: Get user profile. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_collab_slack_users` `  ·` — slack: List users. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.

## data (26)

_Load, profile, query, join, transform datasets (tables)_

- `pro_data_pipeline` `S ·` — Load and analyse a dataset in one call: fetch a CSV/JSON URL or accept inline data, parse it, profile the columns, compute statistics, run operations like sort/group/dedupe, and render the result as a table. Use for exploratory data analysis without a chain of parser tools.
- `pro_fetch_array_ops` `  ·` — Operate on a JSON array: unique, sort, reverse, flatten, chunk, first, last
- `pro_fetch_csv_stats` `  ·` — Compute summary statistics for CSV columns
- `pro_fetch_date_convert` `  ·` — Parse an ISO date or epoch timestamp and convert timezone
- `pro_fetch_dedupe_text` `  ·` — Remove near-duplicate passages from a text set
- `pro_fetch_diff_json` `  ·` — Diff two JSON documents with path output
- `pro_fetch_diff_text` `  ·` — Line by line diff of two texts
- `pro_fetch_encode_decode` `  ·` — Encode or decode text as Base64, URL or hex
- `pro_fetch_group_by` `  ·` — Group JSON rows by a key with counts
- `pro_fetch_hash_string` `  ·` — Hash text with SHA-256, SHA-1, MD5 or SHA-512
- `pro_fetch_json_diff` `  ·` — Deep-diff two JSON documents into added, removed, and changed paths
- `pro_fetch_json_flatten` `  ·` — Flatten nested JSON to a flat table
- `pro_fetch_jwt_decode` `  ·` — Decode a JWT header and payload without signature verification
- `pro_fetch_keyword_extract` `  ·` — Extract key terms from text
- `pro_fetch_language_detect` `  ·` — Detect the language or languages of a text
- `pro_fetch_merge_results` `  ·` — Merge multiple text results into one
- `pro_fetch_ner_extract` `  ·` — Extract named entities such as people orgs and places
- `pro_fetch_number_format` `  ·` — Format a number as decimal, currency or percent with locale
- `pro_fetch_query_string` `  ·` — Parse a URL query string to JSON or build one from JSON
- `pro_fetch_random_string` `  ·` — Generate a cryptographically random string from a charset
- `pro_fetch_readability_score` `  ·` — Compute Flesch readability metrics of a text
- `pro_fetch_sentiment_analyze` `  ·` — Score the sentiment of a text
- `pro_fetch_text_stats` `  ·` — Basic text statistics such as words sentences and reading time
- `pro_fetch_text_summarize` `  ·` — Produce an extractive summary of a long text
- `pro_fetch_uuid_generate` `  ·` — Generate RFC-4122 version 4 UUIDs
- `pro_fetch_word_frequency` `  ·` — Word frequency counts with stopwords removed

## research (26)

_Deep research pipeline: search → read → facts → verify → report_

- `pro_research_build_knowledge_graph` `  ·` — Build an entity-relation graph from gathered facts
- `pro_research_citation_format` `  ·` — Format citations in APA MLA or BibTeX for given sources
- `pro_research_citation_graph` `  ·` — Build a citation graph between gathered sources
- `pro_research_compare_sources` `  ·` — Compare how multiple sources describe the same topic
- `pro_research_contradiction_detect` `  ·` — Detect contradictions between sources
- `pro_research_crawl_for_topic` `  ·` — Crawl topically relevant pages for a research question
- `pro_research_cross_check` `  ·` — Cross-check a fact across two or more independent sources
- `pro_research_dedupe_sources` `  ·` — Remove duplicate or mirrored sources
- `pro_research_deep` `S ·` — Deep multi-source research on any topic. Runs the whole pipeline in one call: web/academic/news search, dedupe and rank the sources, fetch the best pages, extract facts, cross-check them, score the evidence and produce a cited report. Use this instead of chaining search and extraction tools by hand.
- `pro_research_entity_resolve` `  ·` — Resolve the same entity across differently named sources
- `pro_research_evidence_strength` `  ·` — Grade evidence strength for a set of claims
- `pro_research_extract_facts` `  ·` — Extract atomic facts with provenance from text
- `pro_research_fact_ledger` `  ·` — Read or append the persistent fact ledger for a session
- `pro_research_followup_questions` `  ·` — Generate follow-up questions from current findings
- `pro_research_gap_analysis` `  ·` — Identify unanswered gaps in current research notes
- `pro_research_gather_sources` `  ·` — Fetch a list of candidate source URLs in parallel
- `pro_research_hypothesis_generate` `  ·` — Generate testable hypotheses from findings
- `pro_research_multi_lang_research` `  ·` — Search the same question across multiple languages
- `pro_research_rank_sources` `  ·` — Rank sources by credibility and relevance
- `pro_research_research_iterate` `  ·` — Run one research iteration step of search fetch and note
- `pro_research_research_plan` `  ·` — Break a research question into 3-7 searchable sub-questions
- `pro_research_research_report` `  ·` — Compile a final cited research report
- `pro_research_research_summarize` `  ·` — Summarize the research state from gathered notes
- `pro_research_source_bias_detect` `  ·` — Detect bias indicators in a source
- `pro_research_timeline_build` `  ·` — Build a chronological timeline from dated facts
- `pro_research_verify_claim` `  ·` — Verify a single claim against given sources

## codehost (25)

_GitLab / Gitea / Forgejo / Bitbucket repos, issues, PRs, releases_

- `pro_fetch_codehost_bitbucket_branches` `  ·` — bitbucket: List branches. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_bitbucket_commits` `  ·` — bitbucket: List commits. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_bitbucket_issues` `  ·` — bitbucket: List issues. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_bitbucket_pulls` `  ·` — bitbucket: List pull/merge requests. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_bitbucket_repository` `  ·` — bitbucket: Repository metadata. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_bitbucket_tags` `  ·` — bitbucket: List version tags. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_forgejo_branches` `  ·` — forgejo: List branches. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_forgejo_commits` `  ·` — forgejo: List commits. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_forgejo_issues` `  ·` — forgejo: List issues. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_forgejo_pulls` `  ·` — forgejo: List pull/merge requests. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_forgejo_repository` `  ·` — forgejo: Repository metadata. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_forgejo_tags` `  ·` — forgejo: List version tags. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_gitea_branches` `  ·` — gitea: List branches. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_gitea_commits` `  ·` — gitea: List commits. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_gitea_issues` `  ·` — gitea: List issues. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_gitea_pulls` `  ·` — gitea: List pull/merge requests. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_gitea_repository` `  ·` — gitea: Repository metadata. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_gitea_tags` `  ·` — gitea: List version tags. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_gitlab_branches` `  ·` — gitlab: List branches. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_gitlab_commits` `  ·` — gitlab: List commits. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_gitlab_issues` `  ·` — gitlab: List issues. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_gitlab_pulls` `  ·` — gitlab: List pull/merge requests. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_gitlab_repository` `  ·` — gitlab: Repository metadata. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_codehost_gitlab_tags` `  ·` — gitlab: List version tags. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_service_ops` `  ·` — Run hosted-provider operations in one call across code hosts (GitLab/Gitea/Forgejo/Bitbucket), collaboration (Slack/Linear/Jira/Notion), cloud storage and productivity (Gmail/Calendar/Todoist). Give a list of operations and get every result together. Credentials must already be configured; an operation without one reports a configuration error rather than failing silently.

## admin (24)

_Smart System meta-tools, registry/config, diagnostics, batching_

- `pro_capability_call` `S ▸` — Execute a batch of Pro-Fetch tools in a single call. Send a list of { tool, arguments } and receive every result together, instead of one round trip per tool. Failures are reported per entry and do not stop the rest of the batch. This is the way to use the full tool set when your client limits how many tools you can see. Simple rejim (standart): 5000 tagacha bir chaqiruvda.
- `pro_capability_map` `S ▸` — Map a task in plain language to the exact Pro-Fetch tools that can do it, with full input schemas. Understands synonyms and word forms, so "papers about retrieval" finds the academic search tool and "look at this site" finds the crawler. Use this first when you know the goal but not the tool name.
- `pro_fetch_batch_schedule` `  ▸` — Schedule a batch fetch for later
- `pro_fetch_cache_tune` `  ▸` — Adjust cache TTL and size limits
- `pro_fetch_category_stats` `  ▸` — Report tool counts per category and per profile
- `pro_fetch_config_get` `  ▸` — Read the current server configuration
- `pro_fetch_config_set` `  ▸` — Update a configuration key at runtime
- `pro_fetch_diagnostics` `  ▸` — Run a full diagnostic report
- `pro_fetch_env_check` `  ▸` — Check required environment variables and API keys
- `pro_fetch_health_check` `  ▸` — Run server self diagnostics
- `pro_fetch_log_tail` `  ▸` — Tail the recent server logs
- `pro_fetch_memory_stats` `  ▸` — Report process memory usage and runtime uptime
- `pro_fetch_profile_switch` `  ▸` — Switch the active tool profile between smart, minimal, standard and full
- `pro_fetch_proxy_status` `  ▸` — Show proxy configuration and health
- `pro_fetch_rate_limit_status` `  ▸` — Show the rate-limit state per domain
- `pro_fetch_registry_summary` `  ▸` — Summarize the tool registry: totals, categories and profile sizes
- `pro_fetch_result_preview` `  ▸` — Preview a stored result with token counting
- `pro_fetch_token_count` `  ▸` — Count the tokens of provided text
- `pro_fetch_tool_execute` `S ▸` — Execute a discovered Pro-Fetch tool by exact name and JSON arguments; suitable for smart profile tool routing
- `pro_fetch_tool_list_details` `  ▸` — List all tools grouped by category with profile status
- `pro_fetch_tool_schema` `  ▸` — Return the full input schema of a named tool
- `pro_fetch_tool_search` `  ▸` — Search the tool registry by name or description keyword
- `pro_fetch_usage_stats` `  ▸` — Show tool usage statistics
- `pro_synthesize` `S ▸` — Turn many tool results into one coherent answer. Takes a list of { tool, output } (or a batch result from pro_capability_call) and produces findings ranked by source agreement, contradictions, and gaps. Use this after a batch when you need the answer, not the raw results.

## database (24)

_SQLite / Postgres / MySQL / Redis query & inspect (read-only gated)_

- `pro_fetch_database_mysql_describe` `  ·` — mysql: Describe table/key. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_mysql_explain` `  ·` — mysql: Explain read-only query. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_mysql_list_tables` `  ·` — mysql: List tables/keys. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_mysql_ping` `  ·` — mysql: Connectivity check. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_mysql_query` `  ·` — mysql: Execute read-only query. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_mysql_version` `  ·` — mysql: Database version/info. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_postgres_describe` `  ·` — postgres: Describe table/key. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_postgres_explain` `  ·` — postgres: Explain read-only query. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_postgres_list_tables` `  ·` — postgres: List tables/keys. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_postgres_ping` `  ·` — postgres: Connectivity check. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_postgres_query` `  ·` — postgres: Execute read-only query. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_postgres_version` `  ·` — postgres: Database version/info. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_redis_describe` `  ·` — redis: Describe table/key. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_redis_explain` `  ·` — redis: Explain read-only query. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_redis_list_tables` `  ·` — redis: List tables/keys. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_redis_ping` `  ·` — redis: Connectivity check. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_redis_query` `  ·` — redis: Execute read-only query. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_redis_version` `  ·` — redis: Database version/info. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_sqlite_describe` `  ·` — sqlite: Describe table/key. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_sqlite_explain` `  ·` — sqlite: Explain read-only query. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_sqlite_list_tables` `  ·` — sqlite: List tables/keys. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_sqlite_ping` `  ·` — sqlite: Connectivity check. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_sqlite_query` `  ·` — sqlite: Execute read-only query. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_database_sqlite_version` `  ·` — sqlite: Database version/info. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.

## devops (24)

_Docker / Kubernetes / Terraform / CI operations (COMMAND_NOT_FOUND safe)_

- `pro_fetch_devops_docker_compose_ps` `  ·` — docker: Compose service status. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_docker_images` `  ·` — docker: List local images. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_docker_inspect` `  ·` — docker: Inspect container/image. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_docker_logs` `  ·` — docker: Read container logs. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_docker_ps` `  ·` — docker: List containers. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_docker_stats` `  ·` — docker: Container resource stats. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_kubectl_contexts` `  ·` — kubectl: List contexts (names only). Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_kubectl_describe` `  ·` — kubectl: Describe Kubernetes resource. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_kubectl_events` `  ·` — kubectl: List events. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_kubectl_get` `  ·` — kubectl: Get Kubernetes resources. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_kubectl_logs` `  ·` — kubectl: Read pod logs. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_kubectl_namespaces` `  ·` — kubectl: List namespaces. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_npm_audit` `  ·` — npm: Dependency security audit. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_npm_build` `  ·` — npm: Build project (explicit opt-in). Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_npm_list` `  ·` — npm: Top-level installed dependencies. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_npm_outdated` `  ·` — npm: List outdated dependencies. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_npm_package_info` `  ·` — npm: Read package metadata. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_npm_test` `  ·` — npm: Run project tests (explicit opt-in). Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_terraform_fmt_check` `  ·` — terraform: Check Terraform formatting. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_terraform_plan_preview` `  ·` — terraform: Plan without state refresh. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_terraform_providers` `  ·` — terraform: List required providers. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_terraform_show` `  ·` — terraform: Show planned/current configuration. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_terraform_validate` `  ·` — terraform: Validate Terraform configuration. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_devops_terraform_workspace_show` `  ·` — terraform: Show current workspace. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.

## extract (24)

_DOM/selector/regex/table/metadata extraction from HTML_

- `pro_audit_page` `S ▸` — Audit a web page in one call: fetch it, then extract metadata, Open Graph and Twitter cards, JSON-LD and schema.org data, headings, all links (internal/external/social), emails, phones, prices, a readability score and a main-content extract. Use this before manually chaining individual extraction tools.
- `pro_fetch_comment_strip` `  ▸` — Remove code comments from fetched source text
- `pro_fetch_css_select` `  ▸` — Select elements from HTML via a CSS selector
- `pro_fetch_date_extract` `  ▸` — Extract date-like strings from HTML or text
- `pro_fetch_email_extract` `  ▸` — Extract email addresses from a fetched page
- `pro_fetch_footnote_extract` `  ▸` — Extract footnotes and references from a page
- `pro_fetch_form_extract` `  ▸` — Extract forms and input fields from a page
- `pro_fetch_heading_outline` `  ▸` — Build a heading outline (h1-h6) from HTML
- `pro_fetch_hreflang_extract` `  ▸` — Extract hreflang alternate links from HTML
- `pro_fetch_image_alt_extract` `  ▸` — Extract image src and alt text from HTML
- `pro_fetch_json_ld_extract` `  ▸` — Extract JSON-LD structured data from a page
- `pro_fetch_json_path` `  ▸` — Query a JSON document via a dotted JSONPath
- `pro_fetch_link_classify` `  ▸` — Classify links as internal external download or social
- `pro_fetch_link_domains` `  ▸` — List unique hostnames linked from HTML
- `pro_fetch_list_extract` `  ▸` — Extract ordered and unordered lists from HTML
- `pro_fetch_main_content_detect` `  ▸` — Detect and isolate the main content block of a page
- `pro_fetch_meta_og_extract` `  ▸` — Extract Open Graph and Twitter card metadata from HTML
- `pro_fetch_paginated_table_read` `  ▸` — Read a table spanning multiple paginated pages
- `pro_fetch_phone_extract` `  ▸` — Extract phone numbers from HTML or text
- `pro_fetch_price_extract` `  ▸` — Extract currency/price amounts from HTML or text
- `pro_fetch_regex_extract` `  ▸` — Extract all regex matches from a fetched page
- `pro_fetch_schema_org_extract` `  ▸` — Extract schema.org metadata from a page
- `pro_fetch_table_to_dataframe` `  ▸` — Convert the first HTML table to structured rows
- `pro_fetch_xpath_select` `  ▸` — Select elements from HTML via XPath

## security (24)

_OSV/SBOM scanning, header/CSP checks, secrets & CVE lookups_

- `pro_fetch_security_cookie_audit` `  ·` — Inspect cookie security attributes. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_cors_audit` `  ·` — Inspect CORS response policy. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_csp_audit` `  ·` — Inspect Content-Security-Policy. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_dependency_files` `  ·` — Find dependency manifests and lockfiles. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_dns_audit` `  ·` — Validate public DNS resolution for URL host. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_exposed_metadata` `  ·` — Find accidental metadata and env files. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_headers_audit` `  ·` — Audit HTTP security headers. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_license_report` `  ·` — Generate dependency license inventory. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_lockfile_packages` `  ·` — Summarize lockfile package names. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_npm_audit` `  ·` — Run npm dependency audit. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_npm_outdated` `  ·` — Find outdated packages. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_osv_batch` `  ·` — Batch vulnerability query. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_osv_query` `  ·` — Query OSV advisories. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_package_advisories` `  ·` — Check one package/version via OSV. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_redirect_audit` `  ·` — Inspect redirect chain. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_robots_audit` `  ·` — Inspect robots.txt policy. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_sbom` `  ·` — Generate package-lock SBOM. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_secret_scan_diff` `  ·` — Scan Git diff for secrets. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_secret_scan_files` `  ·` — Scan workspace files for likely secrets. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_secret_scan_json` `  ·` — Scan JSON while masking values. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_secret_scan_text` `  ·` — Scan provided text for secrets. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_security_txt` `  ·` — Read security.txt. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_tls_audit` `  ·` — Check HTTPS TLS reachability and security headers. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_security_url_audit` `  ·` — Assess URL scheme and public-host policy. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.

## git (23)

_Local git: status, diff, log, blame, branch operations_

- `pro_fetch_git_blame` `  ·` — Line-level blame. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_branch_create` `  ·` — Create branch. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_branch_delete` `  ·` — Delete branch. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_branch_list` `  ·` — List branches. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_branch_switch` `  ·` — Switch branch. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_changed_files` `  ·` — List changed files. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_commit_preview` `  ·` — Preview commit diff. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_diff` `  ·` — Working tree diff. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_diff_stat` `  ·` — Diff summary. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_file_history` `  ·` — File history. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_grep` `  ·` — Search tracked text. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_log` `  ·` — Commit history. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_remote_list` `  ·` — List remotes. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_repo_info` `  ·` — Repository root and current branch. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_show` `  ·` — Show commit or object. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_stash_list` `  ·` — List stashes. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_stash_pop` `  ·` — Apply latest stash. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_stash_push` `  ·` — Stash tracked changes. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_status` `  ·` — Working tree status. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_tag_create` `  ·` — Create annotated tag. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_tag_list` `  ·` — List tags. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_git_tracked_files` `  ·` — List tracked files. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_workspace_ops` `  ·` — Run local workspace operations in one call across git, DevOps (docker/kubectl/terraform/npm), databases (SQLite/PostgreSQL/MySQL/Redis) and security (OSV, secret scan, SBOM). Give a list of operations and get every result together instead of discovering four tools by name. Write operations still require their own confirmation and respect read-only mode.

## crawl (22)

_Site crawl, sitemap/robots, link graph, site explain_

- `pro_fetch_broken_links` `  ·` — Find broken 40x and 50x links on a page or site
- `pro_fetch_canonical_url` `  ·` — Resolve the canonical URL of a page
- `pro_fetch_crawl_depth_control` `  ·` — Set crawl depth and budget for the current session
- `pro_fetch_crawl_domain_scope` `  ·` — Restrict the crawl to a domain or subdomain scope
- `pro_fetch_crawl_export` `  ·` — Export crawl results as JSON CSV or Markdown
- `pro_fetch_crawl_filter` `  ·` — Set include and exclude regex filters for the crawl
- `pro_fetch_crawl_pause_resume` `  ·` — Pause or resume a running crawl
- `pro_fetch_crawl_result_merge` `  ·` — Merge multi-page crawl results into one dataset
- `pro_fetch_crawl_site` `  ·` — Crawl a site page by page within scope and depth limits
- `pro_fetch_crawl_speed` `  ·` — Set crawl rate and politeness delay
- `pro_fetch_extract_links` `  ·` — Extract all links from a page with anchor text
- `pro_fetch_extract_metadata` `  ·` — Extract title description OG and twitter meta tags
- `pro_fetch_extract_pagination` `  ·` — Discover the pagination URLs of a listing page
- `pro_fetch_extract_tables` `  ·` — Extract all HTML tables as dataframes
- `pro_fetch_link_graph` `  ·` — Build the internal link graph of crawled pages
- `pro_fetch_page_weight` `  ·` — Measure page size and asset weight
- `pro_fetch_robots_check` `  ·` — Check robots.txt permissions for a path
- `pro_fetch_sitemap_read` `  ·` — Parse sitemap.xml or robots sitemaps into a URL list
- `pro_fetch_spa_render` `  ·` — Render a JavaScript heavy page via headless browser
- `pro_fetch_url_queue_manage` `  ·` — Inspect add or pause the crawl URL queue
- `pro_page_diff` `  ·` — Compare two URLs or two texts and report what changed: a text diff, added and removed headings, link changes and a content-size delta. Use it to answer "what changed on this page" without downloading and diffing both pages manually.
- `pro_site_scan` `S ·` — Crawl a site in one call: start a bounded crawl, check robots compliance, collect page metadata, extract the internal link graph, and summarise the pages it reached. Use this for site overviews, sitemaps and structure discovery.

## search (20)

_Web, news, image, academic & vertical search (Serper/Brave/DDG)_

- `pro_fetch_academic_search` `  ▸` — Search scholarly works and publication metadata using Crossref
- `pro_fetch_blog_search` `  ▸` — Search DEV Community articles by tag
- `pro_fetch_books_search` `  ▸` — Search book catalog records using Open Library
- `pro_fetch_cached_search` `  ▸` — Search locally cached fetch content
- `pro_fetch_code_search` `  ▸` — Search GitHub code (requires GITHUB_TOKEN)
- `pro_fetch_dataset_search` `  ▸` — Search datasets hosted on Hugging Face Hub
- `pro_fetch_date_filter_search` `  ▸` — Search web results within an ISO date range
- `pro_fetch_forum_search` `  ▸` — Search Stack Overflow questions through the Stack Exchange API
- `pro_fetch_image_search` `  ▸` — Search Wikimedia Commons images with source and license metadata
- `pro_fetch_jobs_search` `  ▸` — Search remote job listings through the Remote OK API
- `pro_fetch_market_search` `  ▸` — Search Google Shopping products through SerpApi
- `pro_fetch_news_search` `  ▸` — Search indexed news articles through the GDELT DOC API
- `pro_fetch_patent_search` `  ▸` — Search patent records through Google Patents
- `pro_fetch_related_queries` `  ▸` — Get related query suggestions from Google Suggest
- `pro_fetch_reverse_image_search` `  ▸` — Find visually similar pages using SerpApi Google Reverse Image
- `pro_fetch_search_suggest` `  ▸` — Get autocomplete suggestions via Serper (Google) with a Google Suggest fallback
- `pro_fetch_site_search` `  ▸` — Search a host or domain with the web search site operator
- `pro_fetch_video_search` `  ▸` — Search YouTube videos (requires YOUTUBE_API_KEY)
- `pro_fetch_web_search` `  ▸` — Search the web using Brave Search or DuckDuckGo
- `pro_fetch_wiki_search` `  ▸` — Search English Wikipedia articles

## http (19)

_HTTP client verbs, headers, retries, multipart, SSE/websocket_

- `pro_fetch_download_file` `  ▸` — Download a file from URL into the local cache
- `pro_fetch_fetch_api` `  ▸` — Call a JSON REST API endpoint and return parsed JSON
- `pro_fetch_fetch_batch` `  ▸` — Fetch many URLs in parallel and return combined results
- `pro_fetch_fetch_graphql` `  ▸` — Send a GraphQL query to an endpoint and return data
- `pro_fetch_fetch_head` `  ▸` — Send HEAD request and return headers only
- `pro_fetch_fetch_options` `  ▸` — Send OPTIONS request to inspect CORS and allowed methods
- `pro_fetch_fetch_raw` `  ▸` — Fetch URL and return raw body without processing
- `pro_fetch_fetch_retry` `  ▸` — Fetch URL with a custom retry policy and backoff
- `pro_fetch_fetch_soap` `  ▸` — Send a SOAP XML request to a web service
- `pro_fetch_fetch_url` `  ▸` — Fetch any URL and return clean readable content as markdown
- `pro_fetch_fetch_with_proxy` `  ▸` — Fetch URL through the configured HTTP proxy
- `pro_fetch_http_status` `  ▸` — Check HTTP status code and response headers of a URL
- `pro_fetch_ingest` `S ▸` — Fetch any URL and return clean structured data in one call: pages become readable text with metadata and headings, PDFs and Office files become text, CSV/JSON become summarised tables, feeds become markdown, and everything is optionally archived for later citation. Handles format detection so you do not have to choose a converter.
- `pro_fetch_post_form` `  ▸` — Send POST request with form-urlencoded body
- `pro_fetch_post_multipart` `  ▸` — Send POST request with multipart form-data
- `pro_fetch_redirect_trace` `  ▸` — Trace the full redirect chain of a URL
- `pro_fetch_sse_subscribe` `  ▸` — Subscribe to a Server-Sent Events stream and capture events
- `pro_fetch_stream_fetch` `  ▸` — Fetch URL with streaming response and return first N bytes
- `pro_fetch_websocket_listen` `  ▸` — Connect to a WebSocket and capture first N messages

## knowledge (18)

_Local knowledge store / embeddings / retrieval_

- `pro_fetch_knowledge_chunk` `  ·` — Split text into bounded overlapping chunks. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_citation_extract` `  ·` — Extract candidate citations/URLs. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_dedupe` `  ·` — Find duplicate documents. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_delete` `  ·` — Delete document (confirmation required). Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_export` `  ·` — Export knowledge index as JSON. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_get` `  ·` — Retrieve indexed document. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_import` `  ·` — Import JSON knowledge documents. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_ingest` `  ·` — Ingest document into local knowledge store. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_ingest_url` `  ·` — Fetch and ingest a public document. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_list` `  ·` — List indexed documents. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_rank` `  ·` — Rank matching documents. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_rebuild` `  ·` — Rebuild lexical index from stored documents. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_search` `  ·` — Search knowledge documents. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_stats` `  ·` — Knowledge index statistics. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_summarize` `  ·` — Create extractive summary. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_tag` `  ·` — Add/remove document tags. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_update` `  ·` — Update document text/title. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_knowledge_validate_citations` `  ·` — Check URL citations in indexed text. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.

## productivity (18)

_Tasks, notes, calendars, snippets (provider-backed)_

- `pro_fetch_productivity_calendar_event_create` `  ·` — calendar: Create Calendar event after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_calendar_event_delete` `  ·` — calendar: Delete Calendar event after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_calendar_event_get` `  ·` — calendar: Get Calendar event. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_calendar_event_update` `  ·` — calendar: Update Calendar event after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_calendar_events` `  ·` — calendar: List Calendar events. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_calendar_quick_add` `  ·` — calendar: Create event from natural-language text after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_gmail_draft_create` `  ·` — gmail: Create Gmail draft. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_gmail_labels` `  ·` — gmail: List Gmail labels. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_gmail_message_get` `  ·` — gmail: Get Gmail message. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_gmail_messages` `  ·` — gmail: List Gmail messages. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_gmail_send` `  ·` — gmail: Send email after explicit confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_gmail_threads` `  ·` — gmail: List Gmail threads. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_todoist_task_close` `  ·` — todoist: Close Todoist task after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_todoist_task_create` `  ·` — todoist: Create Todoist task after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_todoist_task_delete` `  ·` — todoist: Delete Todoist task after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_todoist_task_get` `  ·` — todoist: Get Todoist task. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_todoist_task_update` `  ·` — todoist: Update Todoist task after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_productivity_todoist_tasks` `  ·` — todoist: List Todoist tasks. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.

## storage (16)

_S3 / Drive / Dropbox / OneDrive file operations_

- `pro_fetch_storage_dropbox_get` `  ·` — dropbox: Get file metadata. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_dropbox_list` `  ·` — dropbox: List folder contents. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_dropbox_search` `  ·` — dropbox: Search files. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_dropbox_upload` `  ·` — dropbox: Upload text content after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_google_drive_get` `  ·` — google_drive: Get Drive file metadata. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_google_drive_list` `  ·` — google_drive: List Drive files. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_google_drive_search` `  ·` — google_drive: Search Drive files. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_google_drive_upload` `  ·` — google_drive: Upload text file after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_onedrive_get` `  ·` — onedrive: Get OneDrive item. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_onedrive_list` `  ·` — onedrive: List OneDrive folder children. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_onedrive_search` `  ·` — onedrive: Search OneDrive. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_onedrive_upload` `  ·` — onedrive: Upload text file after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_s3_get` `  ·` — s3: Read S3 object as UTF-8 text. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_s3_head` `  ·` — s3: Inspect S3 object metadata. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_s3_list` `  ·` — s3: List S3 objects. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.
- `pro_fetch_storage_s3_upload` `  ·` — s3: Upload workspace file to S3 after confirmation. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.

## archive (15)

_Wayback + Internet Archive, local cache store, snapshots & diffs_

- `pro_fetch_archive_org_fetch` `  ·` — Fetch a URL snapshot from the Internet Archive
- `pro_fetch_archive_org_save` `  ·` — Save a URL to the Internet Archive
- `pro_fetch_cache_clear` `  ·` — Clear the cache fully
- `pro_fetch_cache_get` `  ·` — Get the cached response for a key or URL
- `pro_fetch_cache_put` `  ·` — Store custom data in the cache
- `pro_fetch_cache_search` `  ·` — Search cached content by keyword
- `pro_fetch_cache_stats` `  ·` — Show cache size hits and misses
- `pro_fetch_export_bundle` `  ·` — Export cache data as a portable bundle
- `pro_fetch_google_cache_fetch` `  ·` — Fetch the Google cached copy of a page
- `pro_fetch_import_bundle` `  ·` — Import a previously exported bundle
- `pro_fetch_offline_browse` `  ·` — Browse cached pages without network
- `pro_fetch_snapshot_diff` `  ·` — Diff the cached and fresh versions of the same URL
- `pro_fetch_version_history` `  ·` — List stored cache entries for a URL
- `pro_fetch_wayback_fetch` `  ·` — Fetch the latest Wayback snapshot of a URL
- `pro_fetch_wayback_lookup` `  ·` — List Wayback Machine snapshots availability of a URL

## docs (15)

_arXiv / npm / PyPI / RFC / PubMed package & paper metadata_

- `pro_fetch_arxiv_paper_read` `  ·` — Read a full arXiv paper by ID with abstract and authors
- `pro_fetch_changelog_read` `  ·` — Read a project changelog from GitHub releases
- `pro_fetch_dockerhub_read` `  ·` — Read Docker Hub image metadata and tags
- `pro_fetch_doi_resolve` `  ·` — Resolve a DOI to metadata and source links
- `pro_fetch_huggingface_model_card` `  ·` — Read a HuggingFace model card
- `pro_fetch_mdn_docs_read` `  ·` — Read MDN documentation for a web API
- `pro_fetch_npm_package_read` `  ·` — Read npm package metadata and README
- `pro_fetch_pubmed_read` `  ·` — Read a PubMed article with abstract
- `pro_fetch_pypi_package_read` `  ·` — Read PyPI package metadata and docs
- `pro_fetch_readthedocs_fetch` `  ·` — Fetch documentation hosted on Read the Docs
- `pro_fetch_registry_api_read` `  ·` — Read npm registry versions and deprecations
- `pro_fetch_rfc_read` `  ·` — Read an RFC document by number
- `pro_fetch_stackoverflow_read` `  ·` — Read a Stack Overflow question and answers
- `pro_fetch_w3c_spec_read` `  ·` — Read a W3C specification page
- `pro_fetch_wikipedia_deep_read` `  ·` — Deep read a Wikipedia article as plain text

## media (15)

_Audio/video/image info, transcode, thumbnails, waveform_

- `pro_fetch_audio_transcribe` `  ·` — Transcribe audio to text via a Whisper-compatible API
- `pro_fetch_barcode_qr_read` `  ·` — Read a barcode or QR code from an image
- `pro_fetch_exif_read` `  ·` — Read EXIF metadata of a photo
- `pro_fetch_favicon_fetch` `  ·` — Fetch the favicon of a domain
- `pro_fetch_image_convert` `  ·` — Convert an image between formats such as png webp and jpeg
- `pro_fetch_image_info` `  ·` — Get dimensions format and metadata of an image
- `pro_fetch_image_ocr` `  ·` — Run OCR on an image URL and return text
- `pro_fetch_image_resize` `  ·` — Resize an image to target dimensions
- `pro_fetch_media_download` `  ·` — Download a media file into the local cache
- `pro_fetch_pdf_ocr` `  ·` — Run OCR on scanned PDF pages
- `pro_fetch_screenshot_full_page` `  ·` — Take a full-length screenshot of a page
- `pro_fetch_screenshot_page` `  ·` — Take a viewport screenshot of a page
- `pro_fetch_svg_to_png` `  ·` — Render an SVG to PNG
- `pro_fetch_thumbnail_generate` `  ·` — Generate a small thumbnail from an image or video
- `pro_fetch_video_metadata` `  ·` — Get duration codec and stream info of a video

## document (13)

_PDF / DOCX / XLSX / PPTX parse & text extraction_

- `pro_pdf_blank` `  ·` — Sahifalarni bo‘shatish yoki o‘chirish — tasodifiy kontentni tozalash uchun. `pages` bo‘sh bo‘lsa barcha sahifalar.
- `pro_pdf_flatten` `  ·` — Forma maydonlarini oddiy matnga aylantirish (flatten) — tahrirlash mumkin bo‘lmaydi.
- `pro_pdf_form_fill` `  ·` — PDF formadagi maydonlarni to‘ldirish. `fields` — [{ name, value }]. Checkbox uchun `value: true|false`.
- `pro_pdf_form_read` `  ·` — PDF ichidagi forma maydonlarini o‘qish: nom, tur, qiymat, holat.
- `pro_pdf_info` `  ·` — PDF haqida ma’lumot: sahifalar soni, o‘lcham, metadata, shakllar, bandlar, xavfsizlik. pdf-lib parol bilan himoyalashni qo‘llamaydi — shu sababli shu yo‘nalishda tool yo‘q.
- `pro_pdf_merge` `  ·` — Bir nechta PDF ni bittaga birlashtirish. Har bir manba uchun url yoki base64. Manbalar berilgan tartibda joylashtiriladi.
- `pro_pdf_metadata` `  ·` — PDF metadata si o‘qish yoki yozish (title, author, subject, keywords, creator, producer).
- `pro_pdf_new` `  ·` — Bo‘sh PDF yaratish. Sahifa o‘lchamlari A4/Letter/A3/Legal yoki millimetrda. Ixtiyoriy sarlavha matni bilan.
- `pro_pdf_remove_pages` `  ·` — PDF dan sahifalarni olib tashlash. Qolgan barcha sahifalar saqlanadi.
- `pro_pdf_reorder` `  ·` — Sahifalarni ko‘chirish: `order` — yangi tartib, 1-based sahifa raqamlari.
- `pro_pdf_rotate` `  ·` — Sahifalarni aylantirish. `degrees` 90/180/270. Sahifalar bo‘sh bo‘lsa — hammasi.
- `pro_pdf_split` `  ·` — PDF ni sahifalar bo‘yicha bo‘lish: har bir sahifa alohida fayl, yoki `pages` bilan tanlangan qismni bitta faylga ajratish.
- `pro_pdf_watermark` `  ·` — Har bir sahifaga matnli suv belgisi qo‘shish. Shaffoflik, burchak va o‘lcham sozlanadi.

## apitest (12)

_REST/GraphQL/OpenAPI/SOAP: fetch, parse, validate, mock, diff, probe_

- `pro_fetch_api_diff` `  ·` — Diff two versions of an API spec
- `pro_fetch_api_mock_respond` `  ·` — Return a mock response for an endpoint
- `pro_fetch_api_rate_limit_probe` `  ·` — Probe API rate limits safely
- `pro_fetch_graphql_introspect` `  ·` — Introspect a GraphQL endpoint schema
- `pro_fetch_graphql_schema_read` `  ·` — Read and render a GraphQL schema as SDL
- `pro_fetch_json_schema_infer` `  ·` — Infer a JSON schema from sample responses
- `pro_fetch_openapi_endpoints_list` `  ·` — List the endpoints from an OpenAPI spec
- `pro_fetch_openapi_fetch` `  ·` — Fetch an OpenAPI or Swagger spec from a URL
- `pro_fetch_openapi_parse` `  ·` — Parse and validate an OpenAPI spec
- `pro_fetch_openapi_try` `  ·` — Execute an endpoint defined in an OpenAPI spec
- `pro_fetch_swagger_validate` `  ·` — Validate a spec against OpenAPI rules
- `pro_fetch_wsdl_parse` `  ·` — Parse a WSDL SOAP definition

## auth (12)

_Sessions, cookies, basic/bearer fetch, OAuth device flow, scope audit_

- `pro_fetch_api_key_set` `  ▸` — Set an API key for a provider for this session
- `pro_fetch_basic_auth_fetch` `  ▸` — Fetch a URL with basic authentication
- `pro_fetch_bearer_fetch` `  ▸` — Fetch a URL with bearer token authentication
- `pro_fetch_cookie_jar_manage` `  ▸` — Inspect or clear stored cookies
- `pro_fetch_credential_test` `  ▸` — Test all configured credentials
- `pro_fetch_github_auth_status` `  ▸` — Check GitHub token validity and scopes
- `pro_fetch_oauth_device_flow` `  ▸` — Run the OAuth device flow for a provider
- `pro_fetch_scopes_audit` `  ▸` — Audit granted scopes against needed scopes
- `pro_fetch_session_list` `  ▸` — List saved sessions
- `pro_fetch_session_restore` `  ▸` — Restore a saved session
- `pro_fetch_session_revoke` `  ▸` — Revoke and delete a saved session
- `pro_fetch_session_save` `  ▸` — Persist the current session state

## i18n (12)

_Translate, transliterate, locale & RTL helpers_

- `pro_fetch_case_convert` `  ·` — Convert text case: camel, snake, kebab, pascal, title or sentence
- `pro_fetch_i18n_strings_extract` `  ·` — Extract translatable strings from source or HTML
- `pro_fetch_locale_detect` `  ·` — Detect the locale conventions of a page or text
- `pro_fetch_mixed_lang_split` `  ·` — Split mixed-language text into language segments
- `pro_fetch_reading_time` `  ·` — Estimate reading time and word count of text
- `pro_fetch_rtl_normalize` `  ·` — Normalize RTL text and fix direction issues
- `pro_fetch_script_convert` `  ·` — Convert text between script variants such as Uzbek Cyrillic and Latin
- `pro_fetch_slugify` `  ·` — Convert text to a URL-friendly slug
- `pro_fetch_translate_page` `  ·` — Translate a fetched page to a target language
- `pro_fetch_translate_text` `  ·` — Translate text to a target language
- `pro_fetch_transliterate` `  ·` — Transliterate text between scripts
- `pro_fetch_unicode_normalize` `  ·` — Normalize Unicode text (NFC, NFD, NFKC, NFKD)

## sql (11)

- `pro_sql_analyse` `  ·` — SQL so‘rovini tahlil qilish: qanday amal, qaysi jadvallar, murakkablik, parameterlar, xavf darajasi. WHERE clausesiz DELETE/UPDATE alohida belgilanadi. So‘rov bajarilmaydi — faqat o‘qiladi va tahlil qilinadi.
- `pro_sql_check` `  ·` — SQL sintaktik tekshiruv: izoh va satr ichida yopilmagan qavs, yakunlanmagan dollar-quoted blok, nomlanmagan parameterlar, bo‘sh SELECT ustuni. Bajarilmaydi — faqat tekshiradi.
- `pro_sql_complexity` `  ·` — So‘rov murakkabligi: token soni, chuqurlik, subquery, join, union, jadval soni va qator ko‘payishi (fanout). Oddiy so‘rov uchun barchasi nol bo‘ladi.
- `pro_sql_dialect` `  ·` — SQL dialekt farqlari: PostgreSQL, MySQL, SQLite va SQL Server o‘rtasidagi 12 ta farq, va berilgan so‘rovda qaysi constructlar ishlatilganligi. So‘rovga tegishli qismi ajratib qo‘yiladi.
- `pro_sql_format` `  ·` — SQL ni chiroyli formatlash. Kafolat: formatlashdan keyin token oqimi, jadvallar, xavf darajasi va statement chegaralari o‘zgarmaydi — izohlar tushiriladi, chunki ularni saqlash uchun pro_sql_tokenize ishlating.
- `pro_sql_parameters` `  ·` — So‘rovdagi parameterlarni chiqarish: har birining nomi yoki tartib raqami, necha marta uchraydi va qaysi usulda yozilgan (? $1 :name @name %(name)s). Aralash usul aniqlanadi.
- `pro_sql_risk` `  ·` — SQL xavf darajasi: read / write / destructive / schema. WHERE clausesiz DELETE va UPDATE, TRUNCATE, DROP, GRANT/REVOKE, FOR UPDATE bloklash, INTO OUTFILE — hammasi alohida topiladi. CTE ichida yashiringan o‘zgartirish ham ko‘rinadi.
- `pro_sql_split` `  ·` — SQL skriptini statement‘larga bo‘lish. Nuqta satr, izoh yoki dollar-quoted blok ichida chegara hisoblanmaydi — PostgreSQL funksiya tanasi shu sabab to‘liq qoladi.
- `pro_sql_substitute` `  ·` — SQL ichidagi parameterlarni berilgan qiymatlar bilan almashtirish. Barcha qiymatlar to‘g‘ri qo‘yib chiqiladi: satrga tirnoq qo‘shiladi, son to‘g‘ri yoziladi, NULL o‘zgaruvchan sifatida. Chiqish shunchaki tayyor va bajarishga tayyor bo‘ladi.
- `pro_sql_tables` `  ·` — So‘rov qaysi jadvallarni ishlatishini aniqlash: FROM, JOIN, INTO, UPDATE, DELETE FROM. Sxema va alias alohida. SELECT ro‘yxatidagi nomlar jadval hisoblanmaydi.
- `pro_sql_tokenize` `  ·` — SQL ni tokenlarga bo‘lish: har bir kalit, nom, satr, son, operator, parameter va izoh boshlanish/oxirgi pozitsiyasi bilan. Bu lexer‘ning to‘liq ko‘rinishi — izohlar saqlanadi.

## monitoring (10)

_Watches, health checks, scheduled fetch & change alerts_

- `pro_fetch_digest_build` `  ·` — Build a digest from supplied events and stored monitoring snapshots
- `pro_fetch_feed_subscribe` `  ·` — Fetch an RSS or Atom feed and compare entries with the previous stored snapshot
- `pro_fetch_jobs_watch` `  ·` — Fetch a jobs page and report postings not present in its previous snapshot
- `pro_fetch_keyword_alert` `  ·` — Fetch a page and report matching keywords and newly matched keywords
- `pro_fetch_page_diff_notify` `  ·` — Report changes since the last watch snapshot
- `pro_fetch_price_watch` `  ·` — Fetch a product page, extract its price, and compare it with the previous snapshot
- `pro_fetch_release_watch` `  ·` — Fetch the latest GitHub release and compare it with the previous stored tag
- `pro_fetch_uptime_check` `  ·` — Check the availability and latency of a URL
- `pro_fetch_url_watch` `  ·` — Register a URL snapshot for change watching
- `pro_fetch_watch_list` `  ·` — List all active watches and their status

## encoding (9)

_Base64/URL/hex/hash/compress codecs_

- `pro_encode_decode` `  ·` — Kodlangan satrni dekodlash. Chiqish UTF-8 bo‘lmasa, "binary" deb belgilaydi. base85 da oxiridagi NUL baytlari saqlanmaydi (to‘ldiruvchi to‘qib qo‘yiladi).
- `pro_encode_encode` `  ·` — Matnni base32 / base58 / base85 / base64 ga kodlash. Node da base32 va base58 yo‘q, ular Kubernetes secret va Solana manzillarida ishlatiladi.
- `pro_encode_html_entity` `  ·` — HTML entitiyalarini kodlash va dekodlash (&amp;, &#x41;, &#65;).
- `pro_encode_ident` `  ·` — ULID (vaqt tartiblangan identifikator) va nanoid yaratish.
- `pro_encode_jwt_decode` `  ·` — JWT ni o‘qish: header, payload, muddat. **Bu tasdiqlash EMAS.** Imzo tekshirilmagan — ishonchli deb hisoblamang.
- `pro_encode_jwt_verify` `  ·` — JWT imzosini kalit bilan tekshirish (HMAC yoki RS/ES/EdDSA). Ochiq kalit yoki maxfiy kalit berilishi shart. Kalit kiritilmasa rad etiladi — “tekshirilmadi” deb qaytarilmaydi.
- `pro_encode_punycode` `  ·` — IDN domenlarni punycode ga o‘girish va aksincha (xn-- prefiksi bilan).
- `pro_encode_url` `  ·` — URL komponentlarini kodlash va dekodlash, to‘liq URL ni tahlil qilish.
- `pro_encode_uuid` `  ·` — UUID v4 / v7 yaratish va UUID parsing (versiya, variant, vaqt).

## imageproc (9)

_Image processing: resize, crop, EXIF, QR, OCR pre/post_

- `pro_image_adjust` `  ·` — Rasmni tuzatish: yorqinlik, kontrast, ranglar, quyuq rang (grayscale), aylantirish (hue), blur yoki aniqlashtirish (sharpen). Bir nechta o‘zgarish bir vaqtda qo‘llaniladi.
- `pro_image_convert` `  ·` — Rasm formatini o‘zgartirish (png/jpeg/webp/avif/tiff/gif/jp2) va sifatini boshqarish. O‘lcham va sifat berilsa, ikkalasi bir vaqtda qo‘llaniladi.
- `pro_image_crop` `  ·` — Rasmni qirqish: aniq koordinatalar (left/top/width/height) yoki foizlar. Rasm chegaradan kichik bo‘lsa, koordinatlar chegaraga sig‘adigan qilib moslanadi va natija aytiladi.
- `pro_image_info` `  ·` — Rasm haqida to‘liq ma’lumot: format, o‘lcham, rang chuqurligi, EXIF yo‘nalishi, kamera, obyektiv, o‘lchov nuqtasi, kompression, alfa kanali. Rasmni o‘zgartirmaydi.
- `pro_image_resize` `  ·` — Rasmni o‘lchamini o‘zgartirish: kenglik/balandlik, qisqa tomon bo‘yicha masshtab, yoki aniq o‘lcham. Rasm formatini ham o‘zgartirish mumkin.
- `pro_image_rotate` `  ·` — Rasmni burish (90/180/270 yoki ixtiyoriy burchak) va akslantirish (gorizontal/vertikal). EXIF yo‘nalishini avtomatik tozalash alohida parametr bilan — telefon rasmlari aynan shu sababdan yot ko‘rinadi.
- `pro_image_sprite` `  ·` — Bir necha rasmni bitta sprite varaqasiga yig‘ish: qatorlar va ustunlar soni belgilanadi, har bir katak teng o‘lchamga masshtalanadi. CSS sprite sheet va boshqa varaqalar uchun.
- `pro_image_strip_metadata` `  ·` — Rasmdan maxfiy ma’lumotlarni olib tashlash: EXIF (kamera, GPS koordinatalari, qurilma seriya raqamlari), ICC profil va boshqa texnik ma’lumotlar. Rasmni qayta yozadi, o‘lcham va ko‘rinish o‘zgarmaydi.
- `pro_image_watermark` `  ·` — Rasmga yorliq qo‘shish: pastki/yuqori chap/o‘ng burchakka rangli blok yorlig‘i, yoki markaziy banner. Yorliq rangi, shaffoflig‘i va chegarasi o‘lchamiga nisbatan beriladi.

## qr (9)

- `pro_qr_capacity` `  ·` — QR sig‘imi: berilgan versiya va darajada nechta modullar, nechta kodli so‘z, nechta ma’lumot so‘zi va taxminan nechta belgi sig‘adi. Geometriyadan hisoblanadi, jadvaldan o‘qilmaydi.
- `pro_qr_decode` `  ·` — QR matritsasini o‘qish: format ma’lumotidan daraja va niqob aniqlanadi, xato tuzatish qo‘llaniladi, matn qaytariladi. Kiritish — har bir qatori 0/1 yoki #/. belgilaridan iborat matritsa.
- `pro_qr_encode` `  ·` — Matndan QR belgisi yasash: segment rejimi (raqam / harf-arif / bayt), versiya, xato tuzatish darajasi, niqoblash, modul matritsasi, PNG yoki SVG. Chiqishda "round trip tekshirildi, skaner bilan tekshirilmadi" deb yoziladi — bu farq yashirilmaydi.
- `pro_qr_field` `  ·` — GF(256) maydon amallari: ko‘paytirish, bo‘lish, daraja, generator polinomi. QR xato tuzatishi shu maydonda ishlaydi — maydon noto‘g‘ri bo‘lsa kodlash ham, tuzatish ham noto‘g‘ri bo‘ladi.
- `pro_qr_format_info` `  ·` — QR format va versiya ma’lumoti: BCH(15,5) va BCH(18,6) hisoblari. Jadvaldagi 16 ta e’lon qilingan qiymat ham qayta hisoblanib solishtiriladi — jadval xatosi shunda ko‘rinadi.
- `pro_qr_layout` `  ·` — QR belgisining moduli xaritasi: funksiya modullari (finder, timing, alignment, format), ma’lumot modullarining o‘qish tartibi va sig‘adigan kodli so‘z soni.
- `pro_qr_plan` `  ·` — Matn uchun QR rejasini chiqarish: har bir daraja uchun sig‘adigan versiya, sig‘im va tavsiya. Matnni kodlamaydi — faqat rejasini ko‘rsatadi.
- `pro_qr_rs_decode` `  ·` — Reed-Solomon kodli so‘zni tuzatish: sindromalar hisoblanadi, Berlekamp-Massey xatolar sonini, Chien qidiruvi joyini, Forney esa miqdorini topadi. Tuzatib bo‘lmasa "yo q" deyadi — noto‘g‘ri matnni "to‘g‘ri" deb qaytarmaydi.
- `pro_qr_rs_encode` `  ·` — Reed-Solomon xato tuzatish kodli so‘zi yasash: berilgan ma’lumot baytlariga tekshiruv so‘zlari qo‘shiladi (GF(256), primitiv polinom 0x11D). Generator polinomi ham qaytariladi.

## schema (6)

_JSON Schema / validation / inference helpers_

- `pro_schema_coerce` `  ·` — Qiymatni shemaga moslashtirish: string → number/boolean, "1,5" → 1.5, "[]" → bo‘sh massiv, yetishmaydigan optional kalitlar. Moslashuvchi qiymat topilmasa, o‘zgartirilmaydi.
- `pro_schema_generate` `  ·` — Skelet yaratish: TypeScript interfeysi, Python dataclass yoki Kotlin data class shemadan generatsiya qilinadi.
- `pro_schema_infer` `  ·` — Qiymatdan JSON Schema chiqarish. `additionalProperties` qo‘shilmaydi — chiqarilgan schema qattiq bo‘lmasligi kerak.
- `pro_schema_openapi` `  ·` — OpenAPI 3.0 spetsifikatsiyasini JSON Schema yordamida generatsiya qilib, so‘ng undan yana shema chiqarish (schema -> openapi -> schema).
- `pro_schema_ref` `  ·` — Mahalliy $ref va definitions/$defs ni birlashtirib, bitta yassi shemaga yig‘ish. Chuqur ($ref) sikllari aniqlanadi va xato beriladi.
- `pro_schema_validate` `  ·` — Qiymatni JSON Schema bo‘yicha tekshirish. Natija har bir xatoni yo‘l (path) va sabab bilan beradi — "invalid" demak yetarli emas.

## llm (5)

_LLM gateway: complete, embed, structured output_

- `pro_llm_chat` `  ·` — Aniq modelga prompt yuborish va javobni olish. Pro-Fetch ilgari faqat qidiruv API orqali modelga yetardi — bu endi mumkin.
- `pro_llm_compare` `  ·` — Bir xil savolni bir nechta modelga yuborib javoblarni yonma-yon qo'yish. Modellar bir-biriga qarab emas, parallel bajariladi.
- `pro_llm_complete` `  ·` — Modelga oddiy yakunlash (completion) so'rovi — prompt davomida davom etadi.
- `pro_llm_embed` `  ·` — Matnni vektorga aylantirish (embedding). RAG va qidiruv uchun kirish nuqtasi.
- `pro_llm_providers` `  ·` — Qaysi LLM providerlari hozir ishlatilishi mumkinligini ko'rsatish: kalit bormi, manzil belgilanganmi. Hech qanday kalit qiymati chiqarilmaydi.

## opendata (5)

_Public open-data providers (Crossref, OpenLibrary, Patents, GDELT)_

- `pro_opendata_columns` `  ·` — Dataset ustunlarini tekshirish: nomi, turi, bo‘sh qiymatlar soni, turli qiymatlar soni va eng ko‘p uchraydigan qiymatlar. Har bir ustun alohida SoQL so‘rovi bilan - katta datasetda sekin bo‘lishi tabiiy.
- `pro_opendata_count` `  ·` — Datasetda qancha qator bor va ular qanday taqsimlangan: count(*), bir ustun bo‘yicha guruhlash, minimal/maksimal/o‘rtacha. Metama’lumot qatorlar sonini bermaydi - faqat shu yo‘l.
- `pro_opendata_dataset` `  ·` — Dataset haqida ma’lumot: nomi, tavsifi, qatorlar soni, yangilangan vaqti va barcha ustunlari tur bilan. Dataset id, permalink yoki SODA manzili bilan chaqiriladi.
- `pro_opendata_rows` `  ·` — Ochiq datasetdan qatorlar o‘qish (SoQL): $limit, $offset, $select, $order va $where. Filtr xatosi provider’ning o‘z xaberi bilan qaytariladi - u noto‘g‘ri ustun nomini aniq ko‘rsatadi.
- `pro_opendata_search` `  ·` — Socrata ochiq ma’lumot katalogida qidirish (data.gov, NY, Chicago, LA va boshqa portallar). Har bir natija domeni, id va permalinki bilan - keyingi qadamlarda aynan shular kerak.

## time (5)

_Date/time parsing, diff, relative formatting, cron helpers_

- `pro_time_add` `  ·` — Sana yoki vaqtga davr qo‘shish/ayirish: "2026-01-31" + "1mo" = 2026-02-28, "2026-02-28" + "2d" = 2026-03-02. Kun oy uzunligiga moslanadi. Davr satr yoki alohida raqamlar bilan berilishi mumkin.
- `pro_time_between` `  ·` — Ikki vaqt orasidagi farq: yil/oy/kun/soat/daqiqa/soniya, umumiy kun va millisekund, qaysi biri kelajakda. Kalendar farqi oy uzunligiga moslanadi, shuning uchun "1 oy" har doim 30 yoki 31 kun emas.
- `pro_time_duration` `  ·` — Davr satrini tahlil qilish va tekshirish: "1y 2mo 3d 4h 5m 6s" -> maydonlar, qisqa matn va taxminiy millisekund. Noma’lum birlik xato qaytariladi.
- `pro_time_humanize` `  ·` — Vaqt oralig‘ini inson o‘qiyadigan shaklda aytish: "3 yil 2 oy 7 kun oldin" yoki "2 soatdan keyin". Turli o‘lchovlarda taqqoslash ham beriladi.
- `pro_time_parse` `  ·` — Vaqt satrini tahlil qilish: ISO/raqamli kiritma -> epoch millis, UTC ISO, kalendar sanasi (haftaning kuni, ISO hafta, yil ichidagi kun). Zonasiz satr "aniq emas" deb belgilanadi.

## units (5)

_Unit & number formatting/normalization_

- `pro_units_convert` `  ·` — Birliklarni o‘lchash: uzunlik, massa, hajm, maydon, tezlik, bosim, energiya, quvvat, vaqt, ma’lumot hajmi, chastota, kuch, burchak, yo‘l sarfi. Avto-prefikslar: km, cm, mm, µg, MB, KiB. Harorat chiziqli emas - u alohida hisoblanadi, shuning uchun 20 degC 68 degF bo‘ladi, 20 emas.
- `pro_units_format` `  ·` — Miqdorni inson o‘qiydigan shaklda yozish: "1.5e-6" emas, "1.5 µm"; 1 KB va 1 KiB farqi; davomiylikni kun-soat-daqiqa-songacha bo‘lish; butun sonlarni rim raqamida. Noto‘g‘ri birlik bo‘lsa xato qaytariladi - jim qolmaydi.
- `pro_units_list` `  ·` — Birliklarni ro‘yxat qilish: oila bo‘yicha (uzunlik, massa, harorat, hajm, tezlik, bosim, energiya, quvvat, vaqt, ma’lumot, chastota, kuch, burchak, yo‘l sarfi) va har bir birlikning SI birlikka koefitsienti. Prefikslar ro‘yxati ham beriladi.
- `pro_units_parse` `  ·` — Miqdorni tahlil qilish: "12.5 km" -> 12.5 va km, birlik oilasi va boshqa birliklarga o‘lchov. Prefixlar avtomatik aniqlanadi (da, h, µ ham). Noto‘g‘ri birlik bo‘lsa, yaqinlari taklif qilinadi.
- `pro_units_temperature` `  ·` — Harorat o‘lchovi: Selsiy, Fahrenheit, Kelvin, Rankine. Qo‘shimcha "muzlash nuqtasi", "qaynash nuqtasi" kabi nomlangan nuqtalar chiqadi. Harorat chiziqli emas — 20 degC 68 degF bo‘ladi, 20 emas.

## zip (5)

_Archive (zip/tar) list, extract, create_

- `pro_zip_create` `  ·` — Fayllardan ZIP arxiv yaratish: har biriga nom va matn yoki base64. Siqish haqiqiy taqqoslashdan keyin tanlanadi, shuning uchun qisqa yoki allaqachon siqilgan ma’lumot yig‘ilib qolmaydi.
- `pro_zip_extract` `  ·` — ZIP arxivni ochish: har bir yozuv tekshiriladi (yo‘l chegarasi, ochilgan hajm chegarasi, CRC) va faqat shundan keyin yoziladi. "..", mutlaq yo‘l va Windows drayver harfi tozalanadi. Barcha fayllarni bitta arxivga qayta yig‘ish ham mumkin.
- `pro_zip_find` `  ·` — ZIP ichida qidirish: fayl nomi bo‘yicha va yoki matn bo‘yicha. Topilgan qatorlar raqam bilan birga beriladi. Katta yoki ikkilik fayllar skanlanmaydi va bu alohida hisoblanadi.
- `pro_zip_inspect` `  ·` — ZIP arxivni tekshirish: yozuvlar soni, siqilgan va ochilgan hajm, siqish usuli, eng katta fayllar, izoh. Hech narsa yozilmaydi va ochilmaydi - arxiv shikol emasligi tekshiriladi.
- `pro_zip_verify` `  ·` — ZIP butunligini tekshirish: har bir yozuv ochilib CRC hisoblanadi va markaziy katalogdagi qiymat bilan solishtiriladi. Markaziy katalog o‘zi ham tekshiriladi - u ataylab o‘zgartirilgan bo‘lishi mumkin.

## binary (4)

_Parquet / Arrow / Avro / Protobuf readers (schema + rows)_

- `pro_binary_arrow_ipc_read` `  ·` — Arrow IPC/Feather faylini o‘qish: sxema (ustunlar va tiplar), qatorlar soni va qatorlar. Arrow fayl o‘zida sxemasini saqlaydi. Stream va fayl formatlarining ikkalasi ham o‘qiladi.
- `pro_binary_avro_read` `  ·` — Avro faylini o‘qish: yozuvlar, sxema va kodek. Object Container fayl (boshida "Obj") o‘zida sxemasini saqlaydi — unda "schema" berish shart emas. Xom Avro qiymat (konteynersiz) uchun "schema" majburiy.
- `pro_binary_parquet_read` `  ·` — Parquet faylini o‘qish: sxema (ustun nomlari va tiplari), qatorlar soni, bloklar soni va qatorlar. Parquet o‘zida sxemasini saqlaydi — alohida sxema kerak emas. 64-bit ustunlar matn sifatida qaytariladi, aniqlik yo‘qotilmasligi uchun.
- `pro_binary_protobuf_decode` `  ·` — Protobuf xabarini ochish: "descriptor_set" (protoc --descriptor_set_out natijasi) va "message_type" (to‘liq nom, masalan "myapp.Person") beriladi. Natija JSON ga aylantiriladi. proto faylini o‘zi kompilyatsiya qilinmaydi.

## chess (4)

_FEN parse/validate, legal moves, perft, square & position analysis_

- `pro_chess_analyse` `  ·` — Pozitsiyani tahlil qilish: yurishlar soni, shoh tekshiruvi, mat/mat emas/potishka, eng uzun yurish zanjiri va ixtiyoriy perft (barg o‘quv soni). Yurishlar SAN ro‘yxati yoki FEN ko‘rinishida berilsa, ular ketma-ket o‘ynab yangi pozitsiya va yakuniy natija chiqadi.
- `pro_chess_fen` `  ·` — FEN ni o‘qish, tekshirish va qayta yozish. Natija: maydon, yuradigan tomon, qal’a huquqlari, en passant maydoni, soatlar va alohida maydonlar ro‘yxati. Noto‘g‘ri FEN qaysi qismi xato ekanini aytadi - "FEN noto‘g‘ri" emas.
- `pro_chess_moves` `  ·` — Berilgan pozitsiyadagi barcha qonuniy yurishlar, SAN yozuvi bilan. Qal’a, en passant, ko‘tarilish (to‘rt xil) va shohga tegadigan yurishlar - barchasi sanaladi va ko‘rsatiladi. Natija soni perft bilan tekshirilgan.
- `pro_chess_square` `  ·` — Maydon haqida: u yerda qaysi dona turadi, uni qaysi donalar urmoqda va qaysi yurishlar shu maydonga boradi. Ro‘yxat har doim shu pozitsiya bo‘yicha qayta hisoblanadi, saqlanmaydi.

## geo_data (4)

_Geo / maps / timezone / country helpers_

- `pro_geo_geocode_reverse` `  ·` — Koordinatani manzilga aylantirish (Nominatim reverse geocoding). Natija: yaqin joy, to‘liq manzil, chegaraviy to‘g‘ri kvadrat va masofa (meters), masalan 30 m ichida.
- `pro_geo_geocode_search` `  ·` — Manzil yoki joy nomini koordinataga aylantirish (Nominatim / OpenStreetMap). Natija: joy nomi, lat/lon, chegaraviy to‘g‘ri kvadrat va turlar. Structured qidiruv uchun "structured" argumenti qo‘llanadi (masalan "Toshkent, O‘zbekiston").
- `pro_geo_overpass_query` `  ·` — OpenStreetMap Overpass QL so‘rovi: bino, yo‘l, bog‘, suv, landi va boshqa obyektlar. So‘rov "query" yoki "q" argumentida. So‘rov yoki barcha ko‘zguchalar ishlamasa, sabab va sinangan ko‘zguchalar ro‘yxati qaytariladi.
- `pro_geo_weather_current` `  ·` — Koordinataga ko‘ra haqiqiy vaqt ob-havosi (Open-Meteo, kalitsiz): harorat, hissiy harorat, namlik, yomg‘ir, qor, shamol, bosim, bulut va quyosh holati. Bir nechta koordinat ham berilishi mumkin — ular parallel so‘raladi.

## color (3)

_Color conversion & contrast helpers_

- `pro_color_contrast` `  ·` — WCAG kontrast tekshiruvi: ikki rang orasidagi nisbat va AA/AAA darajalari. Rang yoki rasmdan avtomatik eng yaxshi o‘qiladigan juftlikni topadi. Bir nechta rang ro‘yxatini ham tekshiradi.
- `pro_color_convert` `  ·` — Rangni barcha shakllar o‘zgartirish: HEX, RGB(A), HSL, OKLCH, LAB va nomlangan ranglar (141 ta). "against" berilsa, ikki rang orasidagi WCAG kontrasti ham hisoblanadi.
- `pro_color_palette` `  ·` — Rangdan palitra yasash: yorqin va quyuq pog‘onalar (tints/shades), analogik, komplementar, triadik, split-komplementar. Har bir rang WCAG kontrasti bilan tekshiriladi, shuning uchun o‘qilishi mumkin bo‘lgan juftliklarni ko‘rasiz.

## phonetics (3)

_Phonetic transcription helpers_

- `pro_phonetics_compare` `  ·` — Ikki satrni solishtirish: Levenshtein masofasi, Jaro-Winkler va Dice o‘xshatligi (0..1), hamda ikkalasining Soundex kodi. Kodlar bir xil bo‘lsa, nomlar taxminan bir xil degani - lekin Soundex bosh harflarni farqlamaydi, shuning uchun ham o‘xshatlik, ham kod ko‘rsatiladi.
- `pro_phonetics_match` `  ·` — Ikki ro‘yxatdagi mos ishlarni topish: Soundex kodi bo‘yicha va o‘xshatlik bo‘yicha. Har bir juft uchta raqam bilan baholanadi, shuning uchun caller o‘zi tanlaydi - Soundex "Smith" va "Smit" ni topadi, lekin "Jon" va "Jan" ni topmaydi, chunki birinchi harfni umuman farqlamaydi.
- `pro_phonetics_soundex` `  ·` — Nomlarga US Census Soundex kodi berish va bir xil kodli nomlarni guruhlash. "Robert" va "Rupert" ikkalasi R163 bo‘ladi. Ro‘yxat berilsa, guruhlar va eng katta guruhlar chiqadi.

