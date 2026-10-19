# MexaPlan + SmartToDo + MaxEffort
## Universal AI Agent Intelligence Workflow — to‘liq konsepsiya va texnik spetsifikatsiya

**Hujjat maqsadi:** Pro-Fetch kabi MCP server orqali turli AI agentlarga ulanishi mumkin bo‘lgan, murakkab topshiriqlarni chuqur rejalashtiradigan, rejasidagi kamchiliklarni mustaqil tekshiradigan va foydalanuvchi kutgan sifat darajasigacha bajarishga intiladigan universal ish mexanizmini belgilash.

**Asosiy qismlar:**
- **MexaPlan** — strategik, chuqur rejalashtirish.
- **SmartToDo** — rejani mustaqil audit qilish va uni tekshiriladigan vazifalar grafigiga aylantirish.
- **MaxEffort** — maksimal asosli izlanish, tashabbuskorlik, bajarish, xatolarni tuzatish va natijani verifikatsiya qilish.
- **PlanGate** — AI bo‘lmagan, kod bilan bajariladigan majburiy shartlar tekshiruvi.
- **Orchestrator** — uch rolning ketma-ketligi, holati, qayta rejalash va dalillarini boshqaruvchi runtime mexanizmi.

> **Muhim texnik haqiqat:** MexaPlan, SmartToDo va MaxEffort o‘zlari alohida AI modeli emas. Ular tashqi AI agentining mavjud modelini muayyan vazifalarga yo‘naltiradigan rollar, ko‘rsatmalar, task protokollari va runtime boshqaruv mexanizmlaridir. Qo‘shimcha model API kaliti shart emas, agar tashqi agent o‘z modelini allaqachon taqdim qilsa va integratsiya shu modeldan foydalanadigan qilib qurilsa. Lekin oddiy MCP serverning o‘zi tashqi agentga har bir topshiriqda bu bosqichlarni majburan bajartira olmaydi: buning uchun agentga mos ko‘rsatmalar/skill va imkoniyatga qarab host/runtime adapteri zarur.

---

## Mundarija

1. Mahsulot g‘oyasi
2. Tizimning asosiy tamoyillari
3. Uchta asosiy rolning aniq ta’rifi
4. MexaPlan: to‘liq ishlash mexanizmi
5. SmartToDo: mustaqil tekshirish mexanizmi
6. MaxEffort: ♾️ Infinity sifat rejimi
7. Uch rolning o‘zaro ishlashi
8. Umumiy topshiriq oqimi
9. Smart Task Graph ma’lumot modeli
10. Deep research va tool tanlash
11. Doirani kengaytirish va yangi muammolarni boshqarish
12. Verifikatsiya va dalillar
13. Cheksiz urinish emas: samaradorlik va to‘xtash mezonlari
14. Xavfsizlik va foydalanuvchi nazorati
15. Universal MCP va agent integratsiyasi
16. Xato holatlari va recovery
17. Holat mashinasi
18. Tavsiya etiladigan modul tuzilmasi
19. Bosqichma-bosqich amalga oshirish rejasi
20. Qabul mezonlari va benchmarklar
21. Qisqa yakuniy ta’rif

---

# 1. Mahsulot g‘oyasi

MexaPlan + SmartToDo + MaxEffort’ning maqsadi AI agent faqat birinchi ko‘ringan yechimni tanlab, bir necha tool chaqirib, ishni erta tugatib qo‘yishini kamaytirishdir.

Foydalanuvchi katta topshiriq berganda tizim:

1. Maqsad va barcha talablarni tushunadi.
2. Ishni bajarishdan oldin chuqur reja tuzadi.
3. Rejani alohida, tanqidiy nazardan tekshiradi.
4. Yetishmayotgan zarur vazifalarni qo‘shadi va keraksiz takrorlarni chiqaradi.
5. Rejani bog‘liqliklari va qabul mezonlari mavjud Smart Task Graph shakliga keltiradi.
6. Vazifalarni foydalanuvchi talab qilgan sifat darajasiga yetkazishga harakat qiladi.
7. Faqat dastlabki so‘rovda aytilgan qism bilan cheklanib qolmay, maqsadga ta’sir qiladigan tegishli muammolarni ham aniqlaydi.
8. Yangi muammo topilsa, uni task graph’ga qaytaradi va zarur bo‘lsa rejani yangilaydi.
9. Natijani dalil bilan tekshiradi; tekshirilmagan ishni muvaffaqiyatli deb ko‘rsatmaydi.
10. Foydasiz takrorlanish, ma’nosiz qidiruv yoki natijasiz urinishni “maksimal harakat” deb hisoblamaydi.

Bu oddiy todo-list generator ham, faqat prompt ham, o‘zicha mustaqil model ham emas. Bu — tashqi AI’ning fikrlashini vazifalar, rollar, holat va verifikatsiya orqali tashkil qiladigan workflow arxitekturasi.

## 1.1. Misol

Foydalanuvchi shunday deydi:

> Pro-Fetch repository’ni chuqur audit qil, barcha muhim muammolarini top, tuzat, testlarni ishlat va sifatini oshir.

Oddiy agent ayrim fayllarni ko‘rib, 4–5 ta tool chaqiruvdan keyin xulosa berishi mumkin. Bu uchlik ishlatilganda:

- MexaPlan butun audit uchun kerakli yo‘nalishlarni rejalaydi.
- SmartToDo rejada qoldirib ketilgan xavfsizlik, test, integratsiya, paketlash yoki recovery vazifalarini aniqlaydi.
- MaxEffort asosiy audit bilan cheklanmay, muammoga bog‘liq modullarni kuzatib boradi, yangi muammolarni topadi, kerakli tekshiruvlarni bajaradi va tuzatishlarni dalil bilan tasdiqlashga intiladi.

Masalan, foydalanuvchi “faqat GitHub integratsiyasini tekshir” desa, MaxEffort GitHub handler’ларidan tashqari unga ta’sir qiladigan umumiy HTTP klient, token saqlash va uzatish yo‘llari, konfiguratsiya, testlar, retry, pagination, permission va CI’ni ham tekshirishi mumkin. Lekin u **butunlay aloqasiz modullarni avtomatik qayta yozmaydi**. Tekshiruv doirasi kengayishi mumkin; o‘zgarish doirasi esa maqsadga aloqadorlik, xavf va ruxsat bilan chegaralanadi.

---

# 2. Tizimning asosiy tamoyillari

## 2.1. Host AI’dan foydalanish

Tizim tashqi AI agent allaqachon taqdim etgan modeldan foydalanadi. Pro-Fetch ichida Anthropic, OpenAI yoki Qwen uchun ikkinchi API kalitini majburan talab qilmaydi.

- Tashqi agent model bilan o‘zi ishlaydi.
- MexaPlan, SmartToDo va MaxEffort shu agentga tegishli vazifalar/rollar sifatida ishlaydi.
- Pro-Fetch MCP tool’lar, task holati, resurslar va dalillarni taqdim etadi.
- Agentdagi mavjud obuna, API foydalanish siyosati, token, kontekst va rate limitlar o‘z kuchida qoladi.

**Chegara:** MCP protokoli tool’larni taqdim qiladi, lekin har bir user prompt kelganda MexaPlan → SmartToDo → MaxEffort majburiy bajarilishini o‘z-o‘zidan kafolatlamaydi. Buni ishonchli qilish uchun:

1. agentga mos global/project ko‘rsatmalari yoki skill;
2. mavjud bo‘lsa subagent/session mexanizmi;
3. agent runtime’iga mos adapter yoki majburiy workflow integratsiyasi;
4. Pro-Fetch tarafida state, task va natija tekshiruvlari

