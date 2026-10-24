import isSafePattern from 'safe-regex2';

/**
 * ReDoS (katastrofik backtracking) himoyasi.
 *
 * Handler'lar shared single-threaded stdio event loop'ida ishlaydi, shuning uchun
 * birorta foydalanuvchi regex'i `(a+)+$` kabi ko'rinishda bo'lsa, bitta so'rov
 * butun serverdagi barcha parallel so'rovlarni muzlatadi. `safe-regex2` pattern'ni
 * statik tahlil qilib, ichma-ich kvantifikatorlar (nested quantifier) borligini
 * aniqlasa — rad etadi. Xavfsizlik nuqtai nazaridan xato yo'nalishi to'g'ri:
 * ba'zan xavfsiz bo'lgan ekzotik pattern'ni ham rad etsa-yu, hech qachon
 * katastrofik pattern'ni o'tkazmaydi.
 *
 * Mavjud `haystack` uzunlik cap'lari (200 KB / 512 bayt) qo'shimcha himoya qatlami
 * sifatida ishlaydi — lekin ular backtracking'ni to'xtatmaydi, shu bois regex
 * kompilyatsiyasidan oldin shu guard chaqirilishi shart.
 */
export function compileSafeRegex(source: string, flags = ''): RegExp {
  if (typeof source !== 'string' || source.length === 0) {
    throw new Error('regex manbasi bo‘sh bo‘lmasligi kerak');
  }
  if (source.length > 512) {
    throw new Error('regex manbasi juda uzun (512 belgidan ko‘p)');
  }
  let safe: boolean;
  try {
    safe = isSafePattern(source);
  } catch {
    // safe-regex2 o‘zi ham parse xatolarini tashlashi mumkin; foydalanuvchi xatosini
    // uniform qilish uchun uni yaroqsiz pattern sifatida rad etamiz.
    throw new Error('regex tahlil qilib bo‘lmadi — pattern’ni soddaroq qilib yozing');
  }
  if (!safe) {
    throw new Error('xavfli regex rad etildi (katastrofik backtracking ehtimoli). Iltimos soddaroq pattern ishlating.');
  }
  try {
    return new RegExp(source, flags);
  } catch (error) {
    throw new Error(`yaroqsiz regex — ${(error as Error).message}`);
  }
}

/** Faqat tekshirish uchun: pattern ReDoS-jihatdan xavfsizmi? */
export function isSafeRegexPattern(source: string): boolean {
  if (typeof source !== 'string' || source.length === 0 || source.length > 512) return false;
  try {
    return isSafePattern(source);
  } catch {
    return false;
  }
}
