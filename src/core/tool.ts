import type { ToolDefinition, ToolResult } from './types.js';
import { log } from './log.js';
import { executeTool } from './execution-engine.js';
import { deriveAnnotations } from './tool-classification.js';

const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/; // MCP spec limiti: 64 belgi
const registry = new Map<string, ToolDefinition>();
const usage = new Map<string, number>();
const CATEGORY_SCHEMA_CATEGORIES = new Set([
  'apitest',
  'archive',
  'auth',
  'browser',
  'convert',
  'crawl',
  'extract',
  'i18n',
  'media',
  'monitoring',
  'research',
  'search',
  'git',
  'codehost',
  'devops',
  'database',
  'security',
  'knowledge',
  'collaboration',
  'storage',
  'productivity',
  // These four were never in the list, so `applyCategorySchema` did not run for them and their
  // schemas stayed open: 83 tools where any extra argument was silently accepted and ignored. An open
  // schema is not merely lax - it cannot tell a caller which arguments do anything, and a typo like
  // `max_tokns` was indistinguishable from a correct one.
  //
  // Closing them is only safe where the tool declares everything its code reads, which is what the
  // audit's `undeclaredReads` arm measures. It found four real gaps, all fixed here:
  // `max_tokens` on `fetch_url`, `variables` on `fetch_graphql`, `action` on `fetch_soap` and `other`
  // on `diff_json`. The remaining four findings were the measurement's own noise - stopwords in
  // `language_detect`, algorithm names in `hash_string`, a response header in `http_status`.
  'data',
  'admin',
  'http',
  'docs',
]);
const CATEGORY_SCHEMA_PROPERTIES: Record<string, readonly string[]> = {
  apitest: [
    'url',
    'base_url',
    'head_url',
    'server_url',
    'endpoint',
    'path',
    'query',
    'text',
    'content',
    'data',
    'schema',
    'json',
    'method',
    'headers',
    'body',
    'response',
    'status',
    'count',
    'requests',
    'timeout_ms',
    'max_bytes',
    'limit',
    'format',
    'username',
    'password',
    'token',
    'api_key',
    'repository',
    'owner',
    'repo',
    'fields_map',
  ],
  archive: [
    'url',
    'url2',
    'query',
    'text',
    'content',
    'data',
    'action',
    'id',
    'name',
    'title',
    'selector',
    'items',
    'results',
    'limit',
    'max_pages',
    'timeout_ms',
    'max_bytes',
    'output_path',
  ],
  auth: [
    'url',
    'base_url',
    'endpoint',
    'method',
    'headers',
    'body',
    'username',
    'password',
    'token',
    'api_key',
    'key_name',
    'session_id',
    'action',
    'scopes',
    'required_scopes',
  ],
  browser: [
    'url',
    'session_id',
    'selector',
    'xpath',
    'script',
    'code',
    'text',
    'value',
    'key',
    'button',
    'fields',
    'headers',
    'full_page',
    'wait_ms',
    'amount',
    'width',
    'height',
    'limit',
    'timeout_ms',
    // Read by browser-tools.ts: `Number(input.max_chars ?? 20000)` clips every response, and
    // `saveScreenshot`, `capturePageScreenshot` and `handleDownload` each read a destination.
    'max_chars',
    'output_path',
    'save_path',
  ],
  convert: [
    'url',
    'text',
    'content',
    'data',
    'base64',
    'data_base64',
    'timeout_ms',
    'max_bytes',
    'format',
    'language',
    'output_path',
  ],
  crawl: [
    'url',
    'pages',
    'start_url',
    'url2',
    'selector',
    'xpath',
    'scope',
    'include_subdomains',
    'job_id',
    'id',
    'delay_ms',
    'concurrency',
    'depth',
    'limit',
    'max_pages',
    'max_depth',
    'timeout_ms',
    'max_bytes',
    'wait_ms',
    'action',
    'format',
    'output_path',
    // Read by the shared `runCrawlTool` for every crawl tool: a filter pair and a list of pages.
    'include',
    'exclude',
    'pattern',
    'urls',
    'items',
    'results',
  ],
  extract: [
    'url',
    'text',
    'content',
    'data',
    'selector',
    'xpath',
    'limit',
    'max_pages',
    'max_bytes',
    'timeout_ms',
    'format',
  ],
  i18n: [
    'url',
    'text',
    'content',
    'html',
    'source_lang',
    'target_lang',
    'target_script',
    'to_script',
    'languages',
    'language',
    'format',
  ],
  media: [
    'url',
    'base64',
    'data',
    'data_base64',
    'language',
    'model',
    'extension',
    'format',
    'max_bytes',
    'width',
    'height',
    'full_page',
    'selector',
    'timeout_ms',
    'output_path',
    // Returned by `bytesFromInput` alongside the decoded bytes.
    'mime_type',
  ],
  monitoring: [
    'url',
    'url2',
    'query',
    'text',
    'content',
    'data',
    'action',
    'id',
    'name',
    'title',
    'selector',
    'items',
    'results',
    'limit',
    'timeout_ms',
    'max_bytes',
  ],
  research: [
    'url',
    'query',
    'topic',
    'claim',
    'text',
    'content',
    'sources',
    'items',
    'documents',
    'results',
    'title',
    'author',
    'year',
    'published',
    'source',
    'style',
    'languages',
    'independent_variable',
    'dependent_variable',
    'exposure',
    'cause',
    'outcome',
    'effect',
    'population',
    'context',
    'mechanism',
    'limit',
    'max_pages',
    'max_depth',
    'timeout_ms',
    'max_bytes',
    'format',
    'output_path',
  ],
  search: [
    'url',
    'query',
    'text',
    'image_url',
    'site',
    'after',
    'before',
    'from',
    'to',
    'count',
    'limit',
    'timeout_ms',
    'max_bytes',
    'language',
  ],
};
const RESEARCH_TOOL_PROPERTIES: Record<string, readonly string[]> = {
  pro_research_research_plan: ['query', 'topic', 'sources', 'items', 'documents'],
  pro_research_research_iterate: ['query', 'topic', 'sources', 'items', 'documents', 'results'],
  pro_research_crawl_for_topic: ['query', 'topic', 'limit'],
  pro_research_gather_sources: ['query', 'topic', 'limit'],
  pro_research_verify_claim: ['claim', 'query', 'sources', 'items', 'documents', 'results', 'limit'],
  pro_research_cross_check: ['sources', 'items', 'documents', 'text', 'claims', 'query'],
  pro_research_extract_facts: ['text', 'content', 'document', 'sources', 'items', 'documents'],
  pro_research_build_knowledge_graph: ['sources', 'items', 'documents', 'text', 'content', 'query'],
  pro_research_dedupe_sources: ['sources', 'items', 'documents', 'results'],
  pro_research_rank_sources: ['sources', 'items', 'documents', 'results'],
  pro_research_citation_format: ['sources', 'items', 'documents', 'title', 'author', 'year', 'url', 'style', 'format'],
  pro_research_research_summarize: ['text', 'content', 'notes', 'sources', 'items', 'documents', 'query', 'topic'],
  pro_research_timeline_build: ['sources', 'items', 'documents'],
  pro_research_compare_sources: ['sources', 'items', 'documents'],
  pro_research_gap_analysis: ['sources', 'items', 'documents', 'results'],
  pro_research_research_report: ['text', 'content', 'notes', 'sources', 'items', 'documents', 'query', 'topic'],
  pro_research_hypothesis_generate: [
    'query',
    'topic',
    'independent_variable',
    'dependent_variable',
    'exposure',
    'cause',
    'outcome',
    'effect',
    'population',
    'context',
    'mechanism',
  ],
  pro_research_contradiction_detect: ['sources', 'items', 'documents', 'text', 'claims', 'query'],
  pro_research_source_bias_detect: ['text', 'content', 'claim', 'sources', 'items', 'documents'],
  pro_research_entity_resolve: ['sources', 'items', 'documents', 'text', 'content', 'query'],
  pro_research_multi_lang_research: ['query', 'topic', 'languages', 'limit'],
  pro_research_fact_ledger: ['text', 'content', 'document', 'source', 'sources', 'items', 'documents'],
  pro_research_followup_questions: ['query', 'topic', 'claim', 'sources', 'items', 'documents'],
  pro_research_evidence_strength: ['sources', 'items', 'documents', 'url', 'author', 'published', 'text'],
  pro_research_citation_graph: ['sources', 'items', 'documents'],
};
const RESEARCH_TOOL_REQUIREMENTS: Record<string, { required?: string[]; anyOf?: string[][] }> = {
  pro_research_research_plan: { required: ['query'] },
  pro_research_research_iterate: { required: ['query'] },
  pro_research_crawl_for_topic: { required: ['query'] },
  pro_research_gather_sources: { required: ['query'] },
  pro_research_verify_claim: { required: ['claim'] },
  pro_research_cross_check: { anyOf: [['sources'], ['items'], ['documents'], ['text'], ['claims'], ['query']] },
  pro_research_extract_facts: { anyOf: [['text'], ['content'], ['document'], ['sources']] },
  pro_research_build_knowledge_graph: { anyOf: [['sources'], ['text'], ['content'], ['query']] },
  pro_research_dedupe_sources: { required: ['sources'] },
  pro_research_rank_sources: { required: ['sources'] },
  pro_research_citation_format: { anyOf: [['sources'], ['title'], ['url']] },
  pro_research_research_summarize: { anyOf: [['text'], ['content'], ['notes'], ['sources']] },
  pro_research_timeline_build: { required: ['sources'] },
  pro_research_compare_sources: { required: ['sources'] },
  pro_research_gap_analysis: { required: ['sources'] },
  pro_research_research_report: { anyOf: [['text'], ['content'], ['notes'], ['sources']] },
  pro_research_hypothesis_generate: { required: ['query'] },
  pro_research_contradiction_detect: { anyOf: [['sources'], ['text'], ['claims'], ['query']] },
  pro_research_source_bias_detect: { anyOf: [['text'], ['content'], ['claim'], ['sources']] },
  pro_research_entity_resolve: { anyOf: [['sources'], ['text'], ['content'], ['query']] },
  pro_research_multi_lang_research: { required: ['query'] },
  pro_research_fact_ledger: { anyOf: [['text'], ['content'], ['document'], ['sources']] },
  pro_research_followup_questions: { required: ['query'] },
  pro_research_evidence_strength: { anyOf: [['sources'], ['url'], ['text']] },
  pro_research_citation_graph: { required: ['sources'] },
};
const AUTH_TOOL_PROPERTIES: Record<string, readonly string[]> = {
  pro_fetch_github_auth_status: [],
  pro_fetch_api_key_set: ['key_name', 'api_key', 'ttl_ms'],
  pro_fetch_session_save: ['session_id', 'session', 'data', 'value', 'ttl_ms'],
  pro_fetch_session_restore: ['session_id'],
  pro_fetch_cookie_jar_manage: ['session_id', 'jar_id', 'action', 'name', 'cookie_name', 'value', 'ttl_ms'],
  pro_fetch_basic_auth_fetch: ['url', 'username', 'password', 'method', 'headers'],
  pro_fetch_bearer_fetch: ['url', 'token', 'bearer_token', 'key_name', 'method', 'headers'],
  pro_fetch_oauth_device_flow: ['scope'],
  pro_fetch_credential_test: ['url', 'token', 'bearer_token', 'key_name', 'username', 'password', 'method', 'headers'],
  pro_fetch_scopes_audit: ['granted_scopes', 'required_scopes'],
  pro_fetch_session_list: [],
  pro_fetch_session_revoke: ['session_id'],
};
const AUTH_TOOL_REQUIREMENTS: Record<string, { required?: string[]; anyOf?: string[][] }> = {
  pro_fetch_api_key_set: { required: ['key_name', 'api_key'] },
  pro_fetch_session_save: { required: ['session_id'] },
  pro_fetch_session_restore: { required: ['session_id'] },
  pro_fetch_basic_auth_fetch: { required: ['url', 'username', 'password'] },
  pro_fetch_bearer_fetch: { required: ['url'], anyOf: [['token'], ['bearer_token'], ['key_name']] },
  pro_fetch_credential_test: { required: ['url'] },
  pro_fetch_scopes_audit: { required: ['required_scopes'] },
  pro_fetch_session_revoke: { required: ['session_id'] },
};
const SEARCH_TOOL_PROPERTIES: Record<string, readonly string[]> = {
  pro_fetch_web_search: ['query', 'limit'],
  pro_fetch_news_search: ['query', 'limit'],
  pro_fetch_academic_search: ['query', 'limit'],
  pro_fetch_code_search: ['query', 'limit'],
  pro_fetch_image_search: ['query', 'limit'],
  pro_fetch_video_search: ['query', 'limit'],
  pro_fetch_forum_search: ['query', 'limit'],
  pro_fetch_blog_search: ['query', 'limit'],
  pro_fetch_dataset_search: ['query', 'limit'],
  pro_fetch_patent_search: ['query', 'limit'],
  pro_fetch_books_search: ['query', 'limit'],
  pro_fetch_wiki_search: ['query', 'limit'],
  pro_fetch_search_suggest: ['query'],
  pro_fetch_related_queries: ['query'],
  pro_fetch_site_search: ['query', 'site', 'limit'],
  pro_fetch_date_filter_search: ['query', 'after', 'before', 'from', 'to', 'limit'],
  pro_fetch_cached_search: ['query', 'limit'],
  pro_fetch_reverse_image_search: ['image_url', 'limit'],
  pro_fetch_market_search: ['query', 'limit'],
  pro_fetch_jobs_search: ['query', 'limit'],
};
const ARCHIVE_TOOL_PROPERTIES: Record<string, readonly string[]> = {
  pro_fetch_cache_get: ['key'],
  pro_fetch_cache_search: ['needle'],
  pro_fetch_cache_put: ['key', 'value', 'ttl_ms'],
  pro_fetch_cache_delete: ['pattern'],
  pro_fetch_cache_clear: [],
  pro_fetch_cache_stats: [],
  pro_fetch_offline_browse: ['url', 'query', 'limit'],
  pro_fetch_archive_org_fetch: ['url', 'max_tokens'],
  pro_fetch_archive_org_save: ['url'],
  pro_fetch_google_cache_fetch: ['url', 'max_tokens'],
};
const ARCHIVE_TOOL_REQUIREMENTS: Record<string, string[]> = {
  pro_fetch_cache_get: ['key'],
  pro_fetch_cache_search: ['needle'],
  pro_fetch_cache_put: ['key', 'value'],
  pro_fetch_cache_delete: ['pattern'],
  pro_fetch_archive_org_fetch: ['url'],
  pro_fetch_archive_org_save: ['url'],
  pro_fetch_google_cache_fetch: ['url'],
};
const SHARED_SCHEMA_PROPERTIES: Record<string, unknown> = {
  url: { type: 'string', description: 'Manba yoki endpoint URL' },
  url2: { type: 'string', description: 'Ikkinchi URL (taqqoslash uchun)' },
  base_url: { type: 'string', description: 'API bazaviy URL' },
  head_url: { type: 'string', description: 'Yangi API spec URL' },
  endpoint: { type: 'string', description: 'API endpoint' },
  query: { type: 'string', description: "Qidiruv yoki tadqiqot so'rovi" },
  text: { type: 'string', description: 'Matn yoki source content' },
  content: { type: 'string', description: 'Matn yoki source content' },
  data: { type: 'string', description: 'JSON, CSV yoki boshqa source data' },
  base64: { type: 'string', description: 'Faylning Base64 kontenti' },
  // Alias `readBinarySource` accepts alongside `base64`: `str(input, 'base64', 'data_base64')`.
  data_base64: { type: 'string', description: 'Faylning Base64 kontenti (data_base64 aliasi)' },
  // `bytesFromInput` returns it alongside the decoded bytes: `contentType: str(input, 'mime_type')`.
  // Undeclared, a caller supplying base64 had no way to say what type it was.
  mime_type: { type: 'string', description: 'Manba faylning MIME turi' },
  selector: { type: 'string', description: 'CSS/XPath selector' },
  xpath: { type: 'string', description: 'XPath ifodasi' },
  script: { type: 'string', description: 'Browser sahifasida bajariladigan JavaScript' },
  code: { type: 'string', description: 'Kod yoki JavaScript source' },
  session_id: { type: 'string', description: 'Vaqtinchalik session identifikatori' },
  action: { type: 'string', description: 'Amal: list, add, pop, set, delete, clear, pause yoki resume' },
  fields: {
    type: 'object',
    description: 'Selector -> value shaklidagi form maydonlari',
    additionalProperties: { type: 'string' },
  },
  headers: { type: 'object', description: 'HTTP header’lar', additionalProperties: { type: 'string' } },
  sources: { type: 'array', description: "Manbalar ro'yxati", items: { type: 'object' } },
  // `list(input, 'sources', 'items', 'documents', ...)` accepts it, and 17 research tools list it in
  // their property set and their `anyOf`. With no entry here, `applyCategorySchema`'s filter dropped it
  // from every one of them while their alternatives still named it - so `pro_research_cross_check`
  // advertised an alternative that `additionalProperties: false` made unreachable.
  documents: { type: 'array', description: 'Manbalar ro‘yxati (documents aliasi)', items: { type: 'object' } },
  items: { type: 'array', description: "Elementlar ro'yxati", items: {} },
  // `runCrawlTool` reads these through aliases rather than under one canonical name:
  // `str(input, 'include', 'pattern')`, `str(input, 'exclude')` and
  // `arr(input, 'pages', 'results', 'items', 'urls')`. The crawl vocabulary offered none of them, so a
  // caller could not pass a filter or a list of pages to any crawl tool.
  include: { type: 'string', description: 'Qamrab olinadigan naqsh (pattern bilan bir xil)' },
  exclude: { type: 'string', description: 'Chetlab o‘tiladigan naqsh' },
  pattern: { type: 'string', description: 'Qamrab olinadigan naqsh (include bilan bir xil)' },
  urls: { type: 'array', description: 'Manzillar ro‘yxati', items: { type: 'string' } },
  languages: { type: 'array', description: 'Til kodlari', items: { type: 'string' } },
  target_lang: { type: 'string', description: 'Maqsad til kodi, masalan uz yoki en' },
  source_lang: { type: 'string', description: 'Manba til kodi' },
  // Aliases the i18n branches in `runIntegrationTool` actually accept, declared here because a code
  // path that reads an argument nobody can name is not reachable from the schema.
  //
  // `str(input, 'target_lang', 'to_lang')` and `str(input, 'source_lang', 'from_lang')` both take a
  // second name, and `str(input, 'text', 'content', 'html')` takes a third. Each was in
  // `CATEGORY_SCHEMA_PROPERTIES.i18n` and absent here, which meant the filter in
  // `applyCategorySchema` dropped it from every i18n tool at load time: listed in the source, missing
  // from the published schema.
  to_lang: { type: 'string', description: 'Maqsad til kodi (target_lang aliasi)' },
  from_lang: { type: 'string', description: 'Manba til kodi (source_lang aliasi)' },
  html: { type: 'string', description: 'Matn yoki HTML (text/content aliasi)' },
  method: { type: 'string', description: 'HTTP method' },
  body: { type: 'string', description: 'HTTP request body' },
  fields_map: { type: 'object', description: 'Maydonlar map’i' },
  language: { type: 'string', description: 'OCR yoki matn uchun til kodi' },
  format: { type: 'string', description: 'Chiqish formati' },
  output_path: { type: 'string', description: 'Natija fayli yo‘li' },
  width: { type: 'number', description: 'Kenglik pikselda' },
  height: { type: 'number', description: 'Balandlik pikselda' },
  limit: { type: 'number', description: 'Natijalar soni limiti' },
  max_pages: { type: 'number', description: 'Ko‘riladigan sahifalar limiti' },
  max_depth: { type: 'number', description: 'Crawl chuqurligi' },
  timeout_ms: { type: 'number', description: 'Timeout millisekundlarda' },
  max_bytes: { type: 'number', description: 'Fayl hajmi limiti' },
  // Read by the browser dispatcher for every tool it serves - `Number(input.max_chars ?? 20000)` in
  // `runBrowserAction`'s preamble, and in `runBrowserTool`'s clip helper - but absent from the shared
  // property table and from the browser vocabulary, so no browser tool could declare it. Output was
  // truncated at 20 000 characters with no way for a caller to ask for more or less.
  max_chars: { type: 'number', description: 'Javob matni limiti (belgi)' },
  wait_ms: { type: 'number', description: 'Kutish millisekundlarda' },
  amount: { type: 'number', description: 'Scroll miqdori pikselda' },
  username: { type: 'string', description: 'Foydalanuvchi nomi' },
  password: { type: 'string', description: 'Maxfiy parol; log qilinmaydi' },
  token: { type: 'string', description: 'Bearer token; log qilinmaydi' },
  key_name: { type: 'string', description: 'Saqlangan API key nomi' },
  api_key: { type: 'string', description: 'API key; log qilinmaydi' },
  repository: { type: 'string', description: 'GitHub owner/repo' },
  owner: { type: 'string', description: 'Repository egasi' },
  repo: { type: 'string', description: 'Repository nomi' },
  scopes: { type: 'array', description: "Ruxsatlar ro'yxati", items: { type: 'string' } },
  required_scopes: { type: 'array', description: 'Talab qilinadigan ruxsatlar', items: { type: 'string' } },
  value: { type: 'string', description: 'Maydon yoki klaviatura amali uchun qiymat' },
  key: { type: 'string', description: 'Bosiladigan klaviatura tugmasi' },
  button: { type: 'string', description: 'Sichqoncha tugmasi' },
  full_page: { type: 'boolean', description: 'Butun sahifani qamrab olish' },
  site: { type: 'string', description: 'Qidiruvni cheklash uchun sayt yoki domen' },
  image_url: { type: 'string', description: 'Reverse image provider uchun ommaviy rasm URL manzili' },
  after: { type: 'string', description: 'Natija shu sanadan keyin bo‘lishi kerak' },
  before: { type: 'string', description: 'Natija shu sanadan oldin bo‘lishi kerak' },
  from: { type: 'string', description: 'Boshlang‘ich qiymat yoki sana' },
  to: { type: 'string', description: 'Yakuniy qiymat yoki sana' },
  start_url: { type: 'string', description: 'Crawl boshlanadigan URL' },
  scope: { type: 'string', description: 'Crawl uchun ruxsat etilgan domen doirasi' },
  include_subdomains: { type: 'boolean', description: 'Subdomenlarni crawl doirasiga qo‘shish' },
  job_id: { type: 'string', description: 'Crawl ish identifikatori' },
  delay_ms: { type: 'number', description: 'So‘rovlar orasidagi kutish millisekundda' },
  concurrency: { type: 'number', description: 'Parallel so‘rovlar soni' },
  depth: { type: 'number', description: 'Crawl chuqurligi' },
  status: { type: 'number', description: 'HTTP javob status kodi' },
  response: { type: 'string', description: 'API mock uchun javob tanasi' },
  count: { type: 'number', description: 'So‘rovlar yoki natijalar soni' },
  requests: { type: 'number', description: 'Bajariladigan so‘rovlar soni' },
  schema: { type: 'object', description: 'JSON Schema yoki API schema ma’lumoti' },
  // `json_schema_infer` reads `str(input, 'json', 'sample', 'text', 'content')`. Without `json`
  // declared here the filter in `applyCategorySchema` drops it, and the tool's required list then
  // names a property the published schema does not contain - which is exactly what
  // `verify-registry.mts` reported when this was first added.
  json: { type: 'string', description: 'Namuna JSON matni' },
  // `link_graph` builds a graph from pages the caller has already fetched, so its input is a list of
  // page records rather than a URL to fetch. Declared here because the category filter drops anything
  // it does not also find in SHARED_SCHEMA_PROPERTIES.
  pages: {
    type: 'array',
    description: 'Allaqla olingan sahifalar: [{ url, title?, links? }]',
    items: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        title: { type: 'string' },
        links: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  path: { type: 'string', description: 'API yoki hujjat yo‘li' },
  server_url: { type: 'string', description: 'API serverining bazaviy URL manzili' },
  id: { type: 'string', description: 'Element yoki monitoring identifikatori' },
  name: { type: 'string', description: 'Element nomi' },
  title: { type: 'string', description: 'Sarlavha' },
  results: { type: 'array', description: 'Natijalar ro‘yxati', items: {} },
  topic: { type: 'string', description: 'Tadqiqot mavzusi' },
  claim: { type: 'string', description: 'Tekshiriladigan da’vo' },
  author: { type: 'string', description: 'Muallif nomi' },
  year: { type: 'string', description: 'Nashr yili' },
  published: { type: 'string', description: 'Nashr sanasi' },
  source: { type: 'string', description: 'Manba yoki manba identifikatori' },
  style: { type: 'string', description: 'Iqtibos yoki chiqish uslubi' },
  target_script: { type: 'string', description: 'Maqsad yozuv tizimi' },
  to_script: { type: 'string', description: 'Maqsad yozuv tizimi (target_script aliasi)' },
  model: { type: 'string', description: 'Ishlatiladigan model nomi' },
  extension: { type: 'string', description: 'Chiqish fayli kengaytmasi' },
  bearer_token: { type: 'string', description: 'Bearer access token; maxfiy ma’lumot' },
  jar_id: { type: 'string', description: 'Cookie jar identifikatori' },
  cookie_name: { type: 'string', description: 'Cookie nomi' },
  ttl_ms: { type: 'number', description: 'Saqlash muddati millisekundda' },
  granted_scopes: { type: 'array', description: 'Berilgan OAuth scope’lar', items: { type: 'string' } },
  session: { type: 'object', description: 'Saqlanadigan session qiymati', additionalProperties: true },
  notes: { type: 'string', description: 'Research qaydlari' },
  document: { type: 'string', description: 'Tahlil qilinadigan hujjat matni' },
  claims: { type: 'string', description: 'Taqqoslanadigan da’volar' },
  independent_variable: { type: 'string', description: 'Mustaqil o‘zgaruvchi yoki sabab omili' },
  dependent_variable: { type: 'string', description: 'Bog‘liq o‘zgaruvchi yoki o‘lchanadigan natija' },
  exposure: { type: 'string', description: 'Ta’sir yoki ekspozitsiya omili' },
  cause: { type: 'string', description: 'Tekshiriladigan sabab omili' },
  outcome: { type: 'string', description: 'O‘lchanadigan natija' },
  effect: { type: 'string', description: 'Kutilayotgan ta’sir yoki natija' },
  population: { type: 'string', description: 'Tadqiqot populyatsiyasi' },
  context: { type: 'string', description: 'Tadqiqot konteksti' },
  mechanism: { type: 'string', description: 'Tekshiriladigan mexanizm' },
};

function applyCategorySchema(def: ToolDefinition): void {
  if (!CATEGORY_SCHEMA_CATEGORIES.has(def.category)) return;
  const properties = def.inputSchema.properties ?? {};
  const toolSpecific = def.category === 'research' ? RESEARCH_TOOL_PROPERTIES[def.name] : undefined;
  const authSpecific = def.category === 'auth' ? AUTH_TOOL_PROPERTIES[def.name] : undefined;
  const archiveSpecific = def.category === 'archive' ? ARCHIVE_TOOL_PROPERTIES[def.name] : undefined;
  const specificProperties = toolSpecific ?? authSpecific ?? archiveSpecific;
  const allowed = specificProperties ?? CATEGORY_SCHEMA_PROPERTIES[def.category] ?? [];
  // A per-tool list restricts the *category vocabulary*; it does not replace what the tool declared.
  //
  // These were unioned only when no specific list applied, so `pro_fetch_bearer_fetch` - whose list
  // is `url, token, bearer_token, key_name, method, headers` - lost `body` and `max_chars`, both of
  // which its own handler reads (`typeof input.body === 'string'`, `Number(input.max_chars ?? 8000)`).
  // The schema then told a caller neither was accepted, so a POST body could not be sent to an
  // authenticated endpoint without going around the schema.
  const vocabulary = new Set([...allowed, ...Object.keys(properties)]);
  def.inputSchema.properties = Object.fromEntries(
    [...vocabulary]
      .filter((key) => key in properties || key in SHARED_SCHEMA_PROPERTIES)
      .map((key) => [key, properties[key] ?? SHARED_SCHEMA_PROPERTIES[key]]),
  );
  if (def.name === 'pro_fetch_session_save') {
    const schemaProperties = def.inputSchema.properties as Record<string, unknown>;
    schemaProperties.data = { description: 'Saqlanadigan JSON session data' };
    schemaProperties.value = { description: 'Saqlanadigan JSON session qiymati' };
  }
  def.inputSchema.additionalProperties = false;
  if (toolSpecific) {
    const contract = RESEARCH_TOOL_REQUIREMENTS[def.name];
    if (contract?.required) def.inputSchema.required = contract.required;
    else delete def.inputSchema.required;
    if (contract?.anyOf) def.inputSchema.anyOf = contract.anyOf.map((required) => ({ required }));
  }
  if (authSpecific) {
    const contract = AUTH_TOOL_REQUIREMENTS[def.name];
    if (contract?.required) def.inputSchema.required = contract.required;
    else delete def.inputSchema.required;
    if (contract?.anyOf) def.inputSchema.anyOf = contract.anyOf.map((required) => ({ required }));
    if (def.name === 'pro_fetch_credential_test') {
      const schemaProperties = def.inputSchema.properties as Record<string, Record<string, unknown>>;
      schemaProperties.method = { ...schemaProperties.method, enum: ['GET', 'HEAD', 'OPTIONS'] };
    }
  }
  if (archiveSpecific) {
    const required = ARCHIVE_TOOL_REQUIREMENTS[def.name];
    if (required) def.inputSchema.required = required;
    else delete def.inputSchema.required;
  }
  const searchSpecific = def.category === 'search' ? SEARCH_TOOL_PROPERTIES[def.name] : undefined;
  if (searchSpecific) {
    def.inputSchema.properties = Object.fromEntries(
      searchSpecific
        .map((key) => [key, properties[key] ?? SHARED_SCHEMA_PROPERTIES[key]])
        .filter((entry) => entry[1] !== undefined),
    );
    def.inputSchema.required =
      def.name === 'pro_fetch_reverse_image_search'
        ? ['image_url']
        : def.name === 'pro_fetch_site_search'
          ? ['query', 'site']
          : ['query'];
    if (def.name === 'pro_fetch_reverse_image_search') delete def.inputSchema.anyOf;
  }
  if (def.category === 'convert') {
    delete def.inputSchema.required;
    def.inputSchema.anyOf = ['url', 'text', 'content', 'data', 'base64'].map((key) => ({ required: [key] }));
  }
  if (def.category === 'browser') {
    def.inputSchema.required = def.name.endsWith('_browser_open')
      ? ['url']
      : def.name.endsWith('_browser_click') || def.name.endsWith('_browser_type')
        ? ['selector']
        : [];
  }
  const i18nRequired = def.category === 'i18n' ? I18N_TOOL_REQUIREMENTS[def.name] : undefined;
  if (i18nRequired) {
    // These eight tools all delegate to `runIntegrationTool`, so the declared `required` list was the
    // only thing telling the caller what to send - and it was wrong for six of them.
    //
    // `required: ['text', 'target_lang']` was applied to the whole category. Four tools
    // (`locale_detect`, `rtl_normalize`, `i18n_strings_extract`, `mixed_lang_split`) never read
    // `target_lang` at all, so the caller was forced to invent one. `translate_page` reads `url`, not
    // `text`. And `script_convert` / `transliterate` read `to_script`/`target_script`, which the
    // schema never declared - so a caller who followed the schema and sent `target_lang: 'ru'` got
    // "Hello" back unchanged, silently, with no error.
    //
    // The requirements below are read off the branches in `runIntegrationTool`, not guessed.
    def.inputSchema.required = i18nRequired;
  }
  /**
   * Tools whose input is "a URL *or* already-loaded text", declared as neither.
   *
   * These resolve their source through `sourceFrom(input)` (`src/core/source-from.ts`), which accepts
   * `url` or `text` and refuses with "url yoki text talab qiladi" when given neither. Their schemas said
   * `required: []` with no `anyOf`, so the caller had no way to learn that a source was expected until
   * the call failed - while `convert`, which accepts the same pair, had declared it correctly all along.
   *
   * Verified by calling all of them with `{}`: every one reported the missing source, none reported
   * anything else, so the alternative set below is exactly what they need.
   */
  const URL_OR_TEXT_ANYOF = [{ required: ['url'] }, { required: ['text'] }];

  const URL_OR_TEXT_TOOLS = new Set([
    'pro_fetch_audit_page',
    'pro_fetch_comment_strip',
    'pro_fetch_css_select',
    'pro_fetch_email_extract',
    'pro_fetch_footnote_extract',
    'pro_fetch_form_extract',
    'pro_fetch_json_ld_extract',
    'pro_fetch_json_path',
    'pro_fetch_link_classify',
    'pro_fetch_list_extract',
    'pro_fetch_main_content_detect',
    'pro_fetch_regex_extract',
    'pro_fetch_schema_org_extract',
    'pro_fetch_table_to_dataframe',
    // `pro_page_diff` (crawl) reports the same refusal through the same helper.
    'pro_page_diff',
    // `browser_action` is handled separately below: it needs a single required field, not an anyOf.
  ]);

  const apitestRequirement = def.category === 'apitest' ? APITEST_TOOL_REQUIREMENTS[def.name] : undefined;
  if (apitestRequirement) {
    // `required` and `anyOf` are mutually exclusive here: an alternative set is what "url *or*
    // content" means, and listing both a bare `required` and an `anyOf` would tell the caller two
    // contradictory stories about the same fields.
    if (apitestRequirement.anyOf) {
      delete def.inputSchema.required;
      def.inputSchema.anyOf = apitestRequirement.anyOf.map((required) => ({ required }));
    } else {
      def.inputSchema.required = apitestRequirement.required ?? [];
      delete def.inputSchema.anyOf;
    }
  }
  const requirementFix = TOOL_REQUIREMENT_FIXES[def.name];
  if (def.category === 'media' && MEDIA_TOOL_NAMES.has(def.name)) {
    // `readBinarySource` takes base64 or data_base64 before it looks at a URL, so "either" is what
    // these tools actually accept.
    delete def.inputSchema.required;
    def.inputSchema.anyOf = [{ required: ['url'] }, { required: ['base64'] }];
  } else if (URL_OR_TEXT_TOOLS.has(def.name)) {
    // "url or text" is an alternative, not a pair of requirements. `required: ['url','text']` would
    // demand both and reject every valid call; `anyOf` states the choice.
    delete def.inputSchema.required;
    def.inputSchema.anyOf = URL_OR_TEXT_ANYOF;
  } else if (def.name === 'pro_browser_browser_action') {
    // The single browser tool where the caller, not the tool name, picks the operation.
    def.inputSchema.required = ['action'];
    delete def.inputSchema.anyOf;
  } else if (requirementFix) {
    if (requirementFix.anyOf) {
      delete def.inputSchema.required;
      def.inputSchema.anyOf = requirementFix.anyOf.map((required) => ({ required }));
    } else {
      def.inputSchema.required = requirementFix.required ?? [];
      delete def.inputSchema.anyOf;
    }
  }
}

/**
 * What each delegating i18n tool actually reads, taken from the `name ===` branches in
 * `runIntegrationTool` (`src/core/integration-tools.ts`).
 *
 * `str(input, 'text', 'content', 'html')` covers three aliases, so `text` is required and the others
 * stay optional; requiring all three would reject every valid call.
 */
const I18N_TOOL_REQUIREMENTS: Record<string, string[]> = {
  // Reads text/content/html and nothing else.
  pro_fetch_locale_detect: ['text'],
  pro_fetch_rtl_normalize: ['text'],
  pro_fetch_i18n_strings_extract: ['text'],
  pro_fetch_mixed_lang_split: ['text'],
  // Reads text/content/html plus to_script/target_script - NOT target_lang.
  // Reads text/content/html plus an OPTIONAL to_script/target_script. Not required: `convertScript`
  // defaults to latin when no target is given, so `script_convert` with only `text` is a valid call.
  // Requiring `target_script` broke `to_script`, which the code also accepts - caught by
  // `tests/handler-regression.test.ts`, which passes `to_script` and expected Cyrillic back.
  pro_fetch_script_convert: ['text'],
  pro_fetch_transliterate: ['text'],
  // Reads url (not text) plus target_lang/to_lang.
  pro_fetch_translate_page: ['url', 'target_lang'],
  pro_fetch_translate_text: ['text', 'target_lang'],
};

/**
 * What each apitest tool reads, read off the `name ===` branches in `runIntegrationTool`.
 *
 * `required: ['url']` was applied to the whole category and was wrong for six of the twelve:
 *
 * - Five spec tools reach the specification through `bodyFor`, which takes `content|text|spec|
 *   document|sample` *or* `url`. Requiring `url` made the inline path - the one that needs no network
 *   and no credentials - unreachable from the schema, even though every one of them works that way.
 *   Verified: `openapi_parse`, `openapi_endpoints_list`, `swagger_validate`, `wsdl_parse` and
 *   `openapi_fetch` all return correct results for `{ content }`.
 * - `json_schema_infer` never looks at a URL at all; it wants inline JSON.
 * - `openapi_try` calls an endpoint; it needs `base_url` and `path`.
 * - `api_diff` compares two specifications; it needs both.
 */
const APITEST_TOOL_REQUIREMENTS: Record<string, { required?: string[]; anyOf?: string[][] }> = {
  pro_fetch_openapi_fetch: { anyOf: [['url'], ['content']] },
  pro_fetch_openapi_parse: { anyOf: [['url'], ['content']] },
  pro_fetch_openapi_endpoints_list: { anyOf: [['url'], ['content']] },
  pro_fetch_swagger_validate: { anyOf: [['url'], ['content']] },
  pro_fetch_wsdl_parse: { anyOf: [['url'], ['content']] },
  pro_fetch_json_schema_infer: { required: ['json'] },
  pro_fetch_openapi_try: { required: ['base_url', 'path'] },
  pro_fetch_api_diff: { required: ['base_url', 'head_url'] },
  pro_fetch_graphql_introspect: { required: ['url'] },
  pro_fetch_graphql_schema_read: { required: ['url'] },
  pro_fetch_api_rate_limit_probe: { required: ['url'] },
  // A mock with defaults is a valid mock: 200 and an empty body.
  pro_fetch_api_mock_respond: {},
};

/**
 * Requirements for tools whose declared `required` did not match the function they call.
 *
 * `required: ['url']` was applied to all 22 crawl tools and all 15 media tools by copying one
 * sibling's schema. It happens to be right for most, and wrong for several in a way that changed
 * what callers can do:
 *
 * - `crawl_pause_resume` is job control. It calls `controlCrawlJob(input)`, which reads `job_id` and
 *   `action`. Requiring a URL meant the only way to pause a crawl was to name a page, and passing
 *   `job_id` + `action` was rejected outright.
 * - `link_graph` builds a graph from pages the caller has already fetched. It reads `pages` and never
 *   reads `url` at all.
 * - The media tools read their bytes through `readBinarySource(input, ...)`, which accepts `base64`
 *   or `data_base64` before falling back to `url`. Requiring `url` made the inline path - the one
 *   that needs no network - unreachable, the same defect `convert` already avoided with an `anyOf`.
 */
const TOOL_REQUIREMENT_FIXES: Record<string, { required?: string[]; anyOf?: string[][] }> = {
  pro_fetch_crawl_pause_resume: { required: ['job_id', 'action'] },
  pro_fetch_link_graph: { required: ['pages'] },
  // Declares `repository` and describes `url` as "alternative to repository", then requires `url`.
  // The documented alternative was therefore the only accepted form.
  pro_fetch_release_watch: { anyOf: [['repository'], ['url']] },
};

/**
 * Media tools whose input is a URL *or* base64.
 *
 * The two screenshot tools are deliberately absent. `runMediaTool` handles them in a branch that
 * runs *before* `bytesFromInput` - it navigates a browser and writes a file - so they never look at
 * `base64`. Their schema advertised it as an alternative anyway, and calling
 * `pro_fetch_screenshot_page` with base64 answered "Noma'lum media tool", which tells a caller
 * nothing about the argument it got wrong.
 */
const MEDIA_TOOL_NAMES = new Set([
  'pro_fetch_audio_transcribe',
  'pro_fetch_barcode_qr_read',
  'pro_fetch_exif_read',
  'pro_fetch_favicon_fetch',
  'pro_fetch_image_convert',
  'pro_fetch_image_info',
  'pro_fetch_image_ocr',
  'pro_fetch_image_resize',
  'pro_fetch_media_download',
  'pro_fetch_pdf_ocr',
  'pro_fetch_svg_to_png',
  'pro_fetch_thumbnail_generate',
  'pro_fetch_video_metadata',
]);

export function defineTool(def: ToolDefinition): ToolDefinition {
  if (!def.name || !NAME_RE.test(def.name)) {
    throw new Error("Noto'g'ri tool nomi: " + def.name);
  }
  if (!def.description || def.description.length < 10) {
    throw new Error('description juda qisqa: ' + def.name);
  }
  if (!def.inputSchema || def.inputSchema.type !== 'object') {
    throw new Error("inputSchema object bo'lishi kerak: " + def.name);
  }
  if (registry.has(def.name)) {
    throw new Error('Takroriy tool: ' + def.name);
  }
  applyCategorySchema(def);
  if (!def.annotations) def.annotations = deriveAnnotations(def.name, def.category);
  if (!def.outputSchema)
    def.outputSchema = {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        data: {},
        error: {
          type: ['object', 'null'],
          properties: { code: { type: 'string' }, message: { type: 'string' }, retryable: { type: 'boolean' } },
          required: ['code', 'message', 'retryable'],
        },
        metadata: { type: 'object' },
      },
      required: ['ok', 'data', 'error', 'metadata'],
      additionalProperties: false,
    };
  registry.set(def.name, def);
  return def;
}

