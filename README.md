# Pro-Fetch MCP

Professional fetch, deep-research va GitHub o'qish MCP serveri.
**571 MCP tool · 26 kategoriya · smart tool discovery · umumiy execution/security engine**

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
npm run check    # verify:static + verify:registry + build + test + verify:package + format:check
```

Alohida: `npm run build`, `npm test`, `npm run verify:registry` (haqiqiy tool registry'ni yuklab, 571 / 26 / barcha 4 profil sonlarini tekshiradi).

Ishga tushirish (stdio MCP server):

```bash
npm start        # yoki: npx tsx src/server.ts
```

### Platformalar

Server **Windows, Linux va macOS** da ishlaydi (CI: `ubuntu-latest` va `windows-latest`, Node 22.13 va 24).
Qo'shimcha ravishda Alpine/musl konteyneri ham tekshiriladi.

`sharp`, `@napi-rs/canvas` va `tesseract.js` platformaga bog'liq binary fayllar olib keladi. Ular
`await import()` bilan **lazy** yuklanadi, shuning uchun binary muvaffaqiyatsiz bo'lsa ham server
**ishga tushadi** — faqat tegishli tool xato beradi. `pro_fetch_diagnostics` qaysi modullar mavjudligini
ko'rsatadi:

```json
"platform": {
  "os": "linux", "arch": "x64",
  "native_media": { "sharp": false, "canvas": false, "tesseract": true },
  "playwright": false
}
```

Alpine'da binary qurish kerak bo'lsa: `apk add --no-cache python3 make g++` va keyin
`npm rebuild sharp @napi-rs/canvas`. Playwright brauzerlari uchun: `npx playwright install --with-deps chromium`.

### Tashqi buyruqlar (git, docker, kubectl, psql, redis-cli)

Bu tool'lar tizim buyrug'ini chaqiradi. Ular **majburiy emas** — o'rnatilmasa, faqat o'sha tool
xato beradi va qolgan 500+ tool ishlayveradi. Xato endi aniq nomlanadi (`COMMAND_NOT_FOUND`),
shuning uchun model "o'rnatilmagan" bilan "PATH da yo'q"ni ajratolmaydi:

```
COMMAND_NOT_FOUND: 'git' topilmadi. Bu buyruq PATH da emas yoki o'rnatilmagan.
```

| Pack | Kerak |
|---|---|
| git (22 tool) | [git-scm.com](https://git-scm.com) |
| devops (24 tool) | docker, kubectl, terraform, npm |
| database — Postgres/MySQL/Redis | `psql`, `mysql`, `redis-cli` + credential |
| database — **SQLite (24 tool)** | **hech narsa** — `better-sqlite3` paket bilan keladi |

SQLite alohida: u avval `sqlite3` buyrug'iga bog'liq edi, bu esa ko'pchilik kompyuterlarda yo'q —
barcha 24 ta database tool o'lik bo'lib qolardi. Endi paket ichidagi native drayver ishlatiladi,
CLI faqat oldindek platformalarda zaxira sifatida qoladi.

> **`npm install --ignore-scripts` bilan o'rnatilsa** native binding qurilmaydi va SQLite tool'lari
> ishlamaydi. Buni tiklash uchun: `npm rebuild better-sqlite3`. Bunday holatda xato
> `SQLITE_UNAVAILABLE` chiqadi va qaysi buyruq kerakligini aytib beradi — server esa
> boshqa 500+ tool bilan to'liq ishlayveradi.

## Jarayon xavfsizligi

MCP server — bitta uzoq umrli jarayon, barcha tool'lar bir xil process'da ishlaydi. Shu sababli
**bitta noto'g'ri kirish butun serverni o'ldirsa**, bu xato emas — butun xizmat to'xtaydi.

Shuning uchun:

- **Baytlar dekoderdan oldin aniqlanadi.** Tesseract, pdfjs va `sharp` noto'g'ri ma'lumotni o'z
  worker thread'ida rad qiladi — bu rejection `try/catch` bilan ushlanmaydi. Faqat PNG belgisi bor
  4 baytli "rasm" ham tuzatiladi (belgi + strukturaviy tekshiruv).
- **Kutilmagan promise'lar ushlanadi.** `.then()` zanjiri `.catch()` siz qolsa, rad etilish
  jarayonni tugatadi.
- **`uncaughtException` va `unhandledRejection` handler'lari o'rnatilgan.** Kutubxona kelajakda
  noshik bo'lsa, xato stderr'ga yoziladi va sessiya davom etadi.

## Qwen Desktop konfiguratsiyasi

Tayyor konfiguratsiya namunasi [qwen-mcp.example.json](qwen-mcp.example.json) da — mashinasiz, nisbiy yo'llar bilan va o'rnatilgan paketni ishlatadi. Nusxalang va `args` ni o'z kompyuteringizga moslang:

```bash
cp qwen-mcp.example.json qwen-mcp.json   # qwen-mcp.json .gitignore'da
```

`smart` profilda modelga 571 schema o'rniga **10 ta Smart System tool** ko'rinadi. Ular to'liq imkoniyatni saqlab qoladi, chunki biri ko'p tool'ni bir chaqiruvda ishga tushiradi. Batafsil: [Smart System](#smart-system). API kalitlari `.env` da yoki `GITHUB_TOKEN_FILE` kabi `*_FILE` o'zgaruvchisida saqlanadi; `.env` hech qachon commit qilinmaydi va nashr paketiga kirmaydi. Nisbiy `*_FILE` yo'llari paket ildiziga nisbatan resolve qilinadi, shuning uchun server istalgan papkadan ishga tushsa ham to'g'ri ishlaydi.

## Smart System

Ko'p MCP klient modelga yuboriladigan tool sonini ~10 taga cheklaydi. 571 ta tool'ni yuborish
imkonsiz, oddiy discovery esa har bir amal uchun uch round trip talab qiladi va model tool nomini
taxmin qilishi kerak bo'ladi.

Smart System buni ikki yo'l bilan hal qiladi: **kompozit tool'lar** va **batch ijro**.

### 10 ta tool

| Tool | Vazifa |
|---|---|
| `pro_capability_call` | **Batch executor.** `{ tool, arguments }` ro'yxatini bir chaqiruvda bajaradi |
| `pro_capability_map` | Vazifani tabiiy tildan aniq tool'larga va schema'lariga bog'laydi |
| `pro_fetch_tool_execute` | Bitta tool'ni aniq nom bilan chaqirish |
| `pro_research_deep` | To'liq tadqiqot: qidiruv → o'qish → faktalar → tekshiruv → hisobot |
| `pro_fetch_ingest` | Har qanday URL → toza tuzilgan ma'lumot (sahifa, PDF, CSV, feed) |
| `pro_audit_page` | Bitta sahifa → barcha tegishli ekstraksiyalar |
| `pro_repo_audit` | Repository → to'liq hisobot (metadata, README, tree, issues, PR, release) |
| `pro_pr_review` | PR → to'liq review (diff, checks, reviews, izohlar) |
| `pro_site_scan` | Saytni crawl qilib tushuntirish |
| `pro_data_pipeline` | Datasetni yuklash, profillash va qayta ishlash |

### Namuna: 3 round trip o'rniga 1

```jsonc
// Eski usul: qidiruv → schema → chaqiruv → yana qidiruv → schema → chaqiruv (6+ round trip)
{ "tool": "pro_capability_call", "arguments": {
  "calls": [
    { "tool": "pro_fetch_web_search",      "arguments": { "query": "RAG arxitekturasi 2025" }, "label": "search" },
    { "tool": "pro_fetch_academic_search", "arguments": { "query": "retrieval augmented generation" }, "label": "papers" },
    { "tool": "pro_fetch_news_search",     "arguments": { "query": "RAG news" }, "label": "news" }
  ]
}}
```

Bir chaqiruvda uchta tool ishlaydi. Birinchisi xato bersa, qolganlari davom etadi va natijada
har biri alohida `ok`/`error` bilan qaytadi.

### Natija hajmi: `detail`

Har bir kompozit `detail` parametrini oladi:

- `detail: "summary"` (standart) — har bir qadam holati ko'rsatiladi, lekin faqat **bo'sh natija bermagan**
  qadamlar chiqadi, har biri qisqa bo'lak bilan. O'lchilgan: 17-qadamli auditda **91% token tejash**
  (43 KB → 3.8 KB).
- `detail: "full"` — to'liq matn, 120,000 belgi chegarasi bilan.

```jsonc
{ "tool": "pro_audit_page", "arguments": { "url": "https://example.com", "detail": "summary" } }
```

### Qidiruv tili

`pro_capability_map` kalit so'z mosligidan ko'p kuchli: BM25 reytingi, morfologik kengaytirish
(*extracting → extract*) va 55 ta so'zli sinxon jadvali. Shuning uchun "papers about retrieval"
arxiv tool'ini, "leaked credentials in code" esa `secret_scan` ni topadi.

### Xavfsizlik saqlanadi

Kompozitlar registry'ni aylanib o'tmaydi: har bir ichki chaqiruv `dispatch()` orqali o'tadi, shuning
uchun `PRO_FETCH_ALLOWED_TOOLS`, `PRO_FETCH_READ_ONLY`, SSRF tekshiruvi, `PRO_FETCH_OUTPUT_ROOT`
sandbox'i va timeout **o'zgarmagan holda** qo'llaniladi. `pro_capability_call` o'zi allowlistda
yo'q bo'lsa, u umuman ishga tushmaydi.

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
| `smart` | 10 | **Smart System**: kompozitlar + batch executor + discovery |
| `standard` (default) | 171 | + github, search, extract, auth |
| `full` | 571 | Barcha 26 kategoriya |

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
- `tests/all-tools.test.ts` — 571 tool: son, schema, smart profile, meta-execution, dispatch va input-contract regressiyalari
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
