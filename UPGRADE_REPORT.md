# Pro-Fetch runtime upgrade report

## Kiritilgan yaxshilanishlar

- **Smart tool discovery:** `smart` profilida 501 ta schema o‘rniga 5 ta meta-tool ko‘rsatiladi. `pro_fetch_tool_list_details` vazifaga mos tool’larni qidiradi, `pro_fetch_tool_execute` esa aniq tool’ni markaziy `dispatch` orqali ishga tushiradi.
- **Umumiy execution engine:** barcha tool’lar uchun request ID, timeout, global/kategoriya parallel ishlash limitlari, davomiylik/status metrikalari va standart error metadata.
- **Security policy:** tool/category allow-deny siyosatlari, read-only rejim, xavfli HTTP metodlarini bloklash, browser JavaScript ruxsati va `PRO_FETCH_OUTPUT_ROOT` orqali yoziladigan fayllar sandbox’i.
- **Credential boshqaruvi:** `GITHUB_TOKEN`, `SEARCH_API_KEY`, `OPENAI_API_KEY` va boshqa qo‘llab-quvvatlanadigan kalitlarni environment yoki `VARIABLE_FILE` orqali o‘qish; diagnostika maxfiy qiymatlarni chiqarmaydi.
- **HTTP engine:** SSRF preflight, xavfsiz redirect, boshqa origin’ga o‘tganda credential header’larini olib tashlash, HTTPS→HTTP downgrade blokirovkasi, proxy/NO_PROXY, body-size/time limit, public GET cache, ETag/Last-Modified revalidation, `Retry-After` va faqat idempotent metodlarga retry.
- **Search:** Brave Search API mavjud bo‘lsa undan foydalanish, muammo bo‘lsa DuckDuckGo fallback, tracking query parametrlarini olib tashlash, natijalarni dedupe va query bo‘yicha tartiblash.
- **Crawler:** canonical URL, `robots.txt` qoidalari, Crawl-delay va host bo‘yicha navbat/parallelizm cheklovlari.
- **GitHub:** REST so‘rovlarida Link-header orqali pagination, sahifalar uchun hard cap (`PRO_FETCH_GITHUB_MAX_PAGES`, maksimum 20), rate-limit tugaganda reset vaqtini ko‘rsatish.
- **Browser:** Playwright session limit (`PRO_FETCH_BROWSER_MAX_SESSIONS`) va HTTP(S) request’larning har birida SSRF tekshiruvi; `storage_state_path` read-only va output sandbox siyosatiga ham bo‘ysunadi.
- **Observability/diagnostics:** runtime usage, execution, network concurrency va credential holatini qiymatlarni oshkor qilmasdan ko‘rsatish.
- **Regression guard:** static script 501 tool, 26 kategoriya, config JSON, template dispatcher yo‘qligi va embedded secret’larni tekshiradi.

## Sozlash

1. `mcp.json` ichidagi `args` yo‘lini ZIP ochilgan joydagi `src\server.ts` manziliga moslang.
2. GitHub tokenni Windows user environment’iga qo‘ying yoki `GITHUB_TOKEN_FILE` orqali lokal secret fayliga yo‘l ko‘rsating. Qidiruv uchun `SEARCH_API_KEY` / `SEARCH_API_KEY_FILE` xuddi shunday ishlaydi.
3. Browser tool’lar uchun Playwright ixtiyoriy dependency kerak bo‘ladi.

Windows PowerShell’da tekshirish:

```powershell
npm install
npm run verify:static
npm run build
npm test
```

## Validatsiya chegarasi

`npm run verify:static`, `npm run verify:registry` (stub'langan uchinchi tomon paketlari bilan haqiqiy registry yuklanadi) va TypeScript fayllarining sintaksis/type tekshiruvlari bajarilgan. Registry tekshiruvi yetishmayotgan ikki github tool'ni (47 o'rniga 45) aniqlagan; ular qo'shildi va registry endi 501 / 26 kategoriya / minimal 59 / standard 153 / full 501 / smart 5 ni beradi.

Tarmoq (npm registry) mavjud bo'lmagan muhitda `npm ci` bajarib bo'lmaydi, shu sababli real `tsc` build va to'liq Vitest suite (tests/*.test.ts) shu muhitda ishga tushirilmagan. Ularni PASS deb hisoblamang: maqsadli muhitda `npm ci && npm run check` ishga tushiring.

MCP SDK v2 migratsiyasi host mosligi tekshirilmagani uchun bajarilmadi: MCP mijoz v1 protokol yo'lida saqlanadi, migratsiya alohida compatibility branch va integration test talab qiladi.

## MAX platform packlari

Nine additional packs register 198 tool handlers: Git (22), code-host APIs (24), DevOps (24), database clients (24), security auditing (24), local knowledge/RAG primitives (18), collaboration (28), cloud storage (16), and productivity (18). Provider calls use the shared SSRF-aware HTTP client; local CLI operations use `execFile` without shell interpolation. Some providers/CLIs require separate credentials or executables. Knowledge retrieval uses lexical fallback; when `OPENAI_API_KEY`, `OPENAI_EMBEDDINGS_BASE_URL`, and a compatible embedding model are configured, ingestion and search use hybrid vector + lexical ranking. The pack does not claim live provider credentials or external integration tests are available by default.