birgalikda ishlatiladi. Qaysi agent bunday majburiy orchestration’ni qanchalik qo‘llashini uning real imkoniyatlari belgilaydi.

## 2.2. Model fikrlaydi, kod boshqaradi

- LLM: talqin, reja, muqobil fikrlar, kontekstli tahlil, research savollari, e’tirozlar va yangi yechimlarni ishlab chiqaradi.
- Runtime kod: rol tartibi, task holati, ruxsatlar, state saqlash, deadline, retry qoidalari, audit log va verifikatsiya shartlarini bajaradi.
- Tool’lar: fayl, API, repository, terminal yoki boshqa real amallarni bajaradi.

Prompt yozishning o‘zi yetarli emas. Muhim qoida runtime’da ham tekshirilishi kerak.

## 2.3. Mustaqil tekshiruv

MexaPlan o‘z rejasini o‘zi tasdiqlab qo‘ymaydi. SmartToDo imkon qadar MexaPlan rejasini ko‘rishdan oldin original topshiriqdan mustaqil talablar xaritasini tayyorlaydi.

- Plan A: MexaPlan ishlab chiqqan dastlabki reja.
- Checklist B: SmartToDo mustaqil topgan talablar, xavflar va zarur ishlar.
- Diff C: ikkisi orasidagi farqlar.
- Revised Plan: asosli e’tirozlar qo‘shilgan reja.

Boshqa model mavjud bo‘lsa, mustaqil auditor uchun undan foydalanish mumkin. Lekin ikki xil model ham xato qilishi mumkin; shuning uchun dalil va kod orqali tekshiriladigan qoidalar zarur.

## 2.4. Evidence over claims

“Bajarildi”, “topildi”, “testdan o‘tdi” degan matn dalilning o‘rnini bosa olmaydi.

Har bir muhim task imkon qadar quyidagilarni saqlaydi:

- qaysi amal bajarildi;
- qaysi fayl yoki tizim o‘zgardi;
- qaysi test/komanda ishladi;
- chiqish kodi va natija;
- tegishli log yoki natija qisqacha xulosasi;
- tekshirilmagan jihatlar;
- qoldiq xavf.

## 2.5. Maksimal sifat, behuda cheksizlik emas

MaxEffort sun’iy past tool-call limitlari yoki token tejash maqsadida zarur ishlarni tashlab ketmasligi kerak. Shu bilan birga, bir xil qidiruv, bir xil xato yoki yangi dalil bermayotgan sikl cheksiz takrorlanmasligi kerak.

---

# 3. Uchta asosiy rolning aniq ta’rifi

## 3.1. MexaPlan — Strategic Deep Planner

**Vazifasi:** foydalanuvchining maqsadini chuqur tahlil qilish va maqsadga erishish uchun zarur ishlarning to‘liq, mantiqiy va risklarni hisobga olgan rejasini yaratish.

MexaPlan:

- original talablarni strukturaga soladi;
- aniq aytilgan va bilvosita zarur talablarni ajratadi;
- mavjud loyiha/kontekstni o‘rganish rejasi tuzadi;
- kerakli manba, hujjat, kod, API va testlarni aniqlaydi;
- muqobil yondashuvlarni solishtirish vazifalarini rejalaydi;
- arxitektura, dependency, xavf va integratsiyalarni ko‘rib chiqadi;
- task’larni bajarish tartibi va parallel bajarilishi mumkin bo‘lgan ishlarni belgilaydi;
- har bir muhim vazifa uchun natija va qabul mezonini yozadi;
- xato yoki to‘siqlar bo‘lsa muqobil yo‘lni belgilaydi;
- reja bajarilgandan keyin qanday verifikatsiya qilinishini rejalaydi.

MexaPlan **bajarilgan deb ko‘rsatmaydi** va reja to‘g‘riligini yakka o‘zi kafolatlamaydi. Uning natijasi — tekshirilishi kerak bo‘lgan Plan A.

## 3.2. SmartToDo — Independent Plan Auditor & Task-Graph Builder

**Vazifasi:** MexaPlan rejasining zaif joylarini mustaqil topish, talablar qamrovini tekshirish va reja bajarilishi mumkin bo‘lgan aqlli task graph’ga aylantirish.

SmartToDo oddiy todo-list emas. U:

- original so‘rovdan o‘zining mustaqil requirements checklist’ini chiqaradi;
- loyiha kontekstidan kelib chiqib kerakli qo‘shimcha vazifalarni aniqlaydi;
- MexaPlan rejasi bilan mustaqil checklist’ni solishtiradi;
- qoplanmagan talablar va xavflarni topadi;
- kerakli bo‘lmagan, takrorlangan yoki maqsadga aloqasiz vazifalarni aniqlaydi;
- task’larni aniq, tekshiriladigan kichik qismlarga ajratadi;
- dependency graph yaratadi va sikllarni aniqlashni talab qiladi;
- acceptance criteria va verification usullarini belgilaydi;
- xavfli amallar, ruxsat va tasdiq talablarini tekshiradi;
- bajarish jarayonida yangi topilmalar kelganda graph’ni yangilaydi;
- bajarilgan ishlar task’ni haqiqatan yopishga yetarlimi, tekshiradi.

SmartToDo vazifalarni shunchaki ko‘paytirish uchun task qo‘shmaydi. Har bir qo‘shimcha talab, dalil yoki risk bilan asoslanishi kerak. U MexaPlan’ning barcha fikrlarini avtomatik qabul qilmaydi; o‘zining barcha e’tirozlarini ham avtomatik to‘g‘ri deb hisoblamaydi.

## 3.3. MaxEffort — Proactive Deep-Work & Quality Mode

**Vazifasi:** foydalanuvchi kutgan sifat darajasiga erishish uchun zarur bo‘lgan izlanish, tekshiruv, real bajarish, muammo topish, tuzatish va verifikatsiyani faol ravishda bajarish.

MaxEffort oddiy “task executor” emas. Uning nomiga mos ravishda u ishni yuzaki bajarish bilan qanoatlanmaydi.

U:

- SmartToDo task graph’dagi tayyor vazifalarni bajaradi;
- vazifa uchun kerakli tool’larni o‘zi tanlaydi yoki izlaydi;
- birinchi natijani final deb qabul qilishdan oldin natijaning yetarliligini baholaydi;
- topshiriqning asosiy yo‘nalishiga ta’sir qiladigan bog‘liq komponentlarni tekshiradi;
- dastlabki rejada yo‘q, lekin natijaga muhim ta’sir qiladigan yangi muammolarni topishga intiladi;
- topilmani dalil bilan qayd etadi va SmartToDo’ga yangi vazifa sifatida yuboradi;
- zarur joyda qo‘shimcha research, alternativ usul, runtime test, regression test yoki mustaqil review bajaradi;
- xato chiqsa, faqat xato matnini qaytarmay, sababini tekshiradi va tuzatishga harakat qiladi;
- xatoni tuzatgandan keyin tegishli testlarni qayta ishlatadi;
- har bir muhim natija uchun evidence saqlaydi;
- bajarilmagan, bloklangan yoki tekshirilmagan ishni yashirmaydi.

### MaxEffort va scope expansion

Agar user “GitHub integratsiyasini tekshir” desa, MaxEffort GitHub’ga ta’sir qiladigan umumiy HTTP client, auth, token handling, retry, rate limit, pagination, schema, test, CI va bog‘liq konfiguratsiyani tekshirishi mumkin.

