# Pro-Fetch MCP

Professional fetch, deep-research va GitHub o'qish MCP serveri.
**559 MCP tool · 26 kategoriya · smart tool discovery · umumiy execution/security engine**

## Holat

| Pack | Tool | Holat |
|---|---|---|
| github | 47 | ✅ GitHub REST API, repo va issue ma’lumotlari |
| http | 18 | ✅ 18 real (core fetcher) |
| admin | 21 | ✅ Discovery, runtime metrics, policy, diagnostika, registry/qaidiruv/stats |
| docs | 15 | ✅ 15 real (arXiv, npm, PyPI, RFC, PubMed, ...) |
| data | 25 | ✅ CSV/JSON statistika, diff, NLP, hash, encode/decode, uuid, jwt, number/date format, array ops |
| extract | 23 | ✅ CSS/XPath/JSONPath, OG meta, heading outline, phone/date/price/image/hreflang extraction |
| archive | 15 | ✅ 15 real |
| monitoring | 10 | ✅ 10 real |
| convert | 30 | ✅ CSV/JSON/YAML/XML, HTML, PDF, Office, EPUB, OCR, markdown→HTML, JSON→YAML/minify |
| search | 20 | ✅ Web, Crossref, Open Library, Hugging Face, GDELT, Wikimedia, Google Patents, GitHub, Stack Exchange, DEV, Remote OK, YouTube, Shopping |
| research | 25 | ✅ Manba yig'ish, citation, fact/evidence va report yordamchilari |
| crawl | 20 | ✅ Cheklangan same-host crawl, sitemap, link va metadata extraction |
| media | 15 | ✅ Sharp, EXIF, QR, OCR, PDF va screenshot amallari |
| auth | 12 | ✅ Authenticated fetch va process-xotirasidagi session/key boshqaruvi |
| apitest | 12 | ✅ OpenAPI/Swagger, GraphQL, WSDL va API probe |
| browser | 41 | ✅ Playwright session automation: navigation, tabs, cookies, dialogs, drag, upload, download, state/html/text extraction, sessions (ixtiyoriy dependency) |
| i18n | 12 | ✅ Locale, transliteration, tarjima, slugify, case_convert, unicode_normalize, reading_time |
| git | 22 | ✅ Git history, diff, branch/tag va stash operations (shellsiz execFile) |
| codehost | 24 | ✅ GitLab, Gitea, Forgejo va Bitbucket REST API adapters |
| devops | 24 | ✅ Docker, kubectl, Terraform va npm diagnostic tools |
| database | 24 | ✅ SQLite, PostgreSQL, MySQL va Redis CLI, read-only query gate |
| security | 24 | ✅ OSV, secret scan, SBOM inventory va HTTP security audits |
| knowledge | 18 | ✅ Local persistent document store, lexical retrieval, chunks va citations |
| collaboration | 28 | ✅ Slack, Linear, Jira va Notion API adapters |
| storage | 16 | ✅ Dropbox, Google Drive, OneDrive va AWS S3 adapters |
| productivity | 18 | ✅ Gmail, Google Calendar va Todoist adapters |

Audio transcription uchun `OPENAI_API_KEY` (yoki mos `OPENAI_BASE_URL`) kerak. Browser pack Playwright o'rnatilgan bo'lishini talab qiladi. Auth/session va API key tool'lari ma'lumotni faqat server process xotirasida saqlaydi.
`GITHUB_TOKEN` code search uchun, `YOUTUBE_API_KEY` video search uchun, `SERPAPI_API_KEY` reverse-image va shopping search uchun kerak. Umumiy web search `SEARCH_API_KEY` bo'lsa Brave’ni, bo'lmasa DuckDuckGo’ni ishlatadi.

MAX provider konfiguratsiyasi uchun `.env.example` faylida GitLab/Gitea/Forgejo/Bitbucket, Slack/Linear/Jira/Notion, storage, Google va Todoist credential nomlari keltirilgan. `PRO_FETCH_WORKSPACE` Git/CLI ishchi katalogi, `PRO_FETCH_ALLOW_COMMANDS=true` esa faqat ataylab yoqilganda npm test/build bajarilishiga ruxsat beradi.

## O'rnatish

