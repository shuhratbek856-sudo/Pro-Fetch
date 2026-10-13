# Kuchaytirish strategiyasi

Bu hujjat Smart System'ni qanday kuchaytirish kerakligini **o'lchovlar bilan** belgilaydi. Har bir
qator raqam — o'lchilgan natija, taxmin emas. O'lchash skripti:
`npm run measure:coverage`.

## 1. Hozirgi holat (o'lchilgan)

| Metrika | Qiymat | Qayerdan |
|---|---|---|
| Ro'yxatga olingan tool | **571** | `verify:registry` |
| `smart` profilidagi tool | **10** | `listTools('smart').length` |
| Erishilgan tool | **571/571 — 0 ta yopiq** | `capability_call` + `tool_execute` |
| Kompozit ichida statik murojaat | 373/571 | `measure:coverage` |
| Dinamik executor kompozitlari | 3 | `pro_capability_call`, `pro_workspace_ops`, `pro_service_ops` |
| `pro_repo_audit` ichki tool | 23 | `repo_audit.ts` |
| `pro_audit_page` ichki tool | 16 (10 tasi shartli) | `tests/content-reuse.test.ts` |
| **`pro_audit_page` tarmoq so'rovi** | **1** (16 qadam, avval 11) | jonli sahifada o'lchangan |
| **`pro_fetch_ingest` tarmoq so'rovi** | **1** (15 qadam) | jonli sahifada o'lchangan |
| `pro_research_deep` ichki tool | 12 | `research_deep.ts` |
| Natija (summary) | 43 KB → 3.8 KB, **91%** kamayish | `composite-budget.ts` |
| Dedup | 6 bir xil qadam → **1** dispatch | `runParallel` |
| Zararli kiritish sinovi | 10,278 chaqiruv — **0 crash** | fuzz |
| Dekoder sinovi | 175 juftlik — **0 yomon natija** | fuzz |
| Jarayon-killer sinovi | **0** (avval 4 ta topildi) | `tests/resilience.test.ts` |
| Tests | 239 | `npx vitest run` |
| Registry / static / package / format | PASS | `npm run check` |
| Toza install (`--ignore-scripts` bilan ham) | ✅ 571 tool | `prodtest4` |

## 2. Nima tuzatildi va nima uchun

### 2.1 Tarmoq resursi (fetch-once)

**Muammo:** `pro_audit_page` bir sahifani **11 marta** yuklardi. Har bir extractor `url` olib,
o'zi `fetchWithOptions` chaqirardi. Sekin, bandlik, va **boshqaning serveriga 11 marta yuklanish**.

**Yechim:** `src/core/source-from.ts` — inline `text` har doim ustun. `audit_page` endi bitta
yuklashadi va 16 ta stepga kontentni beradi. `fetch_ingest` matn asosidagi tool'lar uchun shuni
qiladi; **PDF/CSV kabi format konvertorlari URL'da qoladi**, chunki ular original bayt kerak.

**Dalil:** `tests/content-reuse.test.ts` — `audit_page` da 16/16 step kontent oladi, faqat broken-link
check tarmoqqa chiqadi (u linklar yechilganini tekshiradi).

### 2.1a Render qilingan tana — **false negative ning ildizi**

Bu — tuzatilgan eng jiddiy xato va alohida yoziladi, chunki u sezilmaydi: hech natija **yo'q**
degan emas, **noto'g'ri** degan.

**Muammo:** fetch-once ni joriy etganda kompozitlar kontentni `pro_fetch_fetch_url` (markdown
qaytaradi) yoki `pro_fetch_html_to_text` (taglarni olib tashlaydi) dan olgan edi. Ikkalasi ham
**xom markup emas**. Natijada extractor'lar quyidagilarni ko'rmagan:

| Qidiriladigan belgi | Qaysi render uni olib tashlaydi |
|---|---|
| `<script type="application/ld+json">` | markdown renderer, `<script>` ni olib tashlaydi |
| `<img src alt>` | markdown renderer, `<img>` ni render qiladi |
| `itemscope` / `itemtype` | `<script>`/`<meta>` bilan birga |
| `<link hreflang>` | `<head>` ni render qiladi |

Bu **juda jiddiy**: sahifada to'liq JSON-LD bor, lekin audit "topilmadi" deydi. Model uchun bu
"yo'q" bilan "biz qaramadik" ni farqlay olmaydi — **noto'g'ri javob**.