Bu avtomatik ravishda butun repository’ni qayta yozish uchun ruxsat bermaydi. Ikki doira ajratiladi:

- **Investigation scope:** yangi dalil topish uchun maqsadga tegishli sohalarga kengayishi mumkin.
- **Modification scope:** kodni o‘zgartirish faqat foydalanuvchi maqsadiga asoslangan, zarur va ruxsat etilgan holatda bajariladi.

Agar aloqasiz, lekin qiziqarli muammo topilsa, uni alohida qayd qilishi mumkin; uni avtomatik ravishda vazifaning markaziga aylantirmaydi.

### MaxEffort va Infinity

“Infinity” cheksiz token, cheksiz vaqt yoki cheksiz API imkoniyati bor degani emas. Bu — vazifani sun’iy Eco rejimi sababli sayoz bajarishni rad etuvchi sifat siyosati.

- Oldindan belgilangan 4–5 ta tool-call limiti sabab ishni tugatib qo‘ymaslik.
- Zarur research yoki testni faqat token tejash uchun tashlab ketmaslik.
- Kerakli vazifalar bajarilmaguncha “hammasi tugadi” demaslik.
- Ammo foydasiz takrorlanish va natijasiz urinishlar aniqlansa, yo‘lni almashtirish.
- Model provider’ining haqiqiy context/rate/time limitiga duch kelsa, checkpoint saqlash va imkon bo‘lsa davom ettirish.
- Davom etib bo‘lmasa, qolgan vazifalar, sabab va noaniqliklarni ochiq ko‘rsatish.

MaxEffort’ning maqsadi “eng ko‘p ish qilindi” emas, balki “maqsad uchun zarur ishlar yetarli sifatda bajarildi va dalil bilan tekshirildi”.

---

# 4. MexaPlan: to‘liq ishlash mexanizmi

## 4.1. GoalSpec — foydalanuvchi maqsadining strukturasi

MexaPlan avval topshiriqni `GoalSpec` shakliga keltiradi:

- `goal`: asosiy yakuniy maqsad;
- `explicit_requirements`: foydalanuvchi bevosita aytgan talablar;
- `implicit_requirements`: maqsadga erishish uchun zarur bo‘lgan, lekin aytilmagan talablar;
- `constraints`: papka, til, texnologiya, budjet, vaqt yoki ruxsat cheklovlari;
- `deliverables`: topshirilishi kerak bo‘lgan mahsulotlar;
- `quality_target`: foydalanuvchi kutgan sifat darajasi;
- `risk_tolerance`: xavfli o‘zgarishlar va tasdiq talablari;
- `acceptance_criteria`: yakuniy natija qanday tekshiriladi;
- `unknowns`: hozircha noma’lum bo‘lgan muhim jihatlar.

Agar noaniqlik ishni xavfsiz yoki to‘g‘ri davom ettirishga to‘sqinlik qilmasa, MexaPlan eng oqilona taxminni qayd etib davom etishi mumkin. Agar muhim ruxsat, credential yoki qaytarib bo‘lmaydigan qaror yetishmasa, uni yashirincha taxmin qilmaydi.

## 4.2. Context discovery

MexaPlan mavjud muhitni o‘rganish uchun ish rejasini tuzadi:

- repository/folder tuzilmasi;
- muhim source va konfiguratsiya fayllari;
- mavjud testlar va build skriptlari;
- dependencies va versiyalar;
- mavjud task yoki issue’lar;
- tashqi API va hujjatlar;
- xavfsizlik/permission chegaralari;
- avval bajarilgan ish va mavjud dalillar.

U barcha fayllarni har safar ko‘r-ko‘rona yuklash o‘rniga, avval inventarizatsiya qiladi, keyin ta’sirga qarab chuqurroq tekshiradi. Lekin fayl sonini kamaytirish uchun muhim manbalarni ko‘rmaslikka yo‘l qo‘ymaydi.

## 4.3. Research plan

Har bir research vazifasida:

- javob topilishi kerak bo‘lgan aniq savol;
- ishlatiladigan manba turi;
- qidiruv strategiyasi;
- natija uchun talab qilinadigan dalil;
- manba ishonchliligini baholash;
- ma’lumot eskirgan yoki qarama-qarshi bo‘lsa qanday tekshirish;
- research tugallanganini belgilovchi mezon

bo‘ladi.

MexaPlan birinchi topilgan javobni mutlaq haqiqat deb qabul qilmasligi kerak. Muhim texnik qarorlar uchun rasmiy hujjat, source code, test yoki boshqa mustaqil dalilni solishtirish vazifasi qo‘shiladi.

## 4.4. Arxitektura va alternativalar

Murakkab topshiriqda MexaPlan kerak bo‘lsa bir nechta yondashuvni solishtiradi:

- qaysi yechim foydalanuvchi maqsadiga yaxshiroq mos;
- murakkablik va texnik xizmat narxi;
- xavfsizlik;
- backward compatibility;
- testlash imkoniyati;
- resurs/latency;
- mavjud kod bilan moslik;
- qayta tiklash va rollback yo‘li.

Har bir variantni cheksiz muhokama qilish shart emas. Qaror uchun yetarli dalil bo‘lsa, tanlov va uning asoslari reja ichida saqlanadi.

## 4.5. Plan A format

Plan A oddiy matn emas, mashina qayta ishlay oladigan strukturaga ega bo‘ladi. U quyidagilarni o‘z ichiga oladi:

- maqsad va scope;
- talablar xaritasi;
- task’lar;
- dependency graph;
- parallel bajarilishi mumkin bo‘lgan ishlar;
- risk register;
- test/verification strategy;
- kerakli tool/capability’lar;
- tasdiq talab qilinadigan amallar;
- fallback/recovery;
- yakuniy qabul mezonlari.

---

# 5. SmartToDo: mustaqil tekshirish mexanizmi

## 5.1. Blind-first review

SmartToDo imkon bo‘lsa MexaPlan Plan A’ni ko‘rishidan oldin:

1. original foydalanuvchi so‘rovini oladi;
2. mustaqil talablar xaritasini yaratadi;
3. zarur ishlar va yashirin xavflarni aniqlaydi;
4. kerakli tekshiruvlar ro‘yxatini tuzadi;
5. keyingina Plan A bilan solishtiradi.

Bu rejalashtiruvchining fikriga darhol ergashib qolish xavfini kamaytiradi. Agar host yangi subagent/context ochishni qo‘llamasa, SmartToDo ikkinchi bosqichda alohida instruktsiya bilan ishlashi mumkin; bu to‘liq mustaqil review darajasi pastroq ekanini state’da ko‘rsatish kerak.

## 5.2. Coverage audit

SmartToDo har bir talabga quyidagilarni bog‘laydi:

- kamida bitta task;
- kutilayotgan natija;
- qabul mezoni;
- verification usuli;
- dalil turi;
- agar bajarilmasa oqibati.

Qoplanmagan talab `unmapped` sifatida qoladi va reja tayyor deb e’lon qilinishidan oldin hal qilinadi yoki sababli ravishda bloklangan holat sifatida ko‘rsatiladi.

## 5.3. Omission / risk audit

SmartToDo masalaga mos ravishda quyidagilarni tekshiradi:

- xato va edge case’lar;
- xavfsizlik va ruxsatlar;
- integratsiya va backward compatibility;
- testlar va test muhiti;
- log, monitoring va diagnostika;
- resurs va performance;
- ma’lumot migratsiyasi, backup yoki rollback;
- hujjatlashtirish va delivery;
- tashqi API limitlari va failure mode’lar;
- ish tugashini tasdiqlaydigan dalil.

