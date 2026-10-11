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
  ],
  convert: ['url', 'text', 'content', 'data', 'base64', 'timeout_ms', 'max_bytes', 'format', 'language', 'output_path'],
  crawl: [
    'url',
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
  pro_research_research_plan: ['query', 'sources'],
  pro_research_research_iterate: ['query', 'sources', 'items', 'documents', 'results'],
  pro_research_crawl_for_topic: ['query', 'limit'],
  pro_research_gather_sources: ['query', 'limit'],
  pro_research_verify_claim: ['claim', 'query', 'sources', 'limit'],
  pro_research_cross_check: ['sources', 'items', 'documents', 'text', 'claims', 'query'],
  pro_research_extract_facts: ['text', 'content', 'document', 'sources'],
  pro_research_build_knowledge_graph: ['sources', 'items', 'documents', 'text', 'content', 'query'],
  pro_research_dedupe_sources: ['sources', 'items', 'documents', 'results'],
  pro_research_rank_sources: ['sources', 'items', 'documents', 'results'],
  pro_research_citation_format: ['sources', 'items', 'documents', 'title', 'author', 'year', 'url', 'style', 'format'],
  pro_research_research_summarize: ['text', 'content', 'notes', 'sources', 'items', 'documents', 'query'],
  pro_research_timeline_build: ['sources', 'items', 'documents'],
  pro_research_compare_sources: ['sources', 'items', 'documents'],
  pro_research_gap_analysis: ['sources', 'items', 'documents', 'results'],
  pro_research_research_report: ['text', 'content', 'notes', 'sources', 'items', 'documents', 'query'],
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
  pro_research_multi_lang_research: ['query', 'languages', 'limit'],
  pro_research_fact_ledger: ['text', 'content', 'document', 'source', 'sources'],
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
  items: { type: 'array', description: "Elementlar ro'yxati", items: {} },
  languages: { type: 'array', description: 'Til kodlari', items: { type: 'string' } },
  target_lang: { type: 'string', description: 'Maqsad til kodi, masalan uz yoki en' },
  source_lang: { type: 'string', description: 'Manba til kodi' },
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
  def.inputSchema.properties = Object.fromEntries(
    [...new Set([...allowed, ...(specificProperties ? [] : Object.keys(properties))])]
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
}

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
