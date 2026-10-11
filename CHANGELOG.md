# Changelog

Barcha muhim o'zgarishlar shu faylda. Format: [Keep a Changelog](https://keepachangelog.com/),
versiya semver bo'yicha.

## [Unreleased]

### Added

- `PRO_FETCH_ENFORCE_PROFILE` — profilni qat'iy allowlistga aylantiradi. `smart` profil bilan
  birga ishlatilganda aniq konfiguratsiya xatosi beriladi, chunki `smart` meta-executor orqali
  o'z ko'rinmaydigan tool'larni chaqirishga bog'liq.
- `src/core/input.ts` — typed input accessors (`str`, `num`, `bool`, `arr`, `obj`, `pathStr`,
  `pathNum`, `asRecordArray`). `const p = input as any` o'rniga ishlatiladi.
- `src/core/tool-classification.ts` — mutation tasnifining yagona manbai.
- `src/core/profile.ts` — profil qoidalari, import siklisiz modulga ko'chirildi.
- `src/core/version.ts` — versiya `package.json` dan o'qiladi; User-Agent va `serverInfo` endi
  bir manbadan keladi.
- `npm run verify:package` — tarball uchun shebang, `files` allowlist va credential tekshiruvi.
- `npm run format` / `npm run format:check` — Prettier (`.prettierrc.json`).
- `vitest.config.ts` — v8 coverage va minimal chegaralar.
- `.github/workflows/ci.yml` — Node 22.13/24, Ubuntu/Windows matritasi.
- `qwen-mcp.example.json` — mashinasiz, nisbiy konfiguratsiya namunasi.
- `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`.

### Changed

- `any` ishlatilishi 254 → 54 (79% kamaydi). GitHub va extract handler'lari `JsonRow` va
  cheerio `AnyNode` bilan typed bo'ldi; migratsiya paytida 10 ta haqiqiy tip xatosi topildi va
  tuzatildi (`max_pages` raqam emas, `soapaction` string emas, chuqur API field'lari).
- `src/core/max-platform-tools.ts` formatlandi: eng uzun qator 4916 → 310 belgi, 320 → 3294 qator.
- `src/core/research-tools.ts`, `tool.ts`, `config_get.ts`, `health_check.ts`, `repo_info.ts`
  formatlandi.
- `package.json` ga `files` allowlist qo'shildi: tarball 1.9 MB → 868 KB, `.d.ts` 413 → 0.
- `.env.example` ga `PRO_FETCH_BROWSER_CHANNEL`, `PRO_FETCH_BROWSER_TZ` va `<NAME>_FILE` hujjati
  qo'shildi.
- `verify:registry` endi barcha 4 profil o'lchamini ham tekshiradi.
- `.gitignore` kengaytirildi: `.secrets/`, `*.pem`, `*.key`, `qwen-mcp.json` va boshqalar.

### Fixed

- **Paket POSIX'da ishga tushmasdi.** `dist/server.js` da shebang yo'q edi; `npx pro-fetch-mcp`
  Linux/macOS'da crash bo'lardi. Endi `#!/usr/bin/env node` qo'shildi va `verify:package` buni
  tekshiradi.
- **User-Agent versiyasi eskirgan edi** (`pro-fetch-mcp/0.2` paket 0.3.0 bo'lganda).
- **Annotatsiya va read-only siyosati mos kelmasdi.** 44 tool yozuvchi deb belgilangan, lekin
  `PRO_FETCH_READ_ONLY` uni bloklamagan; aksincha `cache_tune` va `knowledge_rebuild` read-only
  deb ko'rsatilgan, garchi ular holatni o'zgartiradi — `readOnlyHint` ga ishonadigan klient
  ularni avtomatik tasdiqlagan bo'lardi. Ikkala yo'nalish ham 0 ga tushirildi.
- **Import sikli.** `security-policy` → `loader` → tool index → `core/tool` → `execution-engine` →
  `security-policy`. ESM siklning bir qismini `undefined` ga baholaydi; `boundedEnv is not a
  function` va `defineTool is not a function` xatolari shundan edi. `boundedEnv` va profil qoidalari
  alohida leaf modullarga ko'chirildi.
- **`<NAME>_FILE` nisbiy yo'llari ishlamasdi** — server har qanday papkadan ishga tushishi
  mumkin. Endi `package.json` ga nisbatan resolve qilinadi.
- **`.env.example` chetlashuvi** — 3 ta ishlaydigan kalit hujjatlantirilmagan edi.
- **CLI konfiguratsiyasi sizib chiqayotdi** — `qwen-mcp.json` da mashina-specifik yo'l va to'liq
  Windows PATH (shaxsiy kataloqlar) bor edi.

### Security

- `.env` dagi inline secretlar endi `verify:static` da tekshirilmaydi (u ataylab API kalitlari
  bilan ishlaydi), lekin `.gitignore`, `files` allowlist va `verify:package` uch qatlamali
  himoya qo'llandi.
- `verify:static` secret patternlari kengaytirildi: Atlassian (`ATATT3`), GitLab (`glpat-`),
  Serper/SerpAPI shakllari qo'shildi.
- Qo'shimcha: qo'lda kiritilgan `qwen-mcp.json` endi absolute yo'l yoki host PATH saqlamasligi
  tekshiriladi.

### Known limitations

- `any` ning qolgan 54 ta ishlatilishi tool ichki mantigida (JSON boshqaruvi, cheerio
  selektorlari, `docs` parser'lari) — ular `unknown` ga o'tkazilishi mumkin, lekin alohida
  ishlov talab qiladi.
- `npm audit` da dev-dependency zaxiralari (`vitest<=4.1.10`, `esbuild<=0.24.2`, `tinypool`)
  moderate darajada; faqat test muhitiga taalluqli, `vitest@5` ga o'tish breaking change.
- MAX packlarning live provider integratsiyalari credential va o'rnatilgan CLI talab qiladi.