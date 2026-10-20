# pro-fetch-mcp

Professional fetch, deep-research va GitHub MCP serveri - **672 tool, 42 kategoriya, bitta xavfsizlik enginei**.

Modelga kerak bo'lgan tool beriladi: standart `smart` profil **11 ta meta-tool** orqali barcha 672 tanni tarkibiy tarzda ochadi — MCP mijoz schema'lar botinishiga yo'l qo'ymaydi.

![npm version](https://img.shields.io/npm/v/pro-fetch-mcp?label=npm)
![node](https://img.shields.io/badge/node-%3E%3D22.13-blue)
![license](https://img.shields.io/npm/l/pro-fetch-mcp)
![tests](https://img.shields.io/badge/tests-1018%20passing-brightgreen)

## Nima uchun

- **672 ishlaydigan tool** - fetch, crawl, ekstraksiya, konvertatsiya, OCR, qidiruv, tadqiqot, git, GitHub, GitLab/Gitea/Forgejo/Bitbucket, SQLite, xavfsizlik, Slack/Jira/Linear/Notion, storage va yana. Har biri haqiqiy amalga oshirilgan, stub emas.
- **Smart System** — 11 ta meta-tool (`pro_capability_call`, `pro_capability_map`, `pro_research_deep`, …) barcha katalogni bitta round trip'da ishga tushiradi. Batch ijro, BM25 vazifa→tool discovery va `detail` rejimi 17-qadamli auditni 43 KB dan 3.8 KB ga qisqartirdi (**o'lchangan: 91% token tejash**).
- **Xavfsizlik — ogohlantirish emas, engine** — DNS pinning'li SSRF himoyasi, symlink kuzatiladigan workspace sandboxi, har bir chaqiruvda permission siyosati, cross-origin redirect'larda credential stripping, HTTPS→HTTP downgrade blokirovkasi. Har bir kompozit chaqiruv bir xil `dispatch()` darvozasidan o'tadi.
- **Nobud bo'lmaydi** — native binary'lar (sharp, canvas, tesseract) lazy yuklanadi; git/docker/kubectl yo'qligida aniq `COMMAND_NOT_FOUND`; hech biri o'rnatilmagan hostda ham server ishga tushib 500+ tool xizmat qiladi.

## Tez boshlash

```bash
npx -y pro-fetch-mcp        # stdio MCP server, nol konfiguratsiya
```

Istalgan MCP mijoz — Claude Desktop, Cursor, Qwen, VS Code, sizning harness'ingiz:

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

Tayyor nusxa: [`mcp.example.json`](mcp.example.json).

Kalitlar server yonidagi `.env` da (yoki qiymat o'rnini ko'rsatuvchi `*_FILE` o'zgaruvchilarda) saqlanadi. `.env` hech qachon commit qilinmaydi va npm paketiga kirmaydi.

| Credential | Nima ochadi |
|---|---|
| `GITHUB_TOKEN` | code search, private repo, yuqori rate limit |
| `SERPER_API_KEY` | Google asosli web search |
| `OPENAI_API_KEY` | audio transkripsiya, embedding hybrid retrieval |
| `SEARCH_API_KEY` | Brave search (yo'q bo'lsa DuckDuckGo) |
| `GITLAB_TOKEN`, `SLACK_BOT_TOKEN`, `JIRA_TOKEN`, … | mos adapter pack — [`.env.example`](.env.example) |

## Smart System

Ko'p MCP mijoz yuzlab tool schema'iga chidamaydi. `smart` (standart) modelga **11 ta tool** ko'rsatadi, ular hammasini tarkib qiladi:

| Tool | Nima qiladi |
|---|---|
| `pro_capability_call` | **Batch executor** — `{tool, arguments}` ro'yxatini bitta chaqiruvda bajaradi; natijada har biri alohida `ok`/`error` |
| `pro_synthesize` | Ko'p tool natijasini bitta izchil javobga aylantiradi |
| `pro_capability_map` | Oddiy tildagi vazifa → aniq tool va uning schema'si (BM25 + morfologik kengaytirish) |
| `pro_fetch_tool_execute` | Aniq nom bilan bitta tool chaqirish |
| `pro_research_deep` | Qidiruv → o'qish → faktlar → tekshiruv → hisobot |
| `pro_fetch_ingest` | Istalgan URL → toza tuzilgan ma'lumot (sahifa, PDF, CSV, feed) |
| `pro_audit_page` | Bitta sahifa → barcha tegishli ekstraksiyalar |
| `pro_repo_audit` | Repo → to'liq hisobot (metadata, README, tree, issues, PR, release) |
| `pro_pr_review` | PR → to'liq review (diff, checks, reviews, izohlar) |
| `pro_site_scan` | Saytni crawl qilib tushuntirish |
| `pro_data_pipeline` | Datasetni yuklash, profillash va qayta ishlash |

3 ta round trip 1 taga aylanadi:

```jsonc
{ "tool": "pro_capability_call", "arguments": {
  "calls": [
    { "tool": "pro_fetch_web_search",      "arguments": { "query": "RAG arxitekturasi 2025" }, "label": "search" },
    { "tool": "pro_fetch_academic_search", "arguments": { "query": "retrieval augmented generation" }, "label": "papers" },
    { "tool": "pro_fetch_news_search",     "arguments": { "query": "RAG news" }, "label": "news" }
  ]
}}
```

Keyin uchta javobni bittaga birlashtirasiz:

```jsonc
{ "tool": "pro_synthesize", "arguments": {
  "results": [
    { "tool": "pro_fetch_web_search",      "output": "…" },
    { "tool": "pro_fetch_academic_search", "output": "…" },
    { "tool": "pro_fetch_news_search",     "output": "…" }
  ],
  "task": "RAG'ning joriy holatini qisqacha bayon qilib, har bir da'vo qayerdan kelganini ko'rsat"
}}
```

**Tarkibiyat xavfsizlikni zaiflashtirmaydi.** Har bir ichki chaqiruv markaziy `dispatch()` orqali o'tadi, shuning uchun `PRO_FETCH_ALLOWED_TOOLS`, `PRO_FETCH_READ_ONLY`, SSRF tekshiruvi, output sandboxi va timeout o'zgarmagan holda qo'llaniladi. `pro_capability_call` ozi allowlistda bo'lmasa, u umuman ishga tushmaydi.

## 🚦 Simple va MAX rejim

`PRO_FETCH_MODE` bir batch'ning quvvatini belgilaydi. **Simple — standart**, va bu variant bu parametr paydo bo'lishidan oldingi versiyalar bilan bir xil ishlaydi.

| | simple *(standart)* | MAX |
|---|---|---|
| `pro_capability_call` da chaqiruv soni | 5 000 | 9 999 999 999 |
| parallelizm / tarmoq / kategoriya | 64 / 64 / 16 | har biri 512 |
| katta batch qanday bajariladi | bitta batch | `PRO_FETCH_BATCH_CHUNK` (1000) bo'laklab, navbat bilan |
| o'z-o'zidan bajariladigan chegara | — | `PRO_FETCH_MAX_SELF_SERVE` (99 999), keyin foydalanuvchiga so'raladi |

```bash
PRO_FETCH_MODE=max          # MAX, butun server uchun
PRO_FETCH_MAX_BATCH=250     # MAX'ni ikkala rejimda ham toraytiradi
```

Model uni har bir batch uchun ham tanlay oladi — bu odatda kerak bo'lgan holat, chunki yig'maning hajmi server haqidagi emas, **ish haqidagi** qaror:

```json
{ "tool": "pro_capability_call", "mode": "max", "calls": [ … ] }
```

Chaqiruvdagi `mode` faqat **o'sha batch** chegarasini ko'taradi. Parallelizmni kengaytira olmaydi, chunki semforlar server ishga tushganda quriladi va handler keyin ishlaydi — shuning uchun `PRO_FETCH_MODE=max` ularni ko'tarishning yagona yo'li, ikkalasi ataylab almashtirilmaydigan qilingan. `mode` yozilmasa, server sozlamasi qo'llaniladi.

MAX bitta ish uchun kerak — bitta batch'ga sigmaydigan yig'ma: butun repozitoriyni o'qish yoki hujjatlar to'plamini crawl qilish. U faqat **quvvatni** ko'taradi. Bu yetish huquqi emas: bu to'rtta raqamni ko'tarish bir kichik chaqiruv bilan yetib bo'lmaydigan joyga olib chiqmaydi.

O'z-o'zidan bajariladigan chegaradan yuqorida tool **rad etadi va sababini aytadi**, chunki "bu loyihadagi hamma narsani o'qi" — to'rt yuz so'rov ham, to'rt yuz ming so'rov ham bo'lishi mumkin, qaysi biri nazarda tutilganini faqat so'ragan odam biladi. Chaqiruvchi foydalanuvchi rozilik bergandan keyin `confirm_large_batch: true` bilan qayta yuboradi.

**MAX rejim nimani o'zgartirmaydi.** Tarmoq himoyasi quvvat emas va uning hech bir qismi ko'chmaydi:

- maxsus, loopback, link-local va `.internal` manzillar bloklanib qoladi
- protokol ro'yxati saqlanadi — `file:` yo'q, `gopher:` yo'q
- URL ichidagi hisob malumotlari rad etiladi
- DNS pinning saqlanadi — ulanish tekshirilgan manzilda qoladi
- `PRO_FETCH_OUTPUT_ROOT` chegarasi, symlink'dan qochishni aniqlash va kalit qatlami tegilmagan

`tests/mode.test.ts` xavfsizlik sinovlarini **MAX rejim yoqilgan holatda** tekshiradi — ya'ni kelajakda biror chegara rejimga o'tkazilsa, test to'plami uni ushlaydi.

MAX rejimda yana bitta quvvat chegarasi saqlanadi: `PRO_FETCH_MAX_PER_HOST_CONCURRENCY`. Boshqa barchasi shu jarayonni nima qila olishini cheklaydi; bu esa **bitta tashqi serverga** nechta so'rov borishini cheklaydi — chegarasiz qilsak, batch boshqaning serveriga DDoS bo'lib aylanadi. Standart 8, ko'pi bilan 512. Qaror `src/core/bounded-env.ts` da **nom bilan** ko'rsatilgan, ya'ni izohga yashirilmaydi.

## Tool katalogi

<details>
<summary><b>Barcha 42 kategoriya - 672 tool</b></summary>

| Kategoriya | Tool | Kategoriya | Tool |
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
| database (SQLite/Postgres/MySQL/Redis) | 24 | auth (session va kalitlar, faqat xotirada) | 12 |
| security (OSV/secret scan/SBOM) | 24 | apitest (OpenAPI/GraphQL/WSDL) | 12 |
| admin (discovery, metrics, policy) | 24 | i18n | 12 |
| git | 23 | monitoring | 10 |

</details>

**Profillar** modelga qancha schema ko'rinishini boshqaradi — xavfsizlik chegarasi emas:

| Profil | Tool | Tarkibi |
|---|---:|---|
| `minimal` | 73 | http, convert, admin |
| `standard` (default) | 178 | + github, search, extract, auth |
| `smart` | 11 | yuqoridagi Smart System |
| `full` | 672 | hammasi |

Haqiqiy kirish nazorati environment'da: `PRO_FETCH_ALLOWED_TOOLS`, `PRO_FETCH_DENIED_TOOLS`, `PRO_FETCH_DENIED_CATEGORIES`, `PRO_FETCH_READ_ONLY`, `PRO_FETCH_MUTATION_ALLOWLIST`, `PRO_FETCH_OUTPUT_ROOT` — har bir chaqiruvda, meta-executor orqali chaqirilganlarda ham, qo'llaniladi.

## Xavfsizlik modeli

- **SSRF himoyasi** — chiquvchi HTTP(S) DNS'ni resolve qilib tekshiradi va connection'ni pin'laydi; `HTTP_PROXY`/`HTTPS_PROXY` faqat ataylab yoqiladi, chunki uzoq proxy target DNS'ini o'zi resolve qiladi.
- **Workspace sandboxi** — `PRO_FETCH_OUTPUT_ROOT` berilganda har bir `output_path` va browser `storage_state_path` yozuvi shu papka ichida saqlanadi (symlink va junction'lar kuzatilib, qochish rad etiladi).
- **GitHub kiritma himoyasi** — `owner`/`repo`/`path`/`gist_id`/SHA markaziy ravishda tekshiriladi; traversal, chuqur path va API'ni o'zgartiradigan belgilar rad etiladi.
- **Redirect xavfsizligi** — cross-origin o'tishlarda credential'lar o'chiriladi; HTTPS→HTTP downgrade bloklanadi; redirect **loop'lari** bot himoyasi sifatida xabarlanadi, hop soni emas.
- **Jarayon barqarorligi** — media baytlari dekoder ko'rishidan oldin belgi bilan aniqlanadi (dushman fayl worker thread'ni ag'dara olmaydi), har bir `import().then()` zanjirida `.catch()` bor, `uncaughtException`/`unhandledRejection` handler'lari serverni o'ldirish o'rniga stderr'ga yozadi.
- **Secretlar** — diagnostika faqat credential bor-yo'qligi va manbasini ko'rsatadi, qiymatini yo'q.

To'liq chegara ro'yxati: [SECURITY.md](SECURITY.md).

## Talablar va yumshoq degradatsiya

**Node.js ≥ 22.13** (`pdfjs-dist@6` shuni talab qiladi). Qolgan barchasi ixtiyoriy:

| Ixtiyoriy | Yo'q bo'lgandagi ta'sir |
|---|---|
| `sharp`, `@napi-rs/canvas`, `tesseract.js` binary'lari | media tool'lari alohida xato beradi; server ishlayveradi |
| `git`, `docker`, `kubectl`, `terraform`, `psql`, `redis-cli` | o'sha tool'lar aniq xabar bilan `COMMAND_NOT_FOUND` |
| Playwright brauzerlari | browser pack `npx playwright install --with-deps chromium` kerakligini aytadi |
| npm build skriptlari (`--ignore-scripts`) | SQLite tool'lari `SQLITE_UNAVAILABLE` va tuzatish buyrug'ini (`npm rebuild better-sqlite3`) aytadi |

SQLite uchun **sistem binary kerak emas** — paket ichidagi `better-sqlite3` drayver ishlatiladi (`sqlite3` CLI faqat zaxira). Windows'da npm tool'lari `npm-cli.js` ni `process.execPath` orqali chaqiradi, shuning uchun `npm audit`, `npm outdated` va litsensiya hisoboti u yerda ham ishlaydi.

## Dasturlash

```bash
npm ci
npm run check   # verify:static → verify:registry → build → test → verify:package → format:check
```

- **1018 ta test** (Vitest): SSRF, redirectlar, permission siyosati, output sandboxi, timeout'lar, har bir tool'ing kiritma shartnomasi va jonli provider-failure xatti-harakati.
- `verify:registry` haqiqiy registry'ni yuklab **672 tool / 42 kategoriya / barcha 4 profil sonini** tekshiradi.
- `npm run audit:schema` har bir sxemani uning orqasidagi kod bilan solishtiradi: handler'ining hech qachon o'qimaydigan property, hech nima o'qimaydigan `required` argument, yoki hamma narsani qabul qiladigan ochiq sxema. Hozir **552 tekshirilgan tool'da 0 o'lik property va 0 o'qilmagan required**, va 672 ta sxemaning barchasi e'lon qilmagan property'ni rad etadi.
- `verify:package` nashr paketida shebang, `files` allowlist va **nol credential/manba fayl** ekanligini isbotlaydi.
- MCP protokoli o'zi jonli sinovdan o'tkazildi: `initialize`, `tools/list` (672/672 unique, valid schemalar), har bir smart tool uchun `tools/call`, yashirin tool'lar rad etildi, stdout toza JSON-RPC.

## Litsenziya

[MIT](LICENSE)

---

[English version](README.md) · [O'zgarishlar](CHANGELOG.md) · [Hissa qo'shish](CONTRIBUTING.md)