Talab: **Node.js >= 22.13** (`pdfjs-dist@6` shuni talab qiladi; `package.json` da `engines` ko'rsatilgan).

```bash
npm ci
npm run check    # verify:static + verify:registry + build + test
```

Alohida: `npm run build`, `npm test`, `npm run verify:registry` (haqiqiy tool registry'ni yuklab, 559 / 26 / profil sonlarini tekshiradi).

Ishga tushirish (stdio MCP server):

```bash
npm start        # yoki: npx tsx src/server.ts
```

## Qwen Desktop konfiguratsiyasi

Tayyor konfiguratsiya namunasi [qwen-mcp.example.json](qwen-mcp.example.json) da — mashinasiz, nisbiy yo'llar bilan va o'rnatilgan paketni ishlatadi. Nusxalang va `args` ni o'z kompyuteringizga moslang:

```bash
cp qwen-mcp.example.json qwen-mcp.json   # qwen-mcp.json .gitignore'da
```

`smart` profilda modelga 559 schema o'rniga 5 ta meta-tool ko'rinadi: `pro_fetch_tool_list_details` vazifaga mos tool'larni qidiradi, `pro_fetch_tool_execute` esa topilgan tool'ni schema argumentlari bilan chaqiradi. API kalitlari `.env` da yoki `GITHUB_TOKEN_FILE` kabi `*_FILE` o'zgaruvchisida saqlanadi; `.env` hech qachon commit qilinmaydi va nashr paketiga kirmaydi. Nisbiy `*_FILE` yo'llari paket ildiziga nisbatan resolve qilinadi, shuning uchun server istalgan papkadan ishga tushsa ham to'g'ri ishlaydi.

## Runtime, xavfsizlik va ishlash

- Har bir tool markaziy execution engine orqali o‘tadi: timeout, global/kategoriya concurrency, request ID, davomiylik, status va retryable error metadata.
- HTTP layer xavfsiz redirect, redirectlararo credential stripping, HTTPS→HTTP downgrade blokirovkasi, stream orqali body limit, GET cache, ETag/Last-Modified revalidation, Retry-After va faqat idempotent metodlarda retry ishlatadi.
- To‘g‘ridan-to‘g‘ri HTTP(S) so‘rovlari xavfsiz DNS manzillarini resolve vaqtida tekshiradi va connection lookup’da pin qiladi. `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY` faqat `PRO_FETCH_ALLOW_UNPINNED_PROXY_DNS=true` bilan ishlaydi, chunki remote proxy target DNS’ini o‘zi resolve qiladi; buni faqat ishonchli proxy uchun yoqing. Proxy status tool credential qiymatlarini ko‘rsatmaydi.
- Web search Brave (API key bo‘lsa) va DuckDuckGo fallback, URL dedupe va query-based ranking bilan ishlaydi.
- Crawler `robots.txt`, canonical URL, per-host concurrency va crawl-delay qoidalarini hisobga oladi.
- Playwright browser session'lari soni `PRO_FETCH_BROWSER_MAX_SESSIONS` bilan cheklanadi; SSRF tekshiruvi asosiy navigation bilan birga browser ichidagi HTTP(S) request'larda ham bajariladi.
- `PRO_FETCH_READ_ONLY`, `PRO_FETCH_ALLOWED_TOOLS`, `PRO_FETCH_DENIED_TOOLS`, `PRO_FETCH_DENIED_CATEGORIES`, `PRO_FETCH_MUTATION_ALLOWLIST` orqali siyosat sozlanadi. `PRO_FETCH_OUTPUT_ROOT` berilsa (symlink/junction'lar kuzatiladi) `output_path` va browser `storage_state_path` yozuvlari shu papka ichida saqlanadi. `PRO_FETCH_ALLOW_JS=true` bo‘lmasa browser JavaScript/evaluate vositalari bloklanadi.
- `github` kategoriyasidagi barcha tool'lar uchun `owner/repo/user/org/sha/ref/path/gist_id` va raqamli maydonlar markaziy ravishda tekshiriladi (`..`, `/`, `?`, `#`, `%` kabi API yo'lini o'zgartiradigan qiymatlar rad etiladi).
- Timeout bo'lgan handler bekor qilinmaydi, lekin uning concurrency slotlari `PRO_FETCH_ABANDON_GRACE_MS` (default 30 s) dan keyin majburan bo'shatiladi, shunda qotib qolgan tool kategoriyani abadiy to'sib qo'ymaydi.
- `GITHUB_TOKEN`, `SEARCH_API_KEY`, `OPENAI_API_KEY` qiymatlarini environment variable yoki `*_FILE` orqali bering. Diagnostika faqat credential bor-yo‘qligi va manbasini ko‘rsatadi.

## Tool-pack profillari

| Profil | Tool soni | Kategoriyalar |
|---|---|---|
| `minimal` | 69 | http, convert, admin |
| `smart` | 5 | Tool discovery + meta-executor; schemas are loaded on demand |
| `standard` (default) | 171 | + github, search, extract, auth |
| `full` | 559 | Barcha 26 kategoriya |

**Profil — ko'rinish, emas xavfsizlik chegarasi.** Profil faqat modelga qancha schema yuborilishini
belgilaydi: `smart` profilida `pro_fetch_tool_execute` aynan ko'rinmaydigan tool'larni chaqirish
uchun mavjud. Haqiqiy nazorat — quyidagilar, ular har bir chaqiruvda `assertToolAllowed` ichida
bajariladi (meta-executor orqali chaqirilganda ham):

`PRO_FETCH_ALLOWED_TOOLS`, `PRO_FETCH_DENIED_TOOLS`, `PRO_FETCH_DENIED_CATEGORIES`,
`PRO_FETCH_READ_ONLY`, `PRO_FETCH_MUTATION_ALLOWLIST`, `PRO_FETCH_OUTPUT_ROOT`.

Profilni o'zi ham qat'iy allowlistga aylantirmoqchi bo'lsangiz `PRO_FETCH_ENFORCE_PROFILE=true`
qo'ying — u `smart` bilan birga ishlatilmaydi va aniq xato beradi. Batafsil: [SECURITY.md](SECURITY.md).

## Test

- `tests/core.test.ts` — SSRF, xavfsiz redirect, binary size limits, rate-limit, cache, domain scope va secret redaction
- `tests/all-tools.test.ts` — 559 tool: son, schema, smart profile, meta-execution, dispatch va input-contract regressiyalari
- `tests/handler-regression.test.ts` — conversion, search provider, research, crawl, auth va SSE behavior
- `tests/advanced-runtime.test.ts` — smart meta-execution, permission policy, output sandbox, credential files, search ranking, GET cache, ETag, POST no-retry va credential stripping
- `tests/hardening.test.ts` — timeout'dan keyin slot bo'shashi, `PRO_FETCH_OUTPUT_ROOT` symlink sandbox'i va github kiritma himoyasi
- `npm run verify:static` — dependency talab qilmaydigan config, secret va placeholder tekshiruvi (e'lon qilingan sonlar)
- `npm run verify:registry` — haqiqiy registry'ni yuklab, kategoriya va barcha 4 profil o'lchamini `scripts/tool-counts.json` dagi kutilgan qiymatlar bilan solishtiradi
- `npm run verify:package` — nashr paketida shebang, `files` allowlist, credential va tip/source fayllari yo'qligini tekshiradi

Batafsil ishlov qoidalari: [CONTRIBUTING.md](CONTRIBUTING.md). Xavfsizlik chegaralari:
[SECURITY.md](SECURITY.md). O'zgarishlar: [CHANGELOG.md](CHANGELOG.md).


## MAX platform va compatibility holati

MAX packlari Git, GitLab/Gitea/Forgejo/Bitbucket, Docker/Kubernetes/Terraform/npm, SQLite/PostgreSQL/MySQL/Redis, security, local lexical knowledge, Slack/Linear/Jira/Notion, cloud storage va Gmail/Calendar/Todoist operatsiyalarini qo‘shadi. API credential yoki lokal CLI mavjud bo‘lmasa, tegishli tool konfiguratsiya xatosini qaytaradi; live provider muvaffaqiyati kafolatlanmaydi. Knowledge retrieval lexical fallback bilan ishlaydi; `OPENAI_API_KEY`, `OPENAI_EMBEDDINGS_BASE_URL` va mos embedding modeli berilsa embedding + lexical hybrid retrieval yoqiladi.

HTTP(S) to‘g‘ridan-to‘g‘ri ulanishlar DNS natijalarini tekshiradi va transport lookup’da pin qiladi. Proxy target DNS’ini proxy o‘zi yechishi mumkinligi sabab proxy DNS pinning standart holatda qo‘llanmaydi; faqat ishonchli proxy uchun `PRO_FETCH_ALLOW_UNPINNED_PROXY_DNS=true` bilan ochiladi.

**Test holati:** `npm run check` to'liq zanjirni bajaradi — `verify:static`, `verify:registry`, `tsc` build, Vitest va `verify:package`. Bu muhitda (Node v24.21.0, npm 11.19.0, Windows) to'liq `tsc` build va 87 ta Vitest testi PASS bo'ldi; CI esa Node 22.13 va 24, Ubuntu va Windows matritasida `npm ci && npm run check` ni qayta ishlatadi. Live provider integratsiyalari (Jira, Slack, Google, storage) credential va o'rnatilgan CLI talab qiladi, shuning uchun ular muhitga bog'liq. MCP SDK v2 migratsiyasi Qwen Desktop compatibility suite bajarilguncha ataylab alohida bosqichda qoldirilgan.