Bu universal checklist emas: aloqasiz item’larni majburan qo‘shmaydi. Vazifa turiga mos qoidalar tanlanadi.

## 5.4. Keraksiz va takroriy ishlarni olib tashlash

SmartToDo faqat yangi task qo‘shmaydi. U:

- bir xil natija beradigan task’larni birlashtiradi;
- boshqa task allaqachon qoplaydigan ishni olib tashlaydi;
- maqsadga aloqasiz ishni `out_of_scope` qiladi;
- ortiqcha, qiymat bermaydigan research’ni qisqartiradi;
- task juda katta bo‘lsa, uni mustaqil tekshiriladigan kichik qismlarga ajratadi.

## 5.5. Task graph validatsiyasi

SmartToDo task’larni faqat ketma-ket ro‘yxat qilib bermaydi. U DAG (directed acyclic graph) hosil qiladi:

- har bir `dependsOn` mavjud task ID’ga murojaat qiladi;
- dependency cycle bo‘lmaydi;
- task `ready` bo‘lishi uchun dependency’lari bajarilgan bo‘ladi;
- parallel bajarish faqat bir-biriga xavfli to‘qnashuv bo‘lmaganida ruxsat etiladi;
- bir xil fayl/resursni parallel o‘zgartiradigan vazifalar konflikt xavfi bo‘yicha seriallashtiriladi.

## 5.6. E’tiroz formati

Har bir muammo quyidagi shaklda qayd qilinadi:

- `finding_id`;
- `severity`;
- `related_requirement_ids`;
- `evidence`;
- `why_it_matters`;
- `required_action`;
- `acceptance_criteria`;
- `confidence`;
- `status`.

SmartToDo “reja yomon” deb umumiy gapirmaydi. U konkret kamchilik, sabab va kerakli tuzatishni ko‘rsatadi.

## 5.7. Rejani qayta ko‘rib chiqish

MexaPlan SmartToDo e’tirozlarini qabul qiladi, rad etadi yoki qo‘shimcha tekshiruv talab qiladi. Har bir qaror sabab bilan saqlanadi. SmartToDo ham o‘z e’tirozini dalil topilsa yangilashi mumkin.

Plan audit loop bir xil bahsni takrorlamasligi uchun:

- avvalgi finding’lar ID bilan saqlanadi;
- hal qilingan e’tirozlar qayta-qayta ochilmaydi, agar yangi dalil bo‘lmasa;
- bir xil xatoni boshqa nom bilan takrorlaydigan finding’lar birlashtiriladi;
- progress bo‘lmasa, tizim yangi fakt yoki aniq blocker talab qiladi.

---

# 6. MaxEffort: ♾️ Infinity sifat rejimi

## 6.1. Maqsad

MaxEffort foydalanuvchi so‘ragan natijani eng yuqori asosli sifat darajasiga olib borishga harakat qiladi. U avvalgi 4–5 ta tool chaqiruv bilan cheklanmaydi; kerak bo‘lsa ko‘proq tool, ko‘proq research, qo‘shimcha test va mustaqil tekshiruv bajaradi.

U quyidagilarni bitta yopiq siklga birlashtiradi:

**Explore → Execute → Verify → Diagnose → Improve → Re-verify**

## 6.2. Task bajarish

Har bir task uchun MaxEffort:

1. maqsad va qabul mezonini o‘qiydi;
2. kerakli kontekstni yig‘adi;
3. mos tool va usulni tanlaydi;
4. amaliyotni bajaradi;
5. real natijani tekshiradi;
6. kutilgan va haqiqiy natijani solishtiradi;
7. xato bo‘lsa, sababini aniqlaydi;
8. tuzatish yoki alternativ yondashuvni sinaydi;
9. dalillarni saqlaydi;
10. task holatini faqat dalilga qarab yangilaydi.

## 6.3. Deep exploration

MaxEffort asosiy vazifaga tegishli bo‘lgan boshqa qatlamlarni ham o‘rganadi. Masalan, GitHub’ga oid xatolik umumiy HTTP klientdan kelib chiqayotgan bo‘lsa, faqat GitHub handler’ini tuzatish yetarli emas. U xatoning ildiz sababini topishga harakat qiladi.

Har bir yangi topilma uchun savollar:

- Bu foydalanuvchi maqsadiga ta’sir qiladimi?
- Qaysi dalil buni ko‘rsatadi?
- Yangi task kerakmi?
- Bu faqat hisobotga kiritilishi kerakmi yoki tuzatish ham scope ichidami?
- Buni xavfsiz bajarish uchun tasdiq kerakmi?

## 6.4. Self-challenge

MaxEffort o‘zining dastlabki xulosalarini tekshirish uchun alohida review qadamini bajarishi mumkin:

- boshqa sabab bo‘lishi mumkinmi;
- test real muammoni o‘lchayaptimi;
- testning o‘zi noto‘g‘ri ijobiy natija bermayaptimi;
- muvaffaqiyatli chiqish asl talabga mosmi;
- yashirin regression paydo bo‘lmadimi;
- kod faqat testni qondirish uchun noto‘g‘ri yo‘l bilan o‘zgartirilmadimi.

## 6.5. Tool’lar va research soni

MaxEffort’ning umumiy sifati oldindan qo‘yilgan qat’iy “ko‘pi bilan 5 ta tool” kabi limit bilan boshqarilmaydi. Ammo har bir chaqiruvning vazifasi bo‘lishi kerak:

- yangi ma’lumot topish;
- natijani bajarish;
- natijani tekshirish;
- xatoni tashxislash;
- xavfni kamaytirish;
- mustaqil review;
- yakuniy dalil yig‘ish.

Agar yangi chaqiruv oldingisiga aynan teng bo‘lsa va yangi dalil bermasa, tizim uni ko‘r-ko‘rona takrorlamaydi.

## 6.6. Ish tugash mezonlari

MaxEffort faqat quyidagilar bajarilganda `completed` holatiga o‘tishi mumkin:

- barcha majburiy task’lar tugallangan;
- muhim qabul mezonlari tekshirilgan;
- required test’lar haqiqatan ishga tushgan;
- failure yoki skipped testlar yashirilmagan;
- yuqori xavfli topilmalar hal qilingan yoki aniq blocker sifatida qayd etilgan;
- deliverable mavjud va o‘qish/ishlatish mumkin;
- qolgan noaniqlik va cheklovlar ko‘rsatilgan.

Agar faqat ayrim ishlar bajarilgan bo‘lsa, `partial` yoki `blocked` bo‘lishi kerak, `completed` emas.

---

# 7. Uch rolning o‘zaro ishlashi

## 7.1. Rejalash sikli

1. User request → GoalSpec.
2. MexaPlan → Plan A.
3. SmartToDo, imkon qadar Plan A’ni ko‘rishdan oldin → Checklist B.
4. SmartToDo → Plan A va Checklist B orasidagi gap analysis.
5. MexaPlan → Revised Plan.
6. PlanGate → strukturaviy va xavfsizlik validatsiyasi.
7. Reja tayyor bo‘lmasa, kerakli qism qayta ko‘rib chiqiladi.
8. Reja tayyor bo‘lsa, MaxEffort ijroni boshlaydi.

## 7.2. Bajarish sikli