export function allTools(): ToolDefinition[] {
  return Array.from(registry.values());
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

export function registrySize(): number {
  return registry.size;
}

export function usageStats(): Record<string, number> {
  return Object.fromEntries(usage);
}

export function sanitizeToolError(error: unknown, input: Record<string, unknown>): string {
  let message = error instanceof Error ? error.message : String(error);
  const secrets: string[] = [];
  const collect = (value: unknown, depth: number): void => {
    if (depth > 8 || value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) collect(item, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (
        /(password|token|secret|api[-_]?key|authorization|cookie|credential)/i.test(key) &&
        typeof item === 'string' &&
        item.length >= 4
      )
        secrets.push(item);
      else collect(item, depth + 1);
    }
  };
  collect(input, 0);
  for (const secret of [...new Set(secrets)].sort((left, right) => right.length - left.length))
    message = message.split(secret).join('[REDACTED]');
  message = message
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.:-]+/gi, '$1 [REDACTED]')
    .replace(/([?&](?:access_token|refresh_token|token|api[_-]?key|password|secret)=)[^&#\s]+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[REDACTED]@');
  return message.slice(0, 2000);
}

/** outputSchema `error.message` ni string deb talab qiladi — shuning uchun doim matn qaytaramiz. */
function errorMessageFromResult(res: ToolResult): string {
  const texts = (res.content ?? []).filter((item) => item.type === 'text').map((item) => item.text);
  const message = texts.join('\n\n').trim();
  return (message || 'Tool xato qaytardi').slice(0, 2000);
}

function structuredDataFromResult(res: ToolResult): unknown {
  const texts = (res.content ?? []).filter((item) => item.type === 'text').map((item) => item.text);
  if (texts.length === 1) {
    try {
      return JSON.parse(texts[0]);
    } catch {
      return texts[0];
    }
  }
  return texts;
}

export async function dispatch(name: string, input: Record<string, unknown> = {}): Promise<ToolResult> {
  const tool = registry.get(name);
  if (!tool) {
    return { content: [{ type: 'text', text: 'Nomalum tool: ' + name }], isError: true };
  }
  usage.set(name, (usage.get(name) ?? 0) + 1);
  try {
    const execution = await executeTool(tool, input, () => tool.handler(input));
    const res = execution.value as ToolResult;
    const existingMeta =
      res && typeof res === 'object' && res._meta && typeof res._meta === 'object'
        ? (res._meta as Record<string, unknown>)
        : {};
    return {
      ...res,
      structuredContent: {
        ok: !res.isError,
        data: res.isError ? null : structuredDataFromResult(res),
        error: res.isError
          ? { code: 'TOOL_REPORTED_ERROR', message: errorMessageFromResult(res), retryable: false }
          : null,
        metadata: execution.metadata,
      },
      _meta: { ...existingMeta, 'pro-fetch': execution.metadata },
    };
  } catch (err) {
    const msg = sanitizeToolError(err, input);
    const extended =
      err instanceof Error
        ? (err as Error & { code?: string; retryable?: boolean; executionMetadata?: unknown })
        : undefined;
    const metadata = extended?.executionMetadata ?? {
      tool: name,
      status: 'error',
      errorCode:
        extended?.code ??
        (err instanceof Error && err.name === 'PolicyError' ? 'POLICY_BLOCKED' : 'TOOL_EXECUTION_ERROR'),
      retryable: extended?.retryable ?? false,
    };
    log('ERR ' + name + ' ' + msg);
    return {
      content: [{ type: 'text', text: 'Xato (' + name + '): ' + msg }],
      isError: true,
      structuredContent: {
        ok: false,
        data: null,
        error: {
          code: extended?.code ?? 'TOOL_EXECUTION_ERROR',
          message: msg,
          retryable: extended?.retryable ?? false,
        },
        metadata,
      },
      _meta: { 'pro-fetch': metadata },
    };
  }
}
