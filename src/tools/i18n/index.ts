import translate_page from './translate_page.js';
import translate_text from './translate_text.js';
import transliterate from './transliterate.js';
import rtl_normalize from './rtl_normalize.js';
import i18n_strings_extract from './i18n_strings_extract.js';
import locale_detect from './locale_detect.js';
import mixed_lang_split from './mixed_lang_split.js';
import script_convert from './script_convert.js';
import slugify from './slugify.js';
import case_convert from './case_convert.js';
import unicode_normalize from './unicode_normalize.js';
import reading_time from './reading_time.js';

export default [
  translate_page,
  translate_text,
  transliterate,
  rtl_normalize,
  i18n_strings_extract,
  locale_detect,
  mixed_lang_split,
  script_convert,
  slugify,
  case_convert,
  unicode_normalize,
  reading_time,
];