1. SmartToDo `ready` task’larni ko‘rsatadi.
2. MaxEffort task’ni oladi va bajaradi.
3. Natija va dalil yoziladi.
4. Verification task’ni tekshiradi.
5. Xato bo‘lsa, diagnosis/repair task yaratiladi.
6. Katta yangi topilma bo‘lsa, SmartToDo graph’ni yangilaydi.
7. MexaPlan faqat strategik o‘zgarish talab qilinsa rejani qayta tuzadi.
8. Barcha talablar tekshirilgandan keyin yakuniy hisobot yaratiladi.

## 7.3. Kim nimaga javobgar?

| Qaror | Javobgar |
|---|---|
| Foydalanuvchi maqsadini tushunish | MexaPlan / GoalSpec |
| Dastlabki strategiya | MexaPlan |
| Mustaqil talablar xaritasi | SmartToDo |
| Reja bo‘shliqlarini aniqlash | SmartToDo |
| Task graph yaratish va yaxshilash | SmartToDo |
| Strukturaviy graph validatsiyasi | PlanGate |
| Haqiqiy ishni bajarish | MaxEffort |
| Yangi bog‘liq muammolarni topish | MaxEffort |
| Yangi topilmani vazifaga aylantirish | SmartToDo |
| Strategik qayta rejalash | MexaPlan |
| Ruxsat, xavfli action va tasdiq | Runtime security/policy |
| Tugallanganlikni dalil bilan tasdiqlash | Verification layer + PlanGate |

---

# 8. Umumiy topshiriq oqimi

## 8.1. Universal oqim pseudocode’i

```text
on_user_task(request):
    goal = build_goal_spec(request)
    state = create_persistent_task_state(goal)

    plan_a = MexaPlan.create_initial_plan(goal, relevant_context)
    independent_checklist = SmartToDo.build_independent_checklist(
        goal,
        relevant_context,
        hide_plan=plan_a_if_supported
    )

    audit = SmartToDo.audit_plan(
        plan=plan_a,
        checklist=independent_checklist,
        evidence=relevant_context
    )

    plan = MexaPlan.revise_plan(plan_a, audit.findings)
    graph = SmartToDo.build_task_graph(plan, audit)

    while not PlanGate.is_ready(graph):
        defects = PlanGate.get_defects(graph)
        graph = SmartToDo.repair_graph(graph, defects)
        if strategic_change_needed(defects):
            plan = MexaPlan.revise_plan(plan, defects)
            graph = SmartToDo.rebuild_graph(plan)
        enforce_progress_and_cycle_checks()

    while not all_required_tasks_verified(graph):
        task = graph.next_ready_task()
        if task is None:
            resolve_blockers_or_dependency_errors(graph)
            continue

        result = MaxEffort.execute(task, allowed_tools, policy)
        evidence = verify_result(result, task.acceptance_criteria)
        persist_task_result(task, result, evidence)

        if result.discovers_related_issue:
            finding = record_finding(result.discovered_issue, evidence)
            graph = SmartToDo.integrate_new_finding(graph, finding)
            if strategic_impact(finding):
                plan = MexaPlan.replan_affected_area(plan, finding)
                graph = SmartToDo.reconcile_graph(plan, graph)

        update_progress_and_check_for_stalls(graph)

    final_audit = SmartToDo.audit_completed_work(goal, graph, evidence_store)
    if final_audit.finds_material_gap:
        graph = SmartToDo.add_required_followups(graph, final_audit.findings)
        resume_execution(graph)
    else:
        return evidence_based_final_report(goal, graph, evidence_store)
```

Bu konseptual pseudocode. Haqiqiy implementatsiyada tool nomlari, async flow, error model, storage va host adapterlar loyiha arxitekturasiga moslashtiriladi.

---

# 9. Smart Task Graph ma’lumot modeli

Oddiy checkbox todo-list yetarli emas. Har bir task ijro, dependency, dalil va verifikatsiya holatiga ega bo‘lishi kerak.

## 9.1. Task namunasi

```json
{
  "id": "SEC-014",
  "title": "Code-host credential yuborish yo‘lini tekshirish",
  "purpose": "Token faqat ishonchli HTTPS endpoint’ga yuborilishini ta'minlash",
  "status": "ready",
  "priority": "critical",
  "scope": "directly_related",
  "dependsOn": ["ARCH-003", "TEST-007"],
  "requiredCapabilities": ["repository_read", "test_execution"],
  "expectedOutput": [
    "audit finding yoki xavf yo‘qligiga dalil",
    "zarur bo‘lsa kod tuzatishi",
    "regression test"
  ],
  "acceptanceCriteria": [
    "credential HTTPS bo‘lmagan manzilga yuborilmaydi",
    "ruxsat etilgan HTTPS endpoint ishlashi buzilmaydi",
    "regression test natijasi qayd qilingan"
  ],
  "verification": {
    "type": "automated_test",
    "evidenceRequired": true
  },
  "risk": "high",
  "requiredApproval": false,
  "attempts": 0,
  "evidenceRefs": [],
  "blockers": []
}
```

## 9.2. Tavsiya etiladigan task holatlari

- `draft` — reja yaratilmoqda;
- `needs_review` — SmartToDo yoki PlanGate tekshirishi kerak;
- `ready` — bajarishga tayyor;
- `in_progress` — bajarilmoqda;
- `blocked` — credential, ruxsat, dependency yoki boshqa sabab to‘sqinlik qilmoqda;
- `failed` — urinish bajarilmadi;
- `needs_repair` — natija kutilgan mezonga mos kelmadi;
- `needs_verification` — ish bajarilgan, ammo tekshiruv hali yo‘q;
- `verified` — qabul mezonlari dalil bilan tasdiqlangan;
- `superseded` — yangi reja vazifani almashtirdi;
- `cancelled` — bekor qilindi, sababi qayd etilgan.

Faqat modelning “tayyor” degan javobi task’ni `verified` qilmaydi.

## 9.3. Task graph qoidalari

- Har bir ID noyob.
- Dependency ID’lari mavjud.
- Dependency cycle yo‘q.
- Bitta acceptance criterion kamida bitta verification usuliga bog‘langan.
- Xavfli amallar tegishli approval/policy talabiga bog‘lanadi.
- Task qayta ochilsa, avvalgi natija va dalil o‘chirilmaydi; yangi revision yaratiladi.
- Task o‘zgarganda oldingi verification’ning hali haqiqiyligi qayta baholanadi.

---

# 10. Deep research va tool tanlash

## 10.1. Search count emas, research coverage

Tizim qidiruv sonini maqsad qilmaydi. U kerakli savollarni javobsiz qoldirmaslikni maqsad qiladi.

Har bir research item:

- research question;
- relevant source classes;
- query/inspection strategy;
- evidence expected;
- source reliability;
- conflict resolution method;
- stop condition;
- output summary

bilan yuritiladi.

## 10.2. Tool tanlash

AI avval vazifaga kerakli capability’ni aniqlaydi. Keyin tegishli tool’larni qidiradi va schema’larini ko‘radi. Minglab tool bo‘lsa ham, hammasining to‘liq schema’sini model kontekstiga bir vaqtning o‘zida yuborish shart emas.

Tool discovery quyidagilarni tekshiradi:

- tool nomi va tavsifi;
- input schema;
- read-only yoki mutation xususiyati;
- kerakli credential/capability;
- xavf va approval talabi;
- output turi;
- timeout va retry tavsiyasi.

Tool’ning nomi uning real xatti-harakatini to‘liq ifodalamasa, runtime metadata va actual handler siyosati bir-biriga mos bo‘lishi kerak.

## 10.3. Manbalarni baholash

Research natijasi quyidagicha ajratiladi:

- `confirmed` — to‘g‘ridan-to‘g‘ri dalil bilan tasdiqlangan;
- `supported` — ishonchli, lekin to‘liq bo‘lmagan dalil;
- `uncertain` — noaniqlik bor;
- `contradicted` — boshqa dalilga zid;
- `not_checked` — hali tekshirilmagan.

Tizim taxminni fakt sifatida ko‘rsatmasligi kerak.

---

# 11. Doirani kengaytirish va yangi muammolarni boshqarish

## 11.1. Scope expansion trigger’lari

MaxEffort yangi vazifani quyidagi holatlarda taklif qiladi:

- root cause boshqa modulda bo‘lishi;
- xavfsizlik yoki ma’lumot yaxlitligi muammosi topilishi;
- dastlabki yechim boshqa funksiyani buzishi;
- test yoki CI jarayoni noto‘g‘ri signal berishi;
- hujjatlashtirilgan imkoniyat real implementatsiyaga mos kelmasligi;
- foydalanuvchi maqsadiga erishish uchun zarur komponent tekshirilmagan bo‘lishi.

## 11.2. Scope expansion tasnifi

Har bir yangi topilma quyidagilardan biri bo‘ladi:

- `must_fix` — asosiy maqsadga erishishga to‘sqinlik qiladi yoki jiddiy xavf tug‘diradi;
- `should_fix` — yakuniy sifatga sezilarli ta’sir qiladi;
- `report_only` — muhim, ammo hozirgi topshiriq scope’idan tashqarida;
- `needs_user_approval` — tashqi yoki qaytarib bo‘lmaydigan ta’sirga ega;
- `false_positive` — dalil bilan bekor qilingan.

## 11.3. O‘zgarishlar chegarasi

MaxEffort tekshiruv doirasini avtomatik kengaytirishi mumkin, ammo:

- katta refactor;
- destructive action;
- production deployment;
- tashqi tizimda ma’lumotni o‘zgartirish/o‘chirish;
- credential yoki permission o‘zgarishi;
- scope’ni sezilarli o‘zgartiradigan ish

uchun tegishli policy va zarur bo‘lsa foydalanuvchi tasdig‘i talab qilinadi.

---

# 12. Verifikatsiya va dalillar

## 12.1. Verification turlari

Task turiga qarab:

- schema/static check;
- type check;
- unit/regression test;
- integration test;
- runtime smoke test;
- real API yoki sandbox API testi;
- security test;
- benchmark/performance test;
- code review;
- output/artefact audit;
- manual approval

ishlatilishi mumkin.

## 12.2. Test natijalarini halol ko‘rsatish

- Test ishga tushmagan bo‘lsa, `not_run`.
- Test skip qilingan bo‘lsa, `skipped`.
- Test xato bilan tugagan bo‘lsa, `failed`.
- Faqat real muvaffaqiyatli natija `passed`.
- Mock bilan tekshirilgan bo‘lsa, `mock_verified`; real tashqi servis testi sifatida ko‘rsatilmaydi.
- TypeScript parse/syntax tekshiruvi full typecheck yoki integration test o‘rnini bosmaydi.

## 12.3. Independent completion audit

MaxEffort “bajarildi” degandan keyin SmartToDo yakuniy audit o‘tkazadi:

- barcha talablar task’lar bilan qoplanganmi;
- majburiy task’lar `verified`mi;
- dalillar mavjudmi;
- testlar haqiqatdan ishga tushganmi;
- yangi muammolar qolganmi;
- report scope va cheklovlarni halol ko‘rsatadimi.

Muhim gap topilsa, qo‘shimcha task yaratiladi va ish davom etadi.

---

# 13. Cheksiz urinish emas: samaradorlik va to‘xtash mezonlari

## 13.1. Nima uchun oddiy limitlar yetarli emas?

“Ko‘pi bilan 5 tool-call” katta vazifa uchun juda past bo‘lishi mumkin. “Hech qachon to‘xtama” esa infinite loop yaratishi mumkin. Tizim sifatni task completion va evidence orqali o‘lchashi kerak.

## 13.2. Progress signals

Har bir siklda tizim quyidagilarni tekshiradi:

- yangi evidence olindimi;
- yangi root cause aniqlandimi;
- task qabul mezoniga yaqinlashdimi;
- yangi finding qo‘shildimi yoki oldingi finding hal bo‘ldimi;
- urinishlar bir xil xato bilan takrorlanmayaptimi;
- boshqa usul sinab ko‘rish mantiqlimi.

## 13.3. Stagnation recovery

Agar progress bo‘lmasa:

1. xato va oldingi urinishlarni jamlaydi;
2. boshqa sabab/yondashuvlarni ko‘rib chiqadi;
3. yangi usul yoki qo‘shimcha evidence manbasini sinaydi;
4. kerak bo‘lsa task’ni kichikroq qismlarga ajratadi;
5. task’ni `blocked` qilsa, sababini va foydalanuvchidan nima kerakligini ko‘rsatadi.

Shu bilan birga, muvaffaqiyatli tugallanish uchun zarur ishlarni faqat resursni tejash uchun tashlab ketmaydi.

---

# 14. Xavfsizlik va foydalanuvchi nazorati

MaxEffort faolroq va chuqurroq ishlashi xavfsizlikni kamaytirmasligi kerak.

## 14.1. Model operator siyosatini o‘zgartirmasligi

Modelga quyidagilarni oddiy tool orqali o‘zgartirish huquqini bermaslik kerak:

- read-only rejimini o‘chiradigan setting;
- allowlist yoki tool permission’lari;
- sandbox/root/output path chegaralari;
- `ENFORCE_PROFILE` yoki xavfsizlik profilini zaiflashtiradigan setting;
- credential va auth konfiguratsiyasi;
- destructive confirmation siyosati.

Bu sozlamalarni operator belgilaydi; model ularni o‘z xohishiga ko‘ra kengaytira olmaydi.

## 14.2. Least privilege

Har bir task faqat zarur capability’larni oladi. Review task’iga yozish huquqi kerak bo‘lmasa, u read-only ishlaydi. Production write va tashqi ma’lumot o‘chirish kabi amallar alohida ruxsat talab qiladi.

## 14.3. Credential xavfsizligi

- credential log, task evidence yoki model prompt’iga keraksiz chiqarilmaydi;
- tokenlar HTTPS orqali yuboriladi;
- tashqi URL tekshiriladi;
- child process’ga barcha environment qiymatlari avtomatik uzatilmaydi;
- xato xabarlarida maxfiy qiymatlar yashiriladi;
- `.env`, token va lokal auth fayllari paketga kiritilmaydi.

## 14.4. Prompt injection

Tashqi web sahifa, README, issue, kod comment yoki repository faylidagi matn ishonchsiz ma’lumot hisoblanadi. U operator siyosatini almashtira olmaydi va yangi permission bera olmaydi.

## 14.5. Approval va xavf

Read-only research odatda avtomatik bajarilishi mumkin. Lekin quyidagilar uchun policy asosida tasdiq talab qilinishi mumkin:

- faylni o‘chirish yoki destructive migration;
- production deployment;
- tashqi service’da yozish/o‘chirish;
- pul yoki xarid bilan bog‘liq action;
- permission/credential o‘zgartirish;
- qaytarish qiyin bo‘lgan katta refactor.

MaxEffort’ning maksimal harakati ruxsatlarni chetlab o‘tish degani emas.

---

# 15. Universal MCP va agent integratsiyasi

## 15.1. Universal yadro

Pro-Fetch tarafida quyidagilar saqlanadi:

