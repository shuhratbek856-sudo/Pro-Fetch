# Pro-Fetch — Arxitektora (yangi ishtirokchi uchun)

> Bu fayl `src/` dagi **haqiqiy fayllar** bo'yicha yozilgan: har bo'lim manba faylini ko'rsatadi.
> Maqsad — kodga tushishdan oldin butun tizim xaritasini berish. To'liq tool ro'yxati:
> [`TOOL_CATALOG.md`](./TOOL_CATALOG.md).

## 1. Kirish nuqtasi va ishga tushish

| Bosqich | Fayl | Nima qiladi |
|---|---|---|
| Server | `src/server.ts` | stdio MCP serveri; JSON-RPC `initialize`, `tools/list`, `tools/call`. |
| Env loader | `src/env.ts` | loyiha `.env`ini o'qiydi (mavjud env ustun); `env`dan oldin ishlaydi. |
| Loader | `src/loader.ts` | barcha tool pack'larini `import` qilib, reestrni to'ldiradi. |
| Versiya | `src/core/version.ts` | versiyani `package.json`dan oladi (User-Agent va serverInfo bir manbadan). |

## 2. Reestr va profil

- **`src/core/tool.ts`** — `defineTool()` va `allTools()`: barcha 652 tool shu yerdagi registrga tushadi. Har tool: `name`, `category`, `description`, `inputSchema`, `handler`.
- **`src/router.ts`** — `listTools(profile)` va markaziy `dispatch()`.
- **`src/core/profile.ts`** — nechta schema modelga ko'rinadi: `minimal` (73) · `standard` (178) · `smart` (11 meta) · `full` (652). **Profil — ko'rinish, xavfsizlik chegarasi EMAS.**

`smart` rejimida modelga faqat 11 meta-tool ko'rinadi, ammo ular orqali barcha 652 tanga yetib boriladi.

## 3. Markaziy darvoza: `dispatch()`

Har bir chaqiruv — alohida tool bo'ladimi yoki meta-executor ichidanmi — **bitta `execution-engine.ts` darvozasidan** o'tadi. Kompozitsiya security chegarasini yumshatmaydi. Darvozada tekshiriladi:

- SSRF va tarmoq: `ssrf-guard.ts`, `pinned-proxy.ts`, `network-gate.ts` (private/loopback/`.internal` bloki, DNS pinning, protocol allowlist).
- Fayl/yozish: `output-dir.ts`, `path-containment.ts` (`PRO_FETCH_OUTPUT_ROOT` sandboxi, symlink/junction escape rad etiladi).
- Ruxsat siyosati: `security-policy.ts`, `read-only-guard.ts`, `mutation-scan.ts` + `mutation-sinks.generated.ts`, `required-arguments.ts`.
- Kirish validatsiyasi: `github-input-guard.ts` (owner/repo/path), `schema-narrowing.ts`.
- Kreditlar: `credentials.ts` (`getCredential` — env yoki `*_FILE`; qiymat hech qachon logga chiqmaydi).
- Kesh: `cache.ts`, `http-client.ts` (GET keshi, TTL).

## 4. Rejim: simple vs MAX

`src/core/mode.ts` + `src/core/bounded-env.ts`.

- **simple** (standart) — batch o'lchami va konkurentlik pastroq.
- **MAX** (`PRO_FETCH_MODE=max`) — bir batch'dagi chaqiruvlar va konkurentlik chegaralari ko'tariladi (lekin `bounded-env.ts` clamp'larida). Har bir host uchun `MAX_PER_HOST_CONCURRENCY` alohida cheklanadi — DoS'ga aylanmasligi uchun.
- Per-batch `mode:"max"` faqat **o'sha batch** shiftini ko'taradi; start-up'da qurilgan semaforlarni o'zgartirmaydi.
- Self-serve ceiling'dan oshsa: "refuse and say so" — `confirm_large_batch:true` so'raladi.

## 5. Kompozitlar (Smart System yuragi)

`src/core/composite.ts` (`runParallel`, `runStep`, `renderPipeline`) ustiga qurilgan:

- **Fetch-once / raw source** — `source-from.ts`, `source-resolver.ts`, `text-source.ts`, `binary-source.ts`: bitta haqiqiy yuklash, xom tana (markdown emas), konvertorlar uchun bayt.
- **Gates** — `composite-gates.ts`: shartga mos qadam qo'shiladi, mos bo'lmasa **jim emas**, `gated=N` bilan yoziladi.
- **Budget** — `composite-budget.ts`: `detail: summary|full`; bo'sh qadamlarni yashiradi, 120K belgi chegarasi (o'lchangan 91% tejash).
- **Dedup** — `runParallel` `tool+args` bo'yicha single-flight (bir xil so'rov → 1 dispatch, label saqlanadi).
- Yuqori kompozitlar: `research-tools.ts` (`pro_research_deep`), `github/repo_audit.ts` (`pro_repo_audit`), `github/pr_review_tool.ts` (`pro_pr_review`), `browser-tools.ts`, `media-tools.ts`, `crawl-tools.ts`, `extract-tools.ts`, `integration-tools.ts`, `max-platform-tools.ts` (codehost/devops/database/security/knowledge/collaboration/storage/productivity).

## 6. Semantik discovery

`src/core/intent-search.ts` — BM25 + morfologik kengaytirish + sinon jadvali; `search-ranking.ts`, `argument-inference.ts` (`pro_capability_map` tabiiy til → aniq tool + schema).

## 7. Meta-tool'lar (`src/tools/admin/`)

`capability_call.ts` (batch ijro) · `capability_map.ts` · `pro_synthesize.ts` · `tool_execute.ts` · `tool_list_details.ts` · `tool_schema.ts` · `tool_search.ts` · `category_stats.ts` · `registry_summary.ts` · `config_get/set.ts` · `env_check.ts` · `diagnostics.ts` · `profile_switch.ts` · `health_check.ts` · `memory_stats.ts` · `rate_limit_status.ts` · `proxy_status.ts` · `token_count.ts` · `result_preview.ts` · `cache_tune.ts` · `batch_schedule.ts` · `log_tail.ts` · `usage_stats.ts`.

## 8. Bardoshlilik ("degrades, never dies")

Native bog'liqliklar (`sharp`, `@napi-rs/canvas`, `tesseract.js`, Playwright, git/docker/kubectl/psql) lazy yuklanadi; yo'qligida aniq `COMMAND_NOT_FOUND` / `SQLITE_UNAVAILABLE`. Hech biri bo'lmagan host'da ham server 500+ tool bilan turadi. `import().then()` zanjirlari `.catch()` bilan; `uncaughtException`/`unhandledRejection` handlerlari serverni o'ldirmaydi.

## 9. Kategoriya tuzilishi

`src/tools/<category>/` — yupqa `defineTool` wrapperlari; og'ir/logikani `src/core/*.ts` yoki `src/tools/max-platform-tools.ts` (MARKA: 8 MAX-pack) ko'taradi. Umumiy qoida: wrapper → dispatch → shared handler.

## 10. Test va tekshiruv (`npm run check`)

`verify:static` (struktur invariantlar) · `verify:registry` (652/40, profil sonlari, duplicate/short-description/schema) · `build` · `test` (738) · `verify:package` (shebang, `files`, 0 secret) · `format:check`. Qo'shimcha: `npm run dump:catalog` → `docs/TOOL_CATALOG.md`, `npm run measure:coverage`, `npm run audit:schema`.