**Yechim:** `fetchSource()` — kompozit darajasida bitta haqiqiy fetch, `fetchWithOptions` orqali,
to'liq javob tanasini qaytaradi. Uch kompozit ham shuni ishlatadi: `audit_page`, `fetch_ingest`,
`page_diff`.

**Dalil (haqiqiy tarmoq, SSRF o'chirilmaydi):**

| Sahifa | Eski kod | Yangi kod |
|---|---|---|
| `news.ycombinator.com` | 7 ta qadam "topilmadi" (noto'g'ri) | 7 ta gate haqiqiy sabab bilan |
| `en.wikipedia.org/wiki/Web_crawler` | — | **15/16** qadam ishladi, 26 KB tranzript |

**Qaytarilmasligi uchun:** `verify:static` uchta faylda `fetchSource` borligini tekshiradi va
`fetchSource` ichida `fetchUrl` ishlatilishini taqiqlaydi. Testlar ham buni tekshiradi. Qo'lda
bug'ni qaytarib ko'rgandim — `STATIC_VERIFICATION_FAIL` berdi.

### 2.2 Shartli qadamlar (gates)

**Muammo:** Oddiy blog post uchun schema.org, hreflang, narx, rasm alt — 10 ta chaqiruv hech narsa
topmaydi, faqat tranzriptni to'ldiradi.

**Yechim:** `src/core/composite-gates.ts`. Har bir qadam o'ziga kerakli belgini e'lon qiladi
(`application/ld+json`, `hreflang=`, `<img`, narx belgisi). Shart bajarilmasa qadam **o'tkaziladi**,
va sabab yoziladi.

**Muhim:** gate hech qachon **jim** o'tkazmaydi — footer'da `gated=N` ko'rinadi. Aks holda model
"sahifada yo'q" deb o'ylab, biz "qaramadik" deb yashirgan bo'lardik.

**Dalil:** oddiy HTML'da 10 ta gated, boy HTML'da 0 ta.

### 2.3 Takroriy ishning yo'q qilinishi (dedup)

**Muammo:** Kompozit tabiiy ravishda bir savolni bir necha marta beradi. 6 ta bir xil qadam = 6 ta
haqiqiy chaqiruv.

**Yechim:** `runParallel` endi `tool + argumentlar` kaliti bo'yicha **deduplikatsiya** qiladi va
**single-flight** yaratadi (bir kalitga faqat bitta chaqiruv, qolganlari uni kutadi).

**Dalil:** o'lchilgan — 6 ta bir xil qadam → **1 ta haqiqiy dispatch**, 6 ta natija qaytarildi.
Argument farq qilsa biriktirilmaydi (3 qadam, 2 argument → 2 dispatch).

**Tuzatilgan noquvlik:** biriktirilgan qadam birinchi qadamning **labelini** olib, ikkinchisi
yo'qolgan ko'rinardi. Endi har bir qadam o'z labelini saqlaydi — bir xil so'roqning natijasi
boshqa qadamning nomi ostida chiqmasligi kafolatlanadi. `pro_workspace_ops` shuning uchun
`operation_id` qo'shdi: bir xil tool bilan turli id'li chaqiruvlar tranzriptda farqlanadi.

### 2.4 Parallelizm

`runParallel` fan-out 8 bilan ishlaydi. Konkurrentlik chegaralari **o'zgarmagan** — ular
execution engine'da. Composite faqat o'z navbatida nechta promise ushlashini cheklaydi.

**Tuzatilgan bug:** natijalarni slot indeksi bilan qayta qurishda `capability_call` 4 ta entry'dan
2 tasini yo'qotardi (invalid entry slot egallaydi, lekin outcome bermaydi). Cursor bilan almashtirildi.

## 3. Qolgan kamchiliklar — va ular uchun strategiya

Bu **yashirilmagan**. Har biri uchun aniq yo'l belgilangan.

### 3.1 Kompozit qamrovi — **yopildi**

`npm run measure:coverage` o'lchagan: **8 kategoriya nolga teng edi** — collaboration (28), codehost
(24), devops (24), database (24), security (24), git (22), knowledge (18), productivity (18). Bu
**182 tool** edi, ularga faqat nom bilan murojaat qilish kerak edi.

Ikki kompozit qo'shildi:

| Kompozit | Kategoriyalar | Nima uchun bir xil shaklda |
|---|---|---|
| `pro_workspace_ops` | git, devops, database, security | mahalliy workspace — allaqachon `safeLocalPath` bilan cheklangan |
| `pro_service_ops` | codehost, collaboration, storage, productivity | hosting provayder — credential + amal |

Ikkalasi ham **yupqa**: hech narsani qayta ko'rib chiqmaydi, har bir amal `dispatch` orqali
boradigan tool'ga boradi. Shuning uchun allowlist, read-only rejim, read-only SQL gate va
workspace sandbox **har bir ichki chaqiruvga** ham qo'llanadi.

**Dalil:** `tests/smart-system-quality.test.ts` — 8 ta test, jumladan allowlist'ni buzishga
urinish. Natija: 571/571 erishiladi, 10 ta slot saqlanadi.

**Qolgan chegara:** 7 kategoriya (devops, database, security, knowledge, collaboration, storage,
productivity) faqat **dinamik** executor orqali qamlanadi — model ichida tool nomini yozish
turlidir. Bu `capability_call` bilan bir xil qobiliyat, ammo bir qadam qo'shni.

**Keyingi qadam (o'lchov bilan):** kompozit ichida **nomni aniqlash** — `capability_map` ning
javobini to'g'ridan-to'g'ri `pro_workspace_ops`ga tayyor payload sifatida qaytarish. Model qo'lda
nom yozmaydi, server taklif qiladi.

### 3.2 Binary kontentni qayta ishlatish

**Muammo:** PDF/Office/CSV konvertorlari `text` emas, **original bayt** kerak. Hozir ular URL'dan
qayta yuklaydi. `pro_fetch_ingest` da shu sababli 4 ta qadam tarmoqqa chiqadi.

**Strategiya:** `binary-source.ts` kabi **bir martalik byte buffer** yaratiladi va konvertorlarga
`base64` yoki `path` orqali beriladi. Bu alohida mexanizm — matn bilan emas.

**Nima qilinmaydi:** Konvertorlarga `text` berish — bu PDF'ni buzadi.

### 3.3 Native OCR parallelligi

**Muammo:** `tesseract.js` va `@napi-rs/canvas` — og'ir, sekin, va ular **lazy** yuklanadi. Agar
bir kompozitda bir necha rasm OCR qilsa, ular ketma-ket bo'ladi.

**Strategiya:** Worker pool (birinchi `tesseract.js` allaqachon `createWorker` API'sini taklif qiladi).
Bu **alohida ish** — native bog'liqlik, test muhitida sinab ko'rish kerak.

### 3.4 Kross-chaqiruv keshi

**Muammo:** Deduplikatsiya faqat **bir chaqiruv ichida**. Ikki alohida chaqiruv bir xil URL'ni
yana yuklaydi. Buning uchun tegishli GET keshi bor, lekin faqat `http-client` darajasida —
kompozit darajasida emas.

**Strategiya:** Kompozit natijalari uchun **ixtiyoriy** kesh (`PRO_FETCH_COMPOSITE_CACHE`),
kalit = `tool + argumentlar`. Faqat o'qish mumkin bo'lgan tool'lar uchun (readOnlyHint), yozish
uchun **hech qachon**.

### 3.5 Adaptive kompozit (nazoratdan tashqari qadamlar)

**Muammo:** `audit_page` har doim 16 ta qadamni rejalashtiradi (gated bo'lishiga qaramasdan).

**Strategiya:** Kompozit **ikki rejimli** bo'ladi: `mode: "thorough"` (hammasi, hozirgi) va
`mode: "fast"` (faqat metadata + matn + asosiy ekstraksiyalar). Bu maxfiylik emas, **taxlarning
o'zgartirilishi** — foydalanuvchi "tez ko'rib chiq" desa.

## 4. Qoidalar (chegara — bu buzilmaydi)

| Qoida | Nima uchun |
|---|---|
| Har bir ichki chaqiruv `dispatch()` orqali | SSRF, allowlist, read-only, timeout — o'zgarmaydi |
| Gate hech qachon jim o'tkazmaydi | "Qaramadik" bilan "yo'q" farq qilinishi kerak |
| Dedup faqat **aniq** bir xil chaqiruvlarni birlashtiradi | Yaqin emas, **bir xil** bo'lishi kerak |
| Konvertorlarga matn emas, bayt | PDF/CSV buzilmasligi kerak |
| Profil — ko'rinish, nazorat emas | `smart` meta-executor'ga bog'liq |
| Har bir o'zgarish `verify:static` bilan himoyalangan | Drift jim qolmasin |

## 5. Navbatdagi ish tartibi (o'lchov asosida)

| # | Ish | O'lchov | Holat |
|---|---|---|---|
| 1 | Kompozit qamrovi | `npm run measure:coverage` | ✅ 182 tool yopildi |
| 2 | Fetch-once | 11 so'rov → 1 | ✅ |
| 3 | **Xom manba** (render emas) | Wikipedia: 15/16 qadam | ✅ |
| 4 | Shartli qadamlar | oddiy sahifada 6/16 | ✅ |
| 5 | Dedup + label saqlanishi | 6 qadam → 1 dispatch, 6 label | ✅ |
| 6 | **Binary reuse** — parallel yuklashlar birlashtirildi | `ingest` 15 qadam → **1 so'rov** | ✅ |
| 7 | **Jarayon xavfsizligi** | 4 ta killer topildi → 0 | ✅ |
| 8 | **Platforma muvofiqligi** | Windows npm, SQLite binary'siz | ✅ |
| 9 | **Aniq xatolar** | `COMMAND_NOT_FOUND`, `SQLITE_UNAVAILABLE` | ✅ |
| 10 | **Konsistent kiritish** | `repo` ikkala shaklda qabul qilinadi | ✅ |
| 11 | **Tayyor payload** — `capability_map` → `*_ops` ga tayyor ro'yxat | qo'lda yoziladigan nom 0 | ✅ |
| 12 | **OCR parallel** | 4 ta parallel → **3.9× tezlik** | ✅ allaqach ishlaydi |

Har bir qadam alohida commit, o'lchov bilan, va `npm run check` yashil holda.

### 6.1 "Kamchilik" bo'lib yozilgan, lekin o'lchovda yo'q bo'lib chiqqan narsa

Bu hujjat avval ikkita kamchikni ro'yxatga olgan edi. Ikkalasi ham tekshirilganda **roziq bo'lib chiqdi**,
va bu yozilishi kerak — aks holda hujjat tekshirilmagan niqobni qo'llab-quvvatlaydi.

| Kamchilik (avval yozilgan) | O'lchov | Xulosa |
|---|---|---|
| «OCR ketma-ket ishlaydi, worker pool kerak» | 1 ta OCR = 324 ms; 4 ta parallel = 333 ms → **3.9× tezlik** | **Ro'ziq emas.** Parallel allaqach ishlaydi. Haqiqiy test: canvas'ga «HELLO» yozildi, OCR uni 96% ishonch bilan topdi. |
| «`pro_fetch_ingest` da PDF/CSV konvertorlari qayta yuklaydi» | 15 qadam → **1 so'rov** (jonli sahifada o'lchangan) | **Yopildi.** `downloadToBuffer` parallel yuklashlarni birlashtiradi. |

Yozilgan kamchilik — o'lcangan natija emas, taxmin bo'lgan. Endi har bir qator o'lchovdan kelib chiqadi.

### 6.2 Nima haqiqatan ochiq qoladi

| Kamchilik | Nima uchun |
|---|---|
| 234 ta credential talab qiladigan tool **real kalitsiz** tekshirilmadi | Hisoblarda token yo'q. Kod yo'li tekshirildi (GitLab ochiq repo, GitHub ochiq API ishladi), kalit bilan esa yo'q. |
| `npm publish` bajarilmagan | `npm whoami` → auth talab qiladi. Bu sizning hisobingiz. |
| Linux / macOS / Alpine faqat CI konfiguratsiyasida | Bu muhitda Windows. CI matritsasi mavjud, lekin men qochirmadim. |
| Kross-chaqiruv kesh (jamiq) | Kesh noto'g'ri bo'lsa model eskirgan ma'lumotga ishonadi. Parallel yuklashlar birlashtirilgani hozirgi ehtiyojni yopadi. |

## 6. Nima **qilinmaydi** (onatli)

| Qaror | Sabab |
|---|---|
| Har bir tool uchun kompozit yozish | 569 yozuv = texnik debt, foyda yo'q |
| LLM-ga tool tanlashni topshirish | Qo'shimcha tarmoq so'rovi, flaky, hujjatlashtirish mumkin emas |
| Embedding asosidagi discovery | Har doim ishlashi uchun credential kerak, lokal fallback yo'q |
| `detail` ni standart `full` qilish | Kontekstni to'ldiradi — summary to'g'ri standart |
| Barcha qadamlarni parallel qilish | Bog'liqlik bo'lsa, natija noto'g'ri bo'ladi |