- task graph va task status;
- plan revision’lari;
- independent audit findings;
- evidence store;
- tool capability metadata;
- run/session ID;
- approval va policy holati;
- progress va checkpoint;
- yakuniy report.

## 15.2. Agent adapterlari

Har bir agent boshqacha imkoniyatga ega bo‘lishi mumkin. Shu sabab agent-specific adapter quyidagilarni belgilaydi:

- MCP ulanishini sozlash;
- global/project instructions yoki skill’ni o‘rnatish;
- imkon bo‘lsa alohida agent/session ochish;
- agentning native model va auth mexanizmidan foydalanish;
- agentning file/terminal/patch imkoniyatlarini qanday ulash;
- workflow ishga tushganini qanday tekshirish.

Masalan, agentlar uchun alohida yo‘riqnoma fayli yoki subagent konfiguratsiyasi bo‘lishi mumkin. Ammo universal yadro bitta ilovaning konfiguratsiya nomi yoki ichki API’siga bog‘lab qo‘yilmaydi.

## 15.3. API’siz ishlash talabi

“API kaliti qo‘shmaymiz” degani:

- Pro-Fetch alohida tashqi LLM provider API kalitini so‘ramaydi;
- host agentning o‘z modeli va autentifikatsiyasidan foydalanishga intiladi;
- Pro-Fetch o‘zining local state va tool execution’ini boshqaradi.

Bu **tashqi xizmatlarga umuman credential kerak emas** degani emas. GitHub, Jira, Serper yoki boshqa servislar uchun tegishli API credential’lari alohida talab qilinishi mumkin.

## 15.4. Muhim MCP chegarasi

MCP server odatda tool’larni e’lon qiladi va chaqirilganda bajaradi. U host modelining ichki thinking jarayonini o‘zicha boshqarmaydi. Shuning uchun har bir katta user request avtomatik MexaPlan → SmartToDo → MaxEffort oqimiga kirishi uchun:

- host instruction/skill;
- native subagent/session mexanizmi mavjud bo‘lsa undan foydalanish;
- kerak bo‘lsa host-specific adapter;
- yoki tashqi agentni boshqaradigan wrapper/orchestrator

kerak bo‘lishi mumkin.

Agar agent faqat MCP serverni ulashga ruxsat berib, majburiy workflow yoki instruction’ni qo‘llamasa, 100% avtomatik uch bosqich kafolatlanmaydi. Bu loyiha hujjatlarida ochiq ko‘rsatilishi shart.

---

# 16. Xato holatlari va recovery

## 16.1. AI reja noto‘g‘ri

SmartToDo mustaqil checklist bilan gap topadi. MexaPlan rejalashtirishni qayta ko‘rib chiqadi. PlanGate graph va qabul mezonlarini tekshiradi.

## 16.2. SmartToDo xato topmadi, lekin MaxEffort yangi muammo topdi

MaxEffort topilmani evidence bilan qayd etadi. SmartToDo graph’ni yangilaydi. Katta ta’sir bo‘lsa, MexaPlan tegishli qismni qayta rejalaydi.

## 16.3. Tool ishlamadi

Xato turi qayd qilinadi. Retry faqat xavfsiz va ma’noli bo‘lsa bajariladi. Boshqa capability/yo‘l sinab ko‘riladi. Takroriy muvaffaqiyatsizlik yashirilmaydi.

## 16.4. Agent sessiyasi yoki kontekst uzildi

Task status, plan revision, evidence va checkpoint saqlanadi. Yangi sessiya oxirgi task holatidan davom etadi; kontekstdan yo‘qolgan ishni bajarildi deb faraz qilmaydi.

## 16.5. Model yoki provider limitiga yetildi

Vazifa holati va checkpoint saqlanadi. Davom etish imkoni bo‘lsa keyingi sessiyada davom etiladi. Ayni paytda davom etib bo‘lmasa, `partial/blocked` holati va qolgan ishlar hisobot qilinadi.

## 16.6. Plan loop to‘xtamayapti

Bir xil finding va bir xil revised plan takrorlansa, revision diff va progress tekshiriladi. Yangi evidence bo‘lmasa, loop infinite davom etmaydi; unresolved blocker sifatida qayd qilinadi.

---

# 17. Holat mashinasi

Run quyidagi umumiy holatlardan o‘tishi mumkin:

```text
RECEIVED
  -> GOAL_SPEC
  -> PLANNING
  -> INDEPENDENT_AUDIT
  -> PLAN_REVISION
  -> PLAN_GATE
  -> EXECUTION
  -> VERIFICATION
  -> FINAL_AUDIT
  -> COMPLETED
```

Muqobil yo‘llar:

```text
PLAN_GATE -> PLAN_REVISION                 (plan validation failed)
EXECUTION -> REPLANNING                    (material new finding)
VERIFICATION -> REPAIR -> VERIFICATION     (acceptance criteria failed)
ANY_STATE -> BLOCKED                       (permission/credential/external blocker)
ANY_STATE -> PAUSED                        (user or environment interruption)
PAUSED -> RESUME                            (restore checkpoint)
FINAL_AUDIT -> REPLANNING                  (material gap found)
```

Har bir transition’ning sababi va tegishli evidence saqlanadi. Model faqat matn yozish orqali state’ni `COMPLETED` ga ko‘tara olmaydi; runtime required condition’larni tekshiradi.

---

# 18. Tavsiya etiladigan modul tuzilmasi

Bu faqat mantiqiy ajratish namunasidir; real nomlar mavjud repository arxitekturasiga moslashtirilishi kerak.

```text
src/
├── mexaplan/
│   ├── goal-spec.ts
│   ├── context-discovery.ts
│   ├── planner-protocol.ts
│   ├── research-planner.ts
│   ├── plan-schema.ts
│   └── plan-revision.ts
├── smart-todo/
│   ├── independent-checklist.ts
│   ├── plan-auditor.ts
│   ├── coverage-matrix.ts
│   ├── task-graph.ts
│   ├── graph-validator.ts
│   └── finding-manager.ts
├── max-effort/
│   ├── execution-loop.ts
│   ├── capability-discovery.ts
│   ├── scope-expansion.ts
│   ├── diagnosis.ts
│   ├── repair-loop.ts
│   └── progress-monitor.ts
├── orchestration/
│   ├── run-manager.ts
│   ├── state-machine.ts
│   ├── checkpoint-store.ts
│   ├── scheduler.ts
│   └── recovery.ts
├── verification/
│   ├── evidence-store.ts
│   ├── acceptance-checker.ts
│   ├── test-runner.ts
│   ├── final-audit.ts
│   └── report-builder.ts
├── policy/
│   ├── permission-gate.ts
│   ├── approval-policy.ts
│   ├── secret-redaction.ts
│   └── scope-guard.ts
└── integrations/
    ├── generic-mcp/
    ├── agent-adapters/
    └── host-capability-detection.ts
```

Bu daraxtni birinchi kundanoq shuncha faylga bo‘lish majburiy emas. Muhimi — har bir modulning javobgarligi aniq, testlanadigan va bir-biridan ajratilgan bo‘lishi.

---

# 19. Bosqichma-bosqich amalga oshirish rejasi

## Phase 0 — Mavjud tizimni o‘rganish

- repository arxitekturasi va mavjud MCP serverni audit qilish;
- mavjud tool discovery/execution, state, policy va logging’ni aniqlash;
- `node_modules`, secrets va build artefaktlarini audit nusxasida to‘g‘ri boshqarish;
- real registry va test holatini aniqlash;
- tizimga mos dizayn qarorlarini yozish.

