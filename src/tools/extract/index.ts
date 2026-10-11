import css_select from './css_select.js';
import xpath_select from './xpath_select.js';
import json_path from './json_path.js';
import json_ld_extract from './json_ld_extract.js';
import schema_org_extract from './schema_org_extract.js';
import regex_extract from './regex_extract.js';
import table_to_dataframe from './table_to_dataframe.js';
import email_extract from './email_extract.js';
import link_classify from './link_classify.js';
import main_content_detect from './main_content_detect.js';
import form_extract from './form_extract.js';
import list_extract from './list_extract.js';
import comment_strip from './comment_strip.js';
import footnote_extract from './footnote_extract.js';
import paginated_table_read from './paginated_table_read.js';
import meta_og_extract from './meta_og_extract.js';
import heading_outline from './heading_outline.js';
import phone_extract from './phone_extract.js';
import date_extract from './date_extract.js';
import price_extract from './price_extract.js';
import hreflang_extract from './hreflang_extract.js';
import image_alt_extract from './image_alt_extract.js';
import link_domains from './link_domains.js';

export default [
  css_select,
  xpath_select,
  json_path,
  json_ld_extract,
  schema_org_extract,
  regex_extract,
  table_to_dataframe,
  email_extract,
  link_classify,
  main_content_detect,
  form_extract,
  list_extract,
  comment_strip,
  footnote_extract,
  paginated_table_read,
  meta_og_extract,
  heading_outline,
  phone_extract,
  date_extract,
  price_extract,
  hreflang_extract,
  image_alt_extract,
  link_domains,
];