**Exit criteria:** hozirgi runtime va integratsiya chegaralari dalil bilan tushunilgan; qaysi qismlar qayta foydalanilishi va qaysilari yetishmasligi ma’lum.

## Phase 1 — GoalSpec va mexaPlan

- original so‘rovdan talablarni ajratish;
- kontekst aniqlash;
- strukturali Plan A yaratish;
- task va acceptance criteria schema;
- plan revision’larini saqlash.

**Exit criteria:** reja faqat prose emas; task ID, maqsad, natija, dependency va tekshirish mezonlariga ega.

## Phase 2 — SmartToDo mustaqil audit

- blind-first checklist;
- requirement coverage matrix;
- plan diff va finding format;
- duplicate/irrelevant task deduplication;
- DAG builder va cycle detection;
- e’tirozlarni dalil bilan saqlash.

**Exit criteria:** ataylab tashlab ketilgan talablar testda aniqlanadi; keraksiz takrorlar avtomatik birlashtiriladi; graph validatsiyadan o‘tadi.

## Phase 3 — PlanGate

- task state validator;
- required acceptance criteria validator;
- dependency cycle check;
- permission/risk check;
- ijroga ruxsat berish shartlari.

**Exit criteria:** yetishmayotgan muhim task, invalid dependency yoki xavfli policy holati bo‘lsa ijro boshlanmaydi.

## Phase 4 — MaxEffort execution loop

- task scheduler;
- tool/capability discovery;
- execute/verify/diagnose/repair loop;
- scope expansion finding’lari;
- evidence collection;
- stagnation detection va alternative approach;
- checkpoint/resume.

**Exit criteria:** katta test vazifasida agent 4–5 chaqiruvdan keyin sun’iy to‘xtamaydi; kerakli vazifalarni bajaradi yoki blocker’ni ochiq ko‘rsatadi; fake completion qilmaydi.

## Phase 5 — Generic MCP va host adapterlar

- universal MCP interface;
- task start/status/get-plan/get-task/report-evidence kabi tool’lar;
- host instruction/skill package;
- mavjud bo‘lsa subagent/session adapterlari;
- capability detection va fallback mode;
- integratsiya diagnostikasi.

**Exit criteria:** kamida bir MCP host’da workflow to‘liq sinovdan o‘tadi, ikkinchi host’da esa moslashuv qatlami bilan tekshiriladi; qo‘llab-quvvatlanmagan imkoniyatlar ochiq ko‘rsatiladi.

## Phase 6 — Xavfsizlik va ishonchlilik

- prompt-injection testlari;
- modelning operator policy’ni o‘zgartirishiga qarshi test;
- secret redaction;
- read-only va filesystem boundary;
- unsafe URL/credential oqimi testlari;
- task persistence integrity;
- tool failure/retry/recovery testlari.

**Exit criteria:** yuqori xavfli regression testlar o‘tadi; xavfsizlik sozlamalari modelga o‘zboshimchalik bilan berilmaydi.

## Phase 7 — Benchmark va release

- oddiy, o‘rta va juda katta topshiriqlar;
- missing requirement benchmark;
- 20–50 task’li workflow;
- tool failure va session interruption;
- false completion benchmark;
- token/latency va foydasiz loop o‘lchovi;
- paketga secret, node_modules va stale build artifact kirishining oldini olish.

**Exit criteria:** natija faqat demoda ishlashi bilan emas, qayta takrorlanadigan testlar va dalillar bilan tasdiqlanadi.

---

# 20. Qabul mezonlari va benchmarklar

## 20.1. Planning benchmark

- katta topshiriqning majburiy talablarini reja qamrab olishi;
- har bir muhim task’da acceptance criteria bo‘lishi;
- vazifalar dependency graph’da to‘g‘ri joylashishi;
- xavf va recovery qadamlarining mavjudligi;
- research savollari va kerakli manbalarning aniqlanishi.

## 20.2. SmartToDo benchmark

- ataylab olib tashlangan task’larni topish;
- noto‘g‘ri yoki keraksiz task’ni dalil bilan belgilash;
- dublikat vazifalarni birlashtirish;
- cycle va noto‘g‘ri dependency’ni topish;
- reviewer o‘z topilmalarini dalil va acceptance criteria bilan ifodalashi.

## 20.3. MaxEffort benchmark

- 20–50 qadamli topshiriqda erta to‘xtamaslik;
- xatodan keyin recovery qilish;
- yangi root cause topilganda task graph’ni yangilash;
- natijani fake `completed` deb belgilamaslik;
- test yoki API chaqiruvi real ishlamagan bo‘lsa buni ko‘rsatish;
- bir xil xatoni foydasiz takrorlamaslik;
- scope expansion’ni asoslash va aloqasiz o‘zgarishdan tiyilish.

## 20.4. Security benchmark

- model `read-only`, allowlist, sandbox root yoki approval siyosatini o‘zgartira olmasligi;
- prompt injection permission bermasligi;
- secret log va report’ga chiqmasligi;
- task’lar foydalanuvchi tasdiqlamagan xavfli action’ni boshlamasligi;
- task graph’dagi `completed` holati dalilsiz o‘rnatilmasligi.

## 20.5. O‘lchov ko‘rsatkichlari

Faqat tool count o‘lchanmaydi. Quyidagilar ham o‘lchanadi:

- requirement coverage;
- must-fix finding recall;
- false positive rate;
- task verification rate;
- failed task recovery rate;
- fake-completion rate;
- duplicated-call rate;
- unproductive-loop detection;
- result quality;
- elapsed time va model/provider limitlari;
- user’ga ochiq qolgan unresolved issue’lar.

---

# 21. Yakuniy ta’rif

## MexaPlan
**“Nima qilish kerak, nima uchun, qanday tartibda va qanday tekshiriladi?”** degan savollarga chuqur javob beradigan strategik rejalashtiruvchi.

## SmartToDo
**“Rejada nima yetishmayapti, qaysi qadam noto‘g‘ri yoki keraksiz va bu ishni qanday ishonchli bajarish mumkin?”** degan savollarga javob beradigan mustaqil reja auditori va task graph yaratuvchi.

## MaxEffort
**“Maqsadga erishish uchun yana nima qilish, nimani chuqurroq tekshirish, qanday muammoni topish va natijani qanday tasdiqlash kerak?”** degan savollar asosida harakat qiladigan maksimal sifat rejimi.

## PlanGate va Orchestrator
AI’lar fikrlashiga o‘rin qoldirgan holda, ishning holati, ruxsat, dependency, evidence va tugallanish mezonlarini real kod bilan nazorat qiladigan mexanizmlar.

### Bir jumlada

**MexaPlan eng to‘liq strategiyani yaratadi; SmartToDo uni mustaqil tanqidiy tekshirib, yetishmayotgan va keraksiz ishlarni tartiblaydi; MaxEffort esa foydalanuvchi ko‘rsatgan vazifa chegarasidan maqsadga muvofiq kengroq izlanib, zarur ishlarni chuqur bajaradi, yangi muammolarni topadi, tuzatadi va natijani dalil bilan tekshiradi.**

Ularning hammasi tashqi AI agentining mavjud modelidan foydalanadi. Alohida LLM API kaliti shart emas, lekin har bir agentda ish tartibini boshlatadigan mos integratsiya zarur. Oddiy MCP ulanishi tool’larni taqdim qiladi; majburiy uch bosqichli workflow esa host instruction, agent adapteri yoki runtime orchestration orqali ta’minlanadi.
