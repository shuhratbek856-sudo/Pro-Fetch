import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { defineTool } from './tool.js';
import type { ToolDefinition, ToolResult } from './types.js';
import { fetchWithOptions } from './http-client.js';
import { getCredential } from './credentials.js';
import { assertSafeUrl } from './ssrf-guard.js';

const execFileAsync = promisify(execFile);
type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;
type Pack =
  'git' | 'codehost' | 'devops' | 'database' | 'security' | 'knowledge' | 'collaboration' | 'storage' | 'productivity';
type Spec = {
  name: string;
  category: Pack;
  title: string;
  props?: string[];
  required?: string[];
  action: string;
  provider?: string;
};
const P: Record<string, { type: string; description: string; enum?: string[]; [key: string]: unknown }> = {
  path: { type: 'string', description: 'Workspace ichidagi nisbiy yo‘l' },
  cwd: {
    type: 'string',
    description: 'Ishchi katalogning workspace ichidagi nisbiy yo‘li',
  },
  query: { type: 'string', description: 'Qidiruv so‘rovi' },
  text: { type: 'string', description: 'Tekshirish yoki saqlash uchun matn' },
  content: { type: 'string', description: 'Kontent; max 1 MiB' },
  owner: { type: 'string', description: 'Repository egasi yoki namespace' },
  repo: { type: 'string', description: 'Repository nomi' },
  project: {
    type: 'string',
    description: 'Loyiha yoki namespace/repository identifikatori',
  },
  workspace: { type: 'string', description: 'Workspace identifikatori' },
  id: { type: 'string', description: 'Resource identifikatori' },
  name: { type: 'string', description: 'Resource nomi' },
  title: { type: 'string', description: 'Sarlavha' },
  branch: { type: 'string', description: 'Git branch nomi' },
  revision: { type: 'string', description: 'Git revision yoki commit SHA' },
  table: { type: 'string', description: 'Database jadvali' },
  sql: { type: 'string', description: 'Faqat read-only SQL so‘rovi' },
  database: { type: 'string', description: 'Database yoki SQLite fayl yo‘li' },
  key: { type: 'string', description: 'Obyekt yoki kalit nomi' },
  bucket: { type: 'string', description: 'Storage bucket' },
  url: { type: 'string', description: 'Tashqi HTTP(S) URL' },
  base_url: {
    type: 'string',
    description: 'Provider API base URL (SSRF siyosati bilan tekshiriladi)',
  },
  method: {
    type: 'string',
    description: 'HTTP usuli',
    enum: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  },
  body: { type: 'string', description: 'JSON request body, max 1 MiB' },
  headers: { type: 'object', description: 'Qo‘shimcha xavfsiz HTTP headerlar' },
  limit: { type: 'number', description: 'Natija limiti, 1-100' },
  page: { type: 'number', description: 'Sahifa raqami' },
  namespace: { type: 'string', description: 'Namespace yoki loyiha' },
  resource: { type: 'string', description: 'Resource turi' },
  channel: { type: 'string', description: 'Channel yoki konteyner' },
  message: { type: 'string', description: 'Xabar matni' },
  email: { type: 'string', description: 'Email manzili' },
  confirm: {
    type: 'boolean',
    description: 'Tashqi tizimga o‘zgartirish kiritish uchun explicit tasdiq',
  },
  confirm_send: {
    type: 'boolean',
    description: 'Email yuborishga explicit tasdiq',
  },
  tags: { type: 'array', description: 'Teglar', items: { type: 'string' } },
  id_list: {
    type: 'array',
    description: 'Identifikatorlar ro‘yxati',
    items: { type: 'string' },
  },
  format: { type: 'string', description: 'Natija formati' },
  days: { type: 'number', description: 'Kunlar soni' },
  amount: { type: 'number', description: 'Miqdor yoki limit' },
  match: { type: 'string', description: 'Pattern yoki filtr' },
  package: { type: 'string', description: 'Package nomi' },
  version: { type: 'string', description: 'Package versiyasi' },
  ecosystem: { type: 'string', description: 'Package ekotizimi' },
  severity: { type: 'string', description: 'Severity filtri' },
  file_path: { type: 'string', description: 'Workspace ichidagi fayl yo‘li' },
  object_key: { type: 'string', description: 'Object storage kaliti' },
  local_path: {
    type: 'string',
    description: 'Workspace ichidagi lokal fayl yo‘li',
  },
  database_id: { type: 'string', description: 'Notion/Drive database ID' },
  team_id: { type: 'string', description: 'Team ID' },
  issue_id: { type: 'string', description: 'Issue ID' },
  page_id: { type: 'string', description: 'Page ID' },
  event_id: { type: 'string', description: 'Calendar event ID' },
  start: { type: 'string', description: 'ISO 8601 start vaqti' },
  end: { type: 'string', description: 'ISO 8601 end vaqti' },
  table_name: { type: 'string', description: 'Table name' },
  fields: {
    type: 'array',
    description: 'Field nomlari',
    items: { type: 'string' },
  },
  sort: { type: 'string', description: 'Saralash' },
  offset: { type: 'number', description: 'Natijalar offseti' },
  recursive: { type: 'boolean', description: 'Ichki kataloglarni ham ko‘rish' },
  include_archived: {
    type: 'boolean',
    description: 'Arxivlangan resurslarni qo‘shish',
  },
  command: {
    type: 'string',
    description: 'Faqat dokumentatsiyalangan, allowlist’dagi command nomi',
  },
  value: { type: 'string', description: 'Qiymat' },
  source: { type: 'string', description: 'Manba URI yoki identifikatori' },
  document_id: { type: 'string', description: 'Knowledge document ID' },
  ids: { type: 'array', description: 'ID ro‘yxati', items: { type: 'string' } },
  body_text: { type: 'string', description: 'Body matni' },
  subject: { type: 'string', description: 'Email mavzusi' },
  recipient: { type: 'string', description: 'Qabul qiluvchi email' },
  date: { type: 'string', description: 'ISO sana' },
  state: { type: 'string', description: 'Resource holati' },
  provider: { type: 'string', description: 'Provider nomi' },
  pattern: {
    type: 'string',
    description: 'Qidirish uchun glob yoki regex pattern',
  },
  max_results: { type: 'number', description: 'Maksimal natijalar soni' },
  db_path: {
    type: 'string',
    description: 'Workspace ichidagi SQLite DB fayli',
  },
  confirm_delete: {
    type: 'boolean',
    description: 'Ma’lumotni o‘chirishga explicit tasdiq',
  },
  priority: { type: 'string', description: 'Vazifa ustuvorligi' },
  status: { type: 'string', description: 'Holat' },
  description: { type: 'string', description: 'Tavsif' },
  repository: { type: 'string', description: 'owner/repo' },
};
const result = (value: unknown): ToolResult => ({
  content: [
    {
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    },
  ],
});
const inputString = (i: Record<string, unknown>, key: string, fallback = ''): string => {
  const v = i[key];
  return typeof v === 'string' ? v : fallback;
};
const need = (i: Record<string, unknown>, key: string): string => {
  const v = inputString(i, key).trim();
  if (!v) throw new Error(`MISSING_INPUT: '${key}' majburiy.`);
  return v;
};
const bounded = (i: Record<string, unknown>, key: string, fallback: number, max = 100): number => {
  const n = Number(i[key]);
  return Number.isFinite(n) ? Math.max(1, Math.min(max, Math.floor(n))) : fallback;
};
const workspaceRoot = (): string => path.resolve(process.env.PRO_FETCH_WORKSPACE || process.cwd());
function safeLocalPath(raw: string | undefined, fallback = '.'): string {
  const root = workspaceRoot();
  const value = (raw || fallback).trim();
  if (!value) return root;
  const candidate = path.resolve(root, value);
  const rel = path.relative(root, candidate);
  if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel))
    throw new Error('PATH_OUTSIDE_WORKSPACE: yo‘l workspace chegarasidan chiqdi.');
  try {
    const rootReal = realpathSync(root);
    let ancestor = candidate;
    while (!existsSync(ancestor)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) break;
      ancestor = parent;
    }
    const ancestorReal = realpathSync(ancestor);
    const physicalRel = path.relative(rootReal, ancestorReal);
    if (physicalRel === '..' || physicalRel.startsWith('..' + path.sep) || path.isAbsolute(physicalRel))
      throw new Error('PATH_OUTSIDE_WORKSPACE: symlink workspace tashqarisiga chiqadi.');
    if (existsSync(candidate)) {
      const targetReal = realpathSync(candidate);
      const targetRel = path.relative(rootReal, targetReal);
      if (targetRel === '..' || targetRel.startsWith('..' + path.sep) || path.isAbsolute(targetRel))
        throw new Error('PATH_OUTSIDE_WORKSPACE: symlink workspace tashqarisiga chiqadi.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PATH_OUTSIDE_WORKSPACE')) throw error;
    throw new Error('WORKSPACE_UNAVAILABLE: workspace root mavjud emas yoki tekshirib bo‘lmadi.');
  }
  return candidate;
}
function safeSegment(v: string, label: string): string {
  if (!v || v.length > 240 || v === '.' || v === '..' || v.startsWith('-') || /[\u0000-\u001f]/.test(v))
    throw new Error(`INVALID_${label.toUpperCase()}: noto‘g‘ri ${label}.`);
  return v;
}
/**
 * Run a read-only SQLite statement and return rows as JSON.
 *
 * ## Why not the `sqlite3` CLI
 *
 * It worked, but it made the tool useless on a machine without that binary — which is most machines,
 * and every consumer who installed the package rather than the system tool. The failure surfaced as
 * `COMMAND_FAILED_ENOENT: spawn sqlite3 ENOENT`, which tells the model nothing about what to do.
 *
 * `better-sqlite3` is already a declared optional dependency with a prebuilt binary for this platform,
 * so it is loaded lazily and the CLI is kept only as a fallback. Either way the read-only guarantee
 * comes from the same place: `assertReadOnlySql` runs before this function is ever called, and the
 * connection is additionally opened with `readonly: true` so the database cannot be written even if
 * a statement slipped through.
 *
 * Rows are shaped like the CLI's `-json` output, so the transcript does not change shape depending on
 * which path ran.
 */
async function sqliteQuery(path: string, sql: string): Promise<{ stdout: string; stderr: string }> {
  // Fail with a clear message rather than a native error the caller cannot act on. `better-sqlite3`
  // reports a missing or unreadable database as "Cannot open database because the directory does not
  // exist", which is wrong when the directory exists and the file does not, and gives the model
  // nothing to fix.
  if (!existsSync(path)) throw new Error(`SQLITE_FILE_NOT_FOUND: ${path}`);

  try {
    // Imported through a variable so TypeScript does not need type declarations for an optional
    // dependency, and so a missing package surfaces as a catchable error instead of a load-time crash.
    const specifier = 'better-sqlite3';
    const mod = (await import(specifier)) as unknown as { default: new (p: string, o?: object) => SqliteDb };
    const db = new mod.default(path, { readonly: true, fileMustExist: true });
    try {
      const rows = db.prepare(sql).all();
      return { stdout: JSON.stringify(rows, null, 2), stderr: '' };
    } finally {
      db.close();
    }
  } catch (error) {
    // Fall back to the CLI only when the module itself could not be loaded — an unsupported platform,
    // musl/Alpine without a prebuild, or an install where optional dependencies were skipped.
    //
    // The code list is deliberately broad and includes the exact codes observed in practice:
    // `MODULE_NOT_FOUND` (Node), `ERR_MODULE_NOT_FOUND` (ESM resolvers, including tsx and bundlers),
    // and `ERR_DLOPEN_FAILED` / `ERR_INVALID_MODULE_SPECIFIER` (a missing or mismatched native
    // binding). Anything else — a bad statement, a corrupt database, a permission failure — is a real
    // error and must be reported, not silently retried through a second engine.
    const code = (error as NodeJS.ErrnoException).code;
    const missingModule =
      code === 'MODULE_NOT_FOUND' ||
      code === 'ERR_MODULE_NOT_FOUND' ||
      code === 'ERR_DLOPEN_FAILED' ||
      code === 'ERR_INVALID_MODULE_SPECIFIER';
    if (!missingModule) throw error;
  }
  return command('sqlite3', ['-readonly', '-json', path, sql]);
}

/** The slice of the `better-sqlite3` surface this module uses. */
interface SqliteDb {
  prepare(sql: string): { all(): unknown[] };
  close(): void;
}

async function command(
  file: string,
  args: string[],
  cwd = safeLocalPath(undefined),
  env: Record<string, string | undefined> = {},
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execFileAsync(file, args, {
      cwd,
      timeout: Number(process.env.PRO_FETCH_COMMAND_TIMEOUT_MS) || 30_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, ...env },
    });
  } catch (e) {
    const x = e as Error & { code?: string; stdout?: string; stderr?: string };

    // A missing executable is the single most common failure for these tools, and the raw error does
    // not distinguish "not installed" from "installed but not on PATH" from "the command itself is
    // missing". Each needs a different response from the caller, so they are named here instead of
    // being collapsed into `COMMAND_FAILED_ENOENT`.
    if (x.code === 'ENOENT') {
      throw new Error(
        `COMMAND_NOT_FOUND: '${file}' topilmadi. Bu buyruq PATH da emas yoki o'rnatilmagan. ` +
          `O'rnatish: https://nodejs.org (npm), https://git-scm.com (git), ` +
          `https://docs.docker.com/get-docker/ (docker), https://kubernetes.io/docs/tasks/tools/ (kubectl).`,
      );
    }
    if (x.code === 'EACCES') {
      throw new Error(`COMMAND_NOT_EXECUTABLE: '${file}' topildi lekin ishga tayyor emas (EACCES).`);
    }

    const msg = (x.stderr || x.message || String(e))
      .replace(/(?:token|password|secret|api[_-]?key)=\S+/gi, '[REDACTED]')
      .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[REDACTED]@')
      .replace(/((?:postgres|postgresql|mysql|redis)s?:\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[REDACTED]@')
      .slice(0, 1800);
    throw new Error(`COMMAND_FAILED${x.code ? `_${x.code}` : ''}: ${msg}`);
  }
}
async function httpJson(
  url: string,
  options: {
    method?: string;
    token?: string;
    tokenHeader?: string;
    body?: string;
    headers?: Record<string, string>;
    maxBytes?: number;
  } = {},
): Promise<unknown> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(options.headers || {}),
  };
  if (options.token)
    headers[options.tokenHeader || 'authorization'] = options.tokenHeader ? options.token : `Bearer ${options.token}`;
  if (options.body !== undefined && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type'))
    headers['content-type'] = 'application/json';
  const response = await fetchWithOptions(url, {
    method,
    headers,
    body: options.body,
    cache: false,
    retries: method === 'GET' ? 1 : 0,
    maxBytes: options.maxBytes || 1_500_000,
  });
  if (response.status < 200 || response.status >= 300)
    throw new Error(`UPSTREAM_HTTP_${response.status}: ${response.text.slice(0, 500)}`);
  if (!response.text.trim()) return { ok: true, status: response.status };
  try {
    return JSON.parse(response.text) as unknown;
  } catch {
    return {
      status: response.status,
      contentType: response.contentType,
      text: response.text.slice(0, 50000),
    };
  }
}
function safeCloudPath(raw: string): string {
  const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || /[\u0000-\u001f]/.test(part)))
    throw new Error('INVALID_CLOUD_PATH: path traversal yoki control character taqiqlanadi.');
  return parts.join('/');
}
function safeIdent(s: string, label = 'identifier'): string {
  if (!/^[A-Za-z_][A-Za-z0-9_$-]{0,127}$/.test(s))
    throw new Error(`INVALID_${label.toUpperCase()}: identifikator noto‘g‘ri.`);
  return s;
}

const SPECS: Spec[] = [];
function add(category: Pack, specs: Array<Omit<Spec, 'category'>>): void {
  for (const s of specs) SPECS.push({ ...s, category });
}

// 22 local Git operations, all invoked with execFile (no shell interpolation).
const gitActions: Array<[string, string, string[], string[]]> = [
  ['status', 'Working tree status', ['path'], []],
  ['diff', 'Working tree diff', ['path', 'revision'], []],
  ['log', 'Commit history', ['revision', 'limit', 'path'], []],
  ['blame', 'Line-level blame', ['path', 'start', 'end'], ['path']],
  ['show', 'Show commit or object', ['revision', 'path'], ['revision']],
  ['branch_list', 'List branches', ['limit'], []],
  ['branch_create', 'Create branch', ['branch', 'revision', 'confirm'], ['branch', 'confirm']],
  ['branch_delete', 'Delete branch', ['branch', 'confirm'], ['branch', 'confirm']],
  ['branch_switch', 'Switch branch', ['branch', 'confirm'], ['branch', 'confirm']],
  ['tag_list', 'List tags', ['limit'], []],
  ['tag_create', 'Create annotated tag', ['name', 'revision', 'confirm'], ['name', 'confirm']],
  ['stash_list', 'List stashes', ['limit'], []],
  ['stash_push', 'Stash tracked changes', ['message', 'confirm'], ['confirm']],
  ['stash_pop', 'Apply latest stash', ['confirm'], ['confirm']],
  ['remote_list', 'List remotes', ['limit'], []],
  ['grep', 'Search tracked text', ['query', 'path', 'limit'], ['query']],
  ['file_history', 'File history', ['path', 'limit'], ['path']],
  ['changed_files', 'List changed files', ['revision'], []],
  ['diff_stat', 'Diff summary', ['revision'], []],
  ['repo_info', 'Repository root and current branch', [], []],
  ['commit_preview', 'Preview commit diff', ['revision'], ['revision']],
  ['tracked_files', 'List tracked files', ['path', 'limit'], []],
];
add(
  'git',
  gitActions.map(([action, title, props, required]) => ({
    name: `pro_fetch_git_${action}`,
    title,
    action,
    props,
    required,
  })),
);

// Code-host APIs: six real API operations per provider.
const codeOps = [
  ['repository', 'Repository metadata'],
  ['issues', 'List issues'],
  ['pulls', 'List pull/merge requests'],
  ['commits', 'List commits'],
  ['branches', 'List branches'],
  ['tags', 'List version tags'],
] as const;
for (const provider of ['gitlab', 'gitea', 'forgejo', 'bitbucket'])
  add(
    'codehost',
    codeOps.map(([action, title]) => ({
      name: `pro_fetch_codehost_${provider}_${action}`,
      title: `${provider}: ${title}`,
      action,
      provider,
      props: ['owner', 'repo', 'project', 'workspace', 'base_url', 'query', 'state', 'limit', 'page'],
      required:
        provider === 'gitea' || provider === 'forgejo'
          ? ['owner', 'repo']
          : provider === 'bitbucket'
            ? ['workspace', 'repo']
            : ['repo'],
    })),
  );

const devopsOps: Record<string, Array<[string, string, string[]]>> = {
  docker: [
    ['ps', 'List containers', ['limit']],
    ['images', 'List local images', ['limit']],
    ['inspect', 'Inspect container/image', ['id']],
    ['logs', 'Read container logs', ['id', 'limit']],
    ['stats', 'Container resource stats', ['limit']],
    ['compose_ps', 'Compose service status', ['cwd']],
  ],
  kubectl: [
    ['get', 'Get Kubernetes resources', ['resource', 'namespace', 'name', 'limit']],
    ['describe', 'Describe Kubernetes resource', ['resource', 'namespace', 'name']],
    ['logs', 'Read pod logs', ['name', 'namespace', 'limit']],
    ['events', 'List events', ['namespace', 'limit']],
    ['namespaces', 'List namespaces', ['limit']],
    ['contexts', 'List contexts (names only)', ['limit']],
  ],
  terraform: [
    ['validate', 'Validate Terraform configuration', ['cwd']],
    ['fmt_check', 'Check Terraform formatting', ['cwd']],
    ['show', 'Show planned/current configuration', ['cwd']],
    ['plan_preview', 'Plan without state refresh', ['cwd']],
    ['providers', 'List required providers', ['cwd']],
    ['workspace_show', 'Show current workspace', ['cwd']],
  ],
  npm: [
    ['audit', 'Dependency security audit', ['cwd']],
    ['outdated', 'List outdated dependencies', ['cwd']],
    ['list', 'Top-level installed dependencies', ['cwd']],
    ['package_info', 'Read package metadata', ['cwd']],
    ['test', 'Run project tests (explicit opt-in)', ['cwd', 'confirm']],
    ['build', 'Build project (explicit opt-in)', ['cwd', 'confirm']],
  ],
};
for (const [provider, ops] of Object.entries(devopsOps))
  add(
    'devops',
    ops.map(([action, title, props]) => ({
      name: `pro_fetch_devops_${provider}_${action}`,
      title: `${provider}: ${title}`,
      action,
      provider,
      props,
      required:
        action === 'inspect'
          ? ['id']
          : action === 'logs' && provider === 'docker'
            ? ['id']
            : action === 'logs' && provider === 'kubectl'
              ? ['name']
              : action === 'describe'
                ? ['resource', 'name']
                : ['test', 'build'].includes(action) && provider === 'npm'
                  ? ['confirm']
                  : [],
    })),
  );

const dbOps = [
  ['ping', 'Connectivity check'],
  ['list_tables', 'List tables/keys'],
  ['describe', 'Describe table/key'],
  ['query', 'Execute read-only query'],
  ['explain', 'Explain read-only query'],
  ['version', 'Database version/info'],
] as const;
for (const provider of ['sqlite', 'postgres', 'mysql', 'redis'])
  add(
    'database',
    dbOps.map(([action, title]) => ({
      name: `pro_fetch_database_${provider}_${action}`,
      title: `${provider}: ${title}`,
      action,
      provider,
      props: ['database', 'db_path', 'table', 'sql', 'query', 'key', 'match', 'limit', 'cwd'],
      required:
        action === 'describe'
          ? provider === 'redis'
            ? ['key']
            : ['table']
          : action === 'query'
            ? [provider === 'redis' ? 'query' : 'sql']
            : action === 'explain'
              ? [provider === 'redis' ? 'query' : 'sql']
              : [],
    })),
  );

const securityOps: Array<[string, string, string[]]> = [
  ['osv_query', 'Query OSV advisories', ['package', 'version', 'ecosystem']],
  ['osv_batch', 'Batch vulnerability query', ['body']],
  ['npm_audit', 'Run npm dependency audit', ['cwd']],
  ['npm_outdated', 'Find outdated packages', ['cwd']],
  ['license_report', 'Generate dependency license inventory', ['cwd']],
  ['sbom', 'Generate package-lock SBOM', ['cwd']],
  ['secret_scan_files', 'Scan workspace files for likely secrets', ['path', 'recursive']],
  ['secret_scan_text', 'Scan provided text for secrets', ['text']],
  ['secret_scan_diff', 'Scan Git diff for secrets', ['cwd']],
  ['secret_scan_json', 'Scan JSON while masking values', ['text']],
  ['headers_audit', 'Audit HTTP security headers', ['url']],
  ['tls_audit', 'Check HTTPS TLS reachability and security headers', ['url']],
  ['cors_audit', 'Inspect CORS response policy', ['url']],
  ['csp_audit', 'Inspect Content-Security-Policy', ['url']],
  ['redirect_audit', 'Inspect redirect chain', ['url']],
  ['cookie_audit', 'Inspect cookie security attributes', ['url']],
  ['security_txt', 'Read security.txt', ['url']],
  ['robots_audit', 'Inspect robots.txt policy', ['url']],
  ['dns_audit', 'Validate public DNS resolution for URL host', ['url']],
  ['url_audit', 'Assess URL scheme and public-host policy', ['url']],
  ['dependency_files', 'Find dependency manifests and lockfiles', ['path', 'recursive']],
  ['lockfile_packages', 'Summarize lockfile package names', ['path']],
  ['package_advisories', 'Check one package/version via OSV', ['package', 'version', 'ecosystem']],
  ['exposed_metadata', 'Find accidental metadata and env files', ['path', 'recursive']],
];
add(
  'security',
  securityOps.map(([action, title, props]) => ({
    name: `pro_fetch_security_${action}`,
    title,
    action,
    props,
    required:
      action === 'osv_batch'
        ? ['body']
        : ['osv_query', 'package_advisories'].includes(action)
          ? ['package', 'version']
          : [
                'headers_audit',
                'tls_audit',
                'cors_audit',
                'csp_audit',
                'redirect_audit',
                'cookie_audit',
                'security_txt',
                'robots_audit',
                'dns_audit',
                'url_audit',
              ].includes(action)
            ? ['url']
            : action === 'secret_scan_text' || action === 'secret_scan_json'
              ? ['text']
              : [],
  })),
);

const knowledgeOps: Array<[string, string, string[]]> = [
  ['ingest', 'Ingest document into local knowledge store', ['title', 'content', 'source', 'tags', 'confirm']],
  ['ingest_url', 'Fetch and ingest a public document', ['url', 'title', 'tags', 'confirm']],
  ['get', 'Retrieve indexed document', ['document_id']],
  ['list', 'List indexed documents', ['limit', 'offset']],
  ['search', 'Search knowledge documents', ['query', 'limit']],
  ['delete', 'Delete document (confirmation required)', ['document_id', 'confirm_delete']],
  ['stats', 'Knowledge index statistics', []],
  ['rebuild', 'Rebuild lexical index from stored documents', []],
  ['chunk', 'Split text into bounded overlapping chunks', ['text', 'amount']],
  ['summarize', 'Create extractive summary', ['text', 'amount']],
  ['citation_extract', 'Extract candidate citations/URLs', ['text']],
  ['dedupe', 'Find duplicate documents', ['limit']],
  ['rank', 'Rank matching documents', ['query', 'limit']],
  ['export', 'Export knowledge index as JSON', ['limit']],
  ['import', 'Import JSON knowledge documents', ['text', 'confirm']],
  ['tag', 'Add/remove document tags', ['document_id', 'tags', 'confirm']],
  ['update', 'Update document text/title', ['document_id', 'title', 'content', 'confirm']],
  ['validate_citations', 'Check URL citations in indexed text', ['text', 'limit']],
];
add(
  'knowledge',
  knowledgeOps.map(([action, title, props]) => ({
    name: `pro_fetch_knowledge_${action}`,
    title,
    action,
    props,
    required:
      action === 'ingest'
        ? ['title', 'content', 'confirm']
        : action === 'ingest_url'
          ? ['url', 'confirm']
          : action === 'get'
            ? ['document_id']
            : action === 'delete'
              ? ['document_id', 'confirm_delete']
              : action === 'tag' || action === 'update'
                ? ['document_id', 'confirm']
                : action === 'import'
                  ? ['text', 'confirm']
                  : action === 'search' || action === 'rank'
                    ? ['query']
                    : ['chunk', 'summarize', 'citation_extract', 'validate_citations'].includes(action)
                      ? ['text']
                      : [],
  })),
);

const collabOps: Record<string, Array<[string, string, string[]]>> = {
  slack: [
    ['search', 'Search messages', ['query', 'limit']],
    ['channels', 'List conversations', ['limit']],
    ['history', 'Read channel history', ['channel', 'limit']],
    ['users', 'List users', ['limit']],
    ['user_get', 'Get user profile', ['id']],
    ['post_message', 'Post message after confirmation', ['channel', 'message', 'confirm']],
    ['replies', 'Read thread replies', ['channel', 'id', 'limit']],
  ],
  linear: [
    ['search', 'Search issues/projects', ['query', 'limit']],
    ['issue_get', 'Get issue', ['issue_id']],
    ['issues', 'List issues', ['team_id', 'limit']],
    ['teams', 'List teams', ['limit']],
    ['users', 'List users', ['limit']],
    ['issue_create', 'Create issue after confirmation', ['team_id', 'title', 'description', 'confirm']],
    ['issue_update', 'Update issue after confirmation', ['issue_id', 'title', 'description', 'status', 'confirm']],
  ],
  jira: [
    ['search', 'Search Jira issues using JQL', ['query', 'limit']],
    ['issue_get', 'Get issue', ['issue_id']],
    ['projects', 'List projects', ['limit']],
    ['comments', 'List issue comments', ['issue_id', 'limit']],
    ['issue_create', 'Create issue after confirmation', ['project', 'title', 'description', 'confirm']],
    ['issue_update', 'Update issue after confirmation', ['issue_id', 'title', 'description', 'status', 'confirm']],
    ['transitions', 'List issue transitions', ['issue_id']],
  ],
  notion: [
    ['search', 'Search pages and databases', ['query', 'limit']],
    ['page_get', 'Get page', ['page_id']],
    ['database_query', 'Query database', ['database_id', 'limit']],
    ['block_children', 'List child blocks', ['page_id', 'limit']],
    ['page_create', 'Create page after confirmation', ['database_id', 'title', 'content', 'confirm']],
    ['page_update', 'Update page after confirmation', ['page_id', 'title', 'confirm']],
    ['page_archive', 'Archive page after confirmation', ['page_id', 'confirm']],
  ],
};
for (const [provider, ops] of Object.entries(collabOps))
  add(
    'collaboration',
    ops.map(([action, title, props]) => ({
      name: `pro_fetch_collab_${provider}_${action}`,
      title: `${provider}: ${title}`,
      action,
      provider,
      props,
      required:
        (
          {
            search: ['query'],
            history: ['channel'],
            post_message: ['channel', 'message', 'confirm'],
            user_get: ['id'],
            replies: ['channel', 'id'],
            issue_get: ['issue_id'],
            issue_create:
              provider === 'linear'
                ? ['team_id', 'title', 'confirm']
                : provider === 'jira'
                  ? ['project', 'title', 'confirm']
                  : ['database_id', 'title', 'confirm'],
            issue_update:
              provider === 'linear'
                ? ['issue_id', 'confirm']
                : provider === 'jira'
                  ? ['issue_id', 'confirm']
                  : ['page_id', 'title', 'confirm'],
            page_get: ['page_id'],
            database_query: ['database_id'],
            block_children: ['page_id'],
            page_create: ['database_id', 'title', 'confirm'],
            page_update: ['page_id', 'title', 'confirm'],
            page_archive: ['page_id', 'confirm'],
            comments: ['issue_id'],
            transitions: ['issue_id'],
          } as Record<string, string[]>
        )[action] || [],
    })),
  );

const storageOps = [
  ['dropbox', 'list', 'List folder contents', ['path']],
  ['dropbox', 'search', 'Search files', ['query']],
  ['dropbox', 'get', 'Get file metadata', ['path']],
  ['dropbox', 'upload', 'Upload text content after confirmation', ['path', 'content', 'confirm']],
  ['google_drive', 'list', 'List Drive files', ['query', 'limit']],
  ['google_drive', 'search', 'Search Drive files', ['query', 'limit']],
  ['google_drive', 'get', 'Get Drive file metadata', ['id']],
  ['google_drive', 'upload', 'Upload text file after confirmation', ['name', 'content', 'confirm']],
  ['onedrive', 'list', 'List OneDrive folder children', ['path']],
  ['onedrive', 'search', 'Search OneDrive', ['query']],
  ['onedrive', 'get', 'Get OneDrive item', ['id']],
  ['onedrive', 'upload', 'Upload text file after confirmation', ['path', 'content', 'confirm']],
  ['s3', 'list', 'List S3 objects', ['bucket', 'prefix', 'limit']],
  ['s3', 'get', 'Read S3 object as UTF-8 text', ['bucket', 'object_key']],
  ['s3', 'upload', 'Upload workspace file to S3 after confirmation', ['bucket', 'object_key', 'local_path', 'confirm']],
  ['s3', 'head', 'Inspect S3 object metadata', ['bucket', 'object_key']],
] as const;
add(
  'storage',
  storageOps.map(([provider, action, title, props]) => ({
    name: `pro_fetch_storage_${provider}_${action}`,
    title: `${provider}: ${title}`,
    provider,
    action,
    props: [...props],
    required:
      (
        {
          search: ['query'],
          get:
            provider === 'google_drive' || provider === 'onedrive'
              ? ['id']
              : provider === 's3'
                ? ['bucket', 'object_key']
                : ['path'],
          upload:
            provider === 's3'
              ? ['bucket', 'object_key', 'local_path', 'confirm']
              : provider === 'google_drive'
                ? ['name', 'content', 'confirm']
                : ['path', 'content', 'confirm'],
          head: ['bucket', 'object_key'],
        } as Record<string, string[]>
      )[action] || (action === 'list' && provider === 's3' ? ['bucket'] : []),
  })),
);

const productivityOps = [
  ['gmail', 'messages', 'List Gmail messages', ['query', 'limit']],
  ['gmail', 'message_get', 'Get Gmail message', ['id']],
  ['gmail', 'draft_create', 'Create Gmail draft', ['recipient', 'subject', 'body_text', 'confirm']],
  ['gmail', 'send', 'Send email after explicit confirmation', ['recipient', 'subject', 'body_text', 'confirm_send']],
  ['gmail', 'labels', 'List Gmail labels', ['limit']],
  ['gmail', 'threads', 'List Gmail threads', ['query', 'limit']],
  ['calendar', 'events', 'List Calendar events', ['start', 'end', 'limit']],
  ['calendar', 'event_get', 'Get Calendar event', ['event_id']],
  [
    'calendar',
    'event_create',
    'Create Calendar event after confirmation',
    ['title', 'start', 'end', 'description', 'confirm'],
  ],
  [
    'calendar',
    'event_update',
    'Update Calendar event after confirmation',
    ['event_id', 'title', 'start', 'end', 'confirm'],
  ],
  ['calendar', 'event_delete', 'Delete Calendar event after confirmation', ['event_id', 'confirm_delete']],
  ['calendar', 'quick_add', 'Create event from natural-language text after confirmation', ['text', 'confirm']],
  ['todoist', 'tasks', 'List Todoist tasks', ['query', 'limit']],
  ['todoist', 'task_get', 'Get Todoist task', ['id']],
  [
    'todoist',
    'task_create',
    'Create Todoist task after confirmation',
    ['content', 'description', 'priority', 'confirm'],
  ],
  [
    'todoist',
    'task_update',
    'Update Todoist task after confirmation',
    ['id', 'content', 'description', 'priority', 'confirm'],
  ],
  ['todoist', 'task_close', 'Close Todoist task after confirmation', ['id', 'confirm']],
  ['todoist', 'task_delete', 'Delete Todoist task after confirmation', ['id', 'confirm_delete']],
] as const;
add(
  'productivity',
  productivityOps.map(([provider, action, title, props]) => ({
    name: `pro_fetch_productivity_${provider}_${action}`,
    title: `${provider}: ${title}`,
    provider,
    action,
    props: [...props],
    required:
      (
        {
          message_get: ['id'],
          draft_create: ['recipient', 'subject', 'body_text', 'confirm'],
          send: ['recipient', 'subject', 'body_text', 'confirm_send'],
          event_get: ['event_id'],
          event_create: ['title', 'start', 'end', 'confirm'],
          event_update: ['event_id', 'confirm'],
          event_delete: ['event_id', 'confirm_delete'],
          quick_add: ['text', 'confirm'],
          task_get: ['id'],
          task_create: ['content', 'confirm'],
          task_update: ['id', 'confirm'],
          task_close: ['id', 'confirm'],
          task_delete: ['id', 'confirm_delete'],
        } as Record<string, string[]>
      )[action] || [],
  })),
);

function schemas(props: string[] = []): Record<string, unknown> {
  return Object.fromEntries([...new Set(props)].map((k) => [k, P[k] ?? { type: 'string', description: k }]));
}
function ensureMutationAllowed(input: Record<string, unknown>, operation: string): void {
  if (process.env.PRO_FETCH_READ_ONLY === 'true')
    throw new Error('READ_ONLY: PRO_FETCH_READ_ONLY=true rejimida o‘zgartirish amali bloklangan.');
  if (input.confirm !== true && input.confirm_send !== true && input.confirm_delete !== true)
    throw new Error(`CONFIRMATION_REQUIRED: ${operation} uchun confirm=true talab qilinadi.`);
}
async function assertProviderBase(raw: string, provider: string): Promise<string> {
  let candidate: URL;
  try {
    candidate = new URL(raw);
  } catch {
    throw new Error('INVALID_PROVIDER_BASE: valid absolute URL required.');
  }
  if (candidate.protocol !== 'https:' && candidate.protocol !== 'http:')
    throw new Error('INVALID_PROVIDER_BASE: only HTTP(S) is allowed.');
  if (candidate.username || candidate.password || candidate.search || candidate.hash)
    throw new Error('INVALID_PROVIDER_BASE: credentials, query, and fragment are not allowed in base URL.');
  const defaults: Record<string, string> = {
    gitlab: 'gitlab.com',
    gitea: 'gitea.com',
    forgejo: 'codeberg.org',
    bitbucket: 'api.bitbucket.org',
  };
  const allowed = new Set(
    (process.env.PRO_FETCH_ALLOWED_CODEHOST_HOSTS || '')
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean),
  );
  const host = candidate.hostname.toLowerCase();
  if (host !== defaults[provider] && !allowed.has(host))
    throw new Error(
      'CUSTOM_CODEHOST_HOST_BLOCKED: custom code-host host must be listed in PRO_FETCH_ALLOWED_CODEHOST_HOSTS; credential was not sent.',
    );
  const url = await assertSafeUrl(candidate.toString());
  return url.toString().replace(/\/$/, '');
}

async function runGit(action: string, i: Record<string, unknown>): Promise<unknown> {
  const cwd = safeLocalPath(inputString(i, 'cwd'));
  const rel = inputString(i, 'path');
  if (rel) safeLocalPath(rel);
  const run = async (args: string[]) => (await command('git', args, cwd)).stdout.trim();
  const lim = String(bounded(i, 'limit', 30, 200));
  const rev = inputString(i, 'revision', 'HEAD');
  if (rev && (!/^[A-Za-z0-9_./@{}^~:-]{1,160}$/.test(rev) || rev.startsWith('-'))) throw new Error('INVALID_REVISION');
  const branch = inputString(i, 'branch');
  if (
    branch &&
    (!/^[A-Za-z0-9_./-]{1,160}$/.test(branch) ||
      branch.startsWith('-') ||
      branch.includes('..') ||
      branch.endsWith('.') ||
      branch.endsWith('/'))
  )
    throw new Error('INVALID_BRANCH');
  const target = rel ? ['--', rel] : [];
  switch (action) {
    case 'status':
      return await run(['status', '--short', '--branch']);
    case 'diff':
      return await run(['diff', '--no-ext-diff', ...(inputString(i, 'revision') ? [rev] : []), ...target]);
    case 'log':
      return await run([
        'log',
        '--date=iso-strict',
        '--pretty=format:%H%x09%an%x09%ad%x09%s',
        '-n',
        lim,
        rev,
        ...target,
      ]);
    case 'blame': {
      const p = safeSegment(need(i, 'path'), 'path');
      const args = ['blame', '--line-porcelain'];
      const st = inputString(i, 'start');
      const en = inputString(i, 'end');
      if (st && en) {
        if (!/^\d+$/.test(st) || !/^\d+$/.test(en) || Number(st) < 1 || Number(en) < Number(st))
          throw new Error('INVALID_LINE_RANGE');
        args.push('-L', `${Number(st)},${Number(en)}`);
      }
      return await run([...args, '--', p]);
    }
    case 'show':
      return await run(['show', '--no-ext-diff', '--format=fuller', rev, ...target]);
    case 'branch_list':
      return await run(['branch', '--all', '--no-color']);
    case 'branch_create':
      ensureMutationAllowed(i, 'git branch create');
      return await run(['branch', safeSegment(need(i, 'branch'), 'branch'), rev]);
    case 'branch_delete':
      ensureMutationAllowed(i, 'git branch delete');
      return await run(['branch', '-d', safeSegment(need(i, 'branch'), 'branch')]);
    case 'branch_switch':
      ensureMutationAllowed(i, 'git switch');
      return await run(['switch', safeSegment(need(i, 'branch'), 'branch')]);
    case 'tag_list':
      return await run(['tag', '--list', '--sort=-creatordate']);
    case 'tag_create':
      ensureMutationAllowed(i, 'git tag create');
      return await run([
        'tag',
        '-a',
        safeSegment(need(i, 'name'), 'tag'),
        rev,
        '-m',
        inputString(i, 'message', 'Pro-Fetch tag'),
      ]);
    case 'stash_list':
      return await run(['stash', 'list']);
    case 'stash_push':
      ensureMutationAllowed(i, 'git stash push');
      return await run(['stash', 'push', '-m', inputString(i, 'message', 'Pro-Fetch stash')]);
    case 'stash_pop':
      ensureMutationAllowed(i, 'git stash pop');
      return await run(['stash', 'pop']);
    case 'remote_list':
      return await run(['remote', '-v']);
    case 'grep':
      return await run(['grep', '-n', '-I', '-e', need(i, 'query'), '--', rel || '.']);
    case 'file_history':
      return await run([
        'log',
        '--follow',
        '--name-status',
        '--pretty=format:%H%x09%ad%x09%s',
        '--date=short',
        '-n',
        lim,
        '--',
        safeSegment(need(i, 'path'), 'path'),
      ]);
    case 'changed_files':
      return await run(['diff', '--name-status', rev]);
    case 'diff_stat':
      return await run(['diff', '--stat', rev]);
    case 'repo_info':
      return {
        root: await run(['rev-parse', '--show-toplevel']),
        branch: await run(['branch', '--show-current']),
        commit: await run(['rev-parse', 'HEAD']),
        insideWorkTree: (await run(['rev-parse', '--is-inside-work-tree'])) === 'true',
      };
    case 'commit_preview':
      return await run(['show', '--stat', '--oneline', '--no-renames', rev]);
    case 'tracked_files':
      return await run(['ls-files', '--', rel || '.']);
    default:
      throw new Error('UNSUPPORTED_GIT_ACTION');
  }
}

async function codehostConfig(
  provider: string,
  i: Record<string, unknown>,
): Promise<{ base: string; token?: string; header?: string }> {
  const defaults: Record<string, string> = {
    gitlab: 'https://gitlab.com/api/v4',
    gitea: 'https://gitea.com/api/v1',
    forgejo: 'https://codeberg.org/api/v1',
    bitbucket: 'https://api.bitbucket.org/2.0',
  };
  const names: Record<string, string> = {
    gitlab: 'GITLAB_TOKEN',
    gitea: 'GITEA_TOKEN',
    forgejo: 'FORGEJO_TOKEN',
    bitbucket: 'BITBUCKET_TOKEN',
  };
  const rawBase = inputString(i, 'base_url', process.env[`${provider.toUpperCase()}_BASE_URL`] || defaults[provider]);
  const base = await assertProviderBase(rawBase, provider);
  return {
    base,
    token: getCredential(names[provider]),
    header: provider === 'gitlab' ? 'PRIVATE-TOKEN' : undefined,
  };
}
async function runCodehost(provider: string, action: string, i: Record<string, unknown>): Promise<unknown> {
  const cfg = await codehostConfig(provider, i);
  let pathPart = '';
  const owner = inputString(i, 'owner');
  const repo = need(i, 'repo');
  const project = inputString(i, 'project', owner ? `${owner}/${repo}` : repo);
  const workspace = inputString(i, 'workspace', owner);
  const limit = bounded(i, 'limit', 20, 100);
  const page = bounded(i, 'page', 1, 10000);
  const query = inputString(i, 'query');
  const state = inputString(i, 'state', 'all');
  if ((provider === 'gitea' || provider === 'forgejo') && !owner)
    throw new Error('MISSING_INPUT: owner talab qilinadi.');
  if (provider === 'gitlab') {
    const p = encodeURIComponent(project);
    pathPart = (
      {
        repository: `/projects/${p}`,
        issues: `/projects/${p}/issues?state=${encodeURIComponent(state)}&per_page=${limit}&page=${page}`,
        pulls: `/projects/${p}/merge_requests?state=${encodeURIComponent(state)}&per_page=${limit}&page=${page}`,
        commits: `/projects/${p}/repository/commits?per_page=${limit}&page=${page}`,
        branches: `/projects/${p}/repository/branches?per_page=${limit}&page=${page}`,
        tags: `/projects/${p}/repository/tags?per_page=${limit}&page=${page}`,
      } as Record<string, string>
    )[action];
  } else if (provider === 'gitea' || provider === 'forgejo') {
    const root = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    pathPart = (
      {
        repository: root,
        issues: `${root}/issues?state=${encodeURIComponent(state)}&limit=${limit}&page=${page}`,
        pulls: `${root}/pulls?state=${encodeURIComponent(state)}&limit=${limit}&page=${page}`,
        commits: `${root}/commits?limit=${limit}&page=${page}`,
        branches: `${root}/branches?limit=${limit}&page=${page}`,
        tags: `${root}/tags?limit=${limit}&page=${page}`,
      } as Record<string, string>
    )[action];
  } else {
    if (!workspace) throw new Error('MISSING_INPUT: Bitbucket uchun workspace yoki owner kerak.');
    const root = `/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repo)}`;
    pathPart = (
      {
        repository: root,
        issues: `${root}/issues?q=${encodeURIComponent(query)}&pagelen=${limit}&page=${page}`,
        pulls: `${root}/pullrequests?state=${encodeURIComponent(state)}&pagelen=${limit}&page=${page}`,
        commits: `${root}/commits?pagelen=${limit}&page=${page}`,
        branches: `${root}/refs/branches?pagelen=${limit}&page=${page}`,
        tags: `${root}/refs/tags?pagelen=${limit}&page=${page}`,
      } as Record<string, string>
    )[action];
  }
  if (!pathPart) throw new Error('UNSUPPORTED_CODEHOST_ACTION');
  const headers: Record<string, string> = {};
  if (provider === 'bitbucket' && cfg.token) headers.authorization = `Bearer ${cfg.token}`;
  const url = cfg.base + pathPart;
  const data = await httpJson(url, {
    token: provider === 'bitbucket' ? undefined : cfg.token,
    tokenHeader: cfg.header,
    headers,
  });
  if (query && Array.isArray(data))
    return data.filter((item) => JSON.stringify(item).toLowerCase().includes(query.toLowerCase())).slice(0, limit);
  return data;
}

async function runDevops(provider: string, action: string, i: Record<string, unknown>): Promise<unknown> {
  const cwd = safeLocalPath(inputString(i, 'cwd'));
  const limit = String(bounded(i, 'limit', 100, 500));
  const id = inputString(i, 'id');
  const ns = safeSegment(inputString(i, 'namespace', 'default'), 'namespace');
  const name = inputString(i, 'name');
  const resource = inputString(i, 'resource', 'pods');
  let bin = '',
    args: string[] = [];
  if (provider === 'docker') {
    bin = 'docker';
    switch (action) {
      case 'ps':
        args = ['ps', '--no-trunc'];
        break;
      case 'images':
        args = ['images', '--no-trunc'];
        break;
      case 'inspect':
        args = ['inspect', safeSegment(need(i, 'id'), 'id')];
        break;
      case 'logs':
        args = ['logs', '--tail', limit, safeSegment(need(i, 'id'), 'id')];
        break;
      case 'stats':
        args = ['stats', '--no-stream', '--format', '{{json .}}'];
        break;
      case 'compose_ps':
        args = ['compose', 'ps', '--all'];
        break;
    }
  } else if (provider === 'kubectl') {
    bin = 'kubectl';
    switch (action) {
      case 'get':
        args = [
          'get',
          safeSegment(resource, 'resource'),
          ...(name ? [safeSegment(name, 'name')] : []),
          '-o',
          'wide',
          '--request-timeout=15s',
          '--chunk-size=200',
          '--namespace',
          ns,
        ];
        break;
      case 'describe':
        args = [
          'describe',
          safeSegment(need(i, 'resource'), 'resource'),
          safeSegment(need(i, 'name'), 'name'),
          '-n',
          ns,
        ];
        break;
      case 'logs':
        args = ['logs', safeSegment(need(i, 'name'), 'pod'), '-n', ns, '--tail', limit, '--timestamps'];
        break;
      case 'events':
        args = ['get', 'events', '-n', ns, '--sort-by=.lastTimestamp'];
        break;
      case 'namespaces':
        args = ['get', 'namespaces', '-o', 'wide'];
        break;
      case 'contexts':
        args = ['config', 'get-contexts', '-o', 'name'];
        break;
    }
  } else if (provider === 'terraform') {
    bin = 'terraform';
    switch (action) {
      case 'validate':
        args = ['validate', '-no-color'];
        break;
      case 'fmt_check':
        args = ['fmt', '-check', '-diff'];
        break;
      case 'show':
        args = ['show', '-no-color'];
        break;
      case 'plan_preview':
        args = ['plan', '-refresh=false', '-input=false', '-no-color', '-lock=false'];
        break;
      case 'providers':
        args = ['providers'];
        break;
      case 'workspace_show':
        args = ['workspace', 'show'];
        break;
    }
  } else {
    bin = 'npm';
    switch (action) {
      case 'audit':
        args = ['audit', '--json', '--ignore-scripts'];
        break;
      case 'outdated':
        args = ['outdated', '--json'];
        break;
      case 'list':
        args = ['ls', '--depth=0', '--json'];
        break;
      case 'package_info':
        args = ['pkg', 'get', 'name', 'version', 'scripts'];
        break;
      case 'test':
      case 'build':
        if (process.env.PRO_FETCH_ALLOW_COMMANDS !== 'true')
          throw new Error('COMMANDS_DISABLED: npm test/build uchun PRO_FETCH_ALLOW_COMMANDS=true talab qilinadi.');
        ensureMutationAllowed(i, `npm ${action}`);
        if (i.confirm !== true) throw new Error('CONFIRMATION_REQUIRED: confirm=true talab qilinadi.');
        args = ['run', action === 'test' ? 'test' : 'build', '--if-present'];
        break;
    }
  }
  if (!bin || !args.length) throw new Error('UNSUPPORTED_DEVOPS_ACTION');
  return await command(bin, args, cwd);
}

function assertReadOnlySql(sql: string): string {
  const s = sql.trim().replace(/;\s*$/, '');
  if (s.length > 50000) throw new Error('SQL_TOO_LARGE');
  if (/;/.test(s)) throw new Error('MULTI_STATEMENT_BLOCKED');
  if (/--|\/\*|\*\//.test(s)) throw new Error('SQL_COMMENTS_BLOCKED');
  if (!/^(SELECT|WITH|EXPLAIN|SHOW|DESCRIBE|DESC|PRAGMA|VALUES)\b/i.test(s))
    throw new Error('READ_ONLY_SQL_ONLY: faqat read-only SQL so‘rovlari ruxsat etiladi.');
  if (
    /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|VACUUM|REINDEX|GRANT|REVOKE|COPY|CALL|EXEC|INTO\s+(?:OUTFILE|DUMPFILE)|FOR\s+(?:UPDATE|SHARE)|LOCK\s+IN\s+SHARE|LOAD_FILE|PG_READ_FILE|PG_WRITE_FILE|PG_SLEEP|SLEEP|BENCHMARK|XP_CMDSHELL|NEXTVAL|SETVAL|SET_CONFIG|PG_ADVISORY_LOCK|DBMS_LOCK)\b/i.test(
      s,
    )
  )
    throw new Error('READ_ONLY_SQL_ONLY');
  if (
    /^PRAGMA\b/i.test(s) &&
    !/^PRAGMA\s+(?:table_info|table_xinfo|index_list|index_info|index_xinfo|foreign_key_list|foreign_key_check|integrity_check|quick_check|database_list|compile_options|foreign_keys)\b(?:\s*\([^;]*\))?$/i.test(
      s,
    )
  )
    throw new Error('READ_ONLY_SQL_ONLY: pragma bu rejimda ruxsat etilmagan.');
  if (/^PRAGMA\s+foreign_keys\s*=/i.test(s) || /^PRAGMA\s+foreign_keys\s*\(/i.test(s))
    throw new Error('READ_ONLY_SQL_ONLY');
  return s;
}
async function runDatabase(provider: string, action: string, i: Record<string, unknown>): Promise<unknown> {
  const db = inputString(i, 'database', inputString(i, 'db_path', process.env.PRO_FETCH_SQLITE_PATH || 'data.sqlite'));
  const cwd = safeLocalPath(inputString(i, 'cwd'));
  const limit = bounded(i, 'limit', 100, 1000);
  const table = inputString(i, 'table');
  if (provider === 'redis') {
    const raw = getCredential('REDIS_URL');
    if (!raw) throw new Error('CREDENTIAL_MISSING: REDIS_URL ni environment’ga qo‘shing.');
    const parsed = new URL(raw);
    if (!['redis:', 'rediss:'].includes(parsed.protocol)) throw new Error('INVALID_REDIS_URL');
    const password = decodeURIComponent(parsed.password || '');
    const cmd =
      action === 'ping'
        ? ['PING']
        : action === 'list_tables'
          ? ['SCAN', '0', 'MATCH', inputString(i, 'match', '*'), 'COUNT', String(limit)]
          : action === 'describe'
            ? ['TYPE', need(i, 'key')]
            : action === 'query'
              ? (() => {
                  const q = need(i, 'query');
                  const parts = q.split(/\s+/);
                  if (
                    !['GET', 'TTL', 'EXISTS', 'TYPE', 'PTTL', 'STRLEN', 'LLEN', 'SCARD', 'HLEN'].includes(
                      parts[0]?.toUpperCase(),
                    ) ||
                    parts.length > 2
                  )
                    throw new Error('REDIS_READ_ONLY_COMMAND_BLOCKED');
                  return parts.map((p) => safeSegment(p, 'redis_arg'));
                })()
              : action === 'explain'
                ? ['INFO', 'commandstats']
                : ['INFO', 'server'];
    const dbIndex = parsed.pathname.length > 1 ? parsed.pathname.slice(1) : '0';
    if (!/^\d+$/.test(dbIndex) || Number(dbIndex) > 2147483647) throw new Error('INVALID_REDIS_DB_INDEX');
    const args = [
      '-h',
      parsed.hostname,
      '-p',
      String(parsed.port || 6379),
      '-n',
      dbIndex,
      '--no-auth-warning',
      '--raw',
      ...(parsed.protocol === 'rediss:' ? ['--tls'] : []),
      ...(parsed.username ? ['--user', decodeURIComponent(parsed.username)] : []),
      ...cmd,
    ];
    return await command('redis-cli', args, cwd, {
      REDISCLI_AUTH: password || undefined,
    });
  }
  const url =
    provider === 'postgres'
      ? getCredential('POSTGRES_URL') || getCredential('DATABASE_URL')
      : provider === 'mysql'
        ? getCredential('MYSQL_URL') || getCredential('DATABASE_URL')
        : undefined;
  let bin = '';
  let args: string[] = [];
  let env: Record<string, string | undefined> = {};
  if (provider === 'sqlite') {
    const p = safeLocalPath(db);
    // Every statement below is read-only, and `sqliteQuery` additionally opens the database
    // read-only. A caller-supplied statement goes through `assertReadOnlySql` first, so a write
    // cannot reach the connection even if it is spelled in a way the checker has not seen.
    let sql: string;
    if (action === 'ping') sql = 'SELECT 1 AS ok';
    else if (action === 'list_tables')
      sql = "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name LIMIT " + limit;
    else if (action === 'describe') sql = `PRAGMA table_info('${safeIdent(table).replace(/'/g, "''")}')`;
    else if (action === 'query') sql = assertReadOnlySql(need(i, 'sql'));
    else if (action === 'explain') sql = 'EXPLAIN QUERY PLAN ' + assertReadOnlySql(need(i, 'sql'));
    else sql = 'SELECT sqlite_version() AS version';
    return await sqliteQuery(p, sql);
  }
  if (!url)
    throw new Error(
      `CREDENTIAL_MISSING: ${provider === 'postgres' ? 'POSTGRES_URL' : 'MYSQL_URL'} yoki DATABASE_URL talab qilinadi.`,
    );
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('INVALID_DATABASE_URL: connection URL format noto‘g‘ri.');
  }
  if (provider === 'postgres') {
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol))
      throw new Error('INVALID_DATABASE_URL: PostgreSQL URL postgres:// bo‘lishi kerak.');
    bin = 'psql';
    const user = decodeURIComponent(parsed.username),
      password = decodeURIComponent(parsed.password),
      database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
    env = {
      PGHOST: parsed.hostname,
      PGPORT: parsed.port || '5432',
      PGUSER: user || undefined,
      PGPASSWORD: password || undefined,
      PGDATABASE: database || undefined,
      PGSSLMODE: parsed.searchParams.get('sslmode') || undefined,
      PGAPPNAME: 'pro-fetch-mcp',
    };
    const q =
      action === 'ping'
        ? 'SELECT 1 AS ok'
        : action === 'list_tables'
          ? `SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' ORDER BY 1,2 LIMIT ${limit}`
          : action === 'describe'
            ? `SELECT column_name,data_type,is_nullable FROM information_schema.columns WHERE table_name='${safeIdent(table).replace(/'/g, "''")}' ORDER BY ordinal_position`
            : action === 'query'
              ? assertReadOnlySql(need(i, 'sql'))
              : action === 'explain'
                ? 'EXPLAIN ' + assertReadOnlySql(need(i, 'sql'))
                : 'SELECT version()';
    args = [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '--no-psqlrc',
      '-h',
      parsed.hostname,
      '-p',
      parsed.port || '5432',
      '-U',
      user,
      '-d',
      database,
      '-P',
      'pager=off',
      '-A',
      '-t',
      '-c',
      `BEGIN READ ONLY; ${q}; COMMIT;`,
    ];
    return await command(bin, args, cwd, env);
  }
  if (!['mysql:', 'mariadb:'].includes(parsed.protocol))
    throw new Error('INVALID_DATABASE_URL: MySQL URL mysql:// yoki mariadb:// bo‘lishi kerak.');
  bin = 'mysql';
  const user = decodeURIComponent(parsed.username),
    password = decodeURIComponent(parsed.password),
    database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const q =
    action === 'ping'
      ? 'SELECT 1 AS ok'
      : action === 'list_tables'
        ? 'SHOW TABLES'
        : action === 'describe'
          ? `DESCRIBE \`${safeIdent(table).replace(/`/g, '')}\``
          : action === 'query'
            ? assertReadOnlySql(need(i, 'sql'))
            : action === 'explain'
              ? 'EXPLAIN ' + assertReadOnlySql(need(i, 'sql'))
              : 'SELECT VERSION()';
  // Avoid putting DB passwords in process arguments. mysql's --defaults-extra-file must be first.
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'pro-fetch-mysql-'));
  try {
    const optionFile = path.join(tmpDir, 'client.cnf');
    const quote = (value: string) =>
      '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
    const config = `[client]\nhost=${quote(parsed.hostname)}\nport=${Number(parsed.port || 3306)}\nuser=${quote(user)}\npassword=${quote(password)}\ndatabase=${quote(database)}\nprotocol=TCP\n`;
    await writeFile(optionFile, config, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    try {
      await chmod(optionFile, 0o600);
    } catch {
      /* Windows ACLs use inherited user permissions. */
    }
    const readOnlyQuery = ['query', 'explain'].includes(action) ? `START TRANSACTION READ ONLY; ${q}; COMMIT;` : q;
    return await command(
      bin,
      [`--defaults-extra-file=${optionFile}`, '--batch', '--raw', '--skip-column-names', '--execute=' + readOnlyQuery],
      cwd,
      env,
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ['github', /\bgithub_pat_[A-Za-z0-9_]{20,}|\bgh[pousr]_[A-Za-z0-9]{20,}/g],
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['aws_access_key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['bearer', /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/gi],
  ['generic_api_key', /(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9_./+=:-]{16,}/gi],
  ['slack', /\bxox[baprs]-[A-Za-z0-9-]{20,}/g],
  ['google_key', /\bAIza[0-9A-Za-z_-]{30,}/g],
];
function scanSecrets(text: string): Array<{ type: string; line: number; redacted: string }> {
  const hits: Array<{ type: string; line: number; redacted: string }> = [];
  for (const [type, re] of SECRET_PATTERNS) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const offset = m.index ?? 0;
      hits.push({
        type,
        line: text.slice(0, offset).split('\n').length,
        redacted: '[REDACTED]',
      });
      if (hits.length >= 200) return hits;
    }
  }
  return hits.sort((a, b) => a.line - b.line);
}
async function listFiles(root: string, recursive = true, limit = 1000): Promise<string[]> {
  const out: string[] = [];
  const ignored = new Set(['.git', 'node_modules', 'dist', '.next', 'coverage', '.pro-fetch-cache', '.pro-fetch-data']);
  async function visit(dir: string): Promise<void> {
    if (out.length >= limit) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (out.length >= limit) return;
      const hiddenSecretFile = ent.isFile() && /^\.(?:env(?:\..+)?|npmrc|pypirc|netrc|dockerenv)$/i.test(ent.name);
      if (ent.name.startsWith('.') && ent.name !== '.env.example' && !hiddenSecretFile) continue;
      if (ignored.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (recursive) await visit(full);
      } else if (ent.isFile()) {
        out.push(full);
      }
    }
  }
  await visit(root);
  return out;
}
async function runSecurity(action: string, i: Record<string, unknown>): Promise<unknown> {
  if (action === 'osv_query' || action === 'package_advisories') {
    const pkg = need(i, 'package'),
      version = need(i, 'version'),
      ecosystem = inputString(i, 'ecosystem', 'npm');
    return await httpJson('https://api.osv.dev/v1/query', {
      method: 'POST',
      body: JSON.stringify({ package: { name: pkg, ecosystem }, version }),
      headers: { 'content-type': 'application/json' },
    });
  }
  if (action === 'osv_batch') {
    const raw = need(i, 'body');
    if (Buffer.byteLength(raw) > 1024 * 1024) throw new Error('INPUT_TOO_LARGE: OSV batch body 1 MiB dan katta.');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('INVALID_JSON');
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      !Array.isArray((parsed as { queries?: unknown }).queries)
    )
      throw new Error('INVALID_OSV_BATCH: {queries: []} object talab qilinadi.');
    const queries = (parsed as { queries: unknown[] }).queries;
    if (queries.length < 1 || queries.length > 1000)
      throw new Error('INVALID_OSV_BATCH: queries soni 1-1000 oralig‘ida bo‘lishi kerak.');
    for (const q of queries) {
      if (!q || typeof q !== 'object' || Array.isArray(q))
        throw new Error('INVALID_OSV_BATCH: har bir query object bo‘lishi kerak.');
      const item = q as Record<string, unknown>;
      if (
        item.package !== undefined &&
        (!item.package || typeof item.package !== 'object' || Array.isArray(item.package))
      )
        throw new Error('INVALID_OSV_BATCH: package object bo‘lishi kerak.');
      if (item.version !== undefined && typeof item.version !== 'string')
        throw new Error('INVALID_OSV_BATCH: version string bo‘lishi kerak.');
    }
    return await httpJson('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      body: JSON.stringify(parsed),
    });
  }
  if (['npm_audit', 'npm_outdated', 'license_report', 'sbom'].includes(action)) {
    const cwd = safeLocalPath(inputString(i, 'cwd'));
    if (action === 'npm_audit') return await command('npm', ['audit', '--json', '--ignore-scripts'], cwd);
    if (action === 'npm_outdated') return await command('npm', ['outdated', '--json'], cwd);
    if (action === 'license_report') {
      const r = await command('npm', ['ls', '--json', '--all'], cwd);
      const data = JSON.parse(r.stdout || '{}');
      const rows: Array<Record<string, unknown>> = [];
      const walk = (deps: unknown) => {
        if (!deps || typeof deps !== 'object') return;
        for (const [name, d] of Object.entries(deps as Record<string, unknown>)) {
          if (d && typeof d === 'object') {
            const v = d as Record<string, unknown>;
            rows.push({ name, version: v.version, license: v.license });
            walk(v.dependencies);
          }
        }
      };
      walk(data.dependencies);
      return { count: rows.length, packages: rows.slice(0, 2000) };
    }
    const raw = await readFile(path.join(cwd, 'package-lock.json'), 'utf8').catch(() => '{"packages":{}}');
    const lock = JSON.parse(raw) as {
      packages?: Record<string, { version?: string; integrity?: string; license?: string }>;
    };
    const packages = Object.entries(lock.packages || {})
      .filter(([k]) => k.includes('node_modules/'))
      .map(([k, v]) => ({
        name: k.split('node_modules/').pop(),
        version: v.version,
        integrity: v.integrity,
        license: v.license,
      }));
    return {
      bomFormat: 'CycloneDX-compatible-inventory',
      specVersion: '1.5',
      metadata: {
        timestamp: new Date().toISOString(),
        tools: [{ name: 'pro-fetch' }],
      },
      components: packages.slice(0, 10000).map((p) => ({ ...p, type: 'library' })),
    };
  }
  if (action.startsWith('secret_scan')) {
    let text = '';
    if (action === 'secret_scan_text' || action === 'secret_scan_json') text = need(i, 'text');
    else if (action === 'secret_scan_diff')
      text = (await command('git', ['diff', '--no-ext-diff'], safeLocalPath(inputString(i, 'cwd')))).stdout;
    else {
      const root = safeLocalPath(inputString(i, 'path'));
      const files = await listFiles(root, i.recursive !== false, 1000);
      const results: Array<{
        file: string;
        matches: Array<{ type: string; line: number; redacted: string }>;
      }> = [];
      for (const file of files) {
        if ((await stat(file)).size > 1_000_000) continue;
        const content = await readFile(file, 'utf8').catch(() => '');
        const matches = scanSecrets(content);
        if (matches.length) results.push({ file: path.relative(workspaceRoot(), file), matches });
        if (results.length >= 200) break;
      }
      return { files_scanned: files.length, matches: results };
    }
    return {
      matches: scanSecrets(text),
      note: 'Heuristic scanner; false positives and false negatives are possible. Secret values are never returned.',
    };
  }
  if (action === 'dependency_files' || action === 'exposed_metadata') {
    const root = safeLocalPath(inputString(i, 'path'));
    const files = await listFiles(root, i.recursive !== false, 2000);
    const matched = files.filter((f) =>
      action === 'dependency_files'
        ? /(?:package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|poetry\.lock|Cargo\.lock|go\.mod|go\.sum|Gemfile\.lock|pom\.xml|gradle\.lockfile)$/i.test(
            path.basename(f),
          )
        : /^(?:\.env(?:\..+)?|.*\.(?:pem|key|p12|pfx))$/i.test(path.basename(f)) ||
          /(?:\.npmrc|\.pypirc|credentials|secrets?\.ya?ml)$/i.test(path.basename(f)),
    );
    return {
      count: matched.length,
      files: matched.map((f) => path.relative(workspaceRoot(), f)),
    };
  }
  if (action === 'lockfile_packages') {
    const p = safeLocalPath(inputString(i, 'path', 'package-lock.json'));
    const content = await readFile(p, 'utf8');
    if (p.endsWith('.json')) {
      const data = JSON.parse(content) as {
        packages?: Record<string, { version?: string }>;
      };
      return Object.entries(data.packages || {})
        .filter(([k]) => k.includes('node_modules/'))
        .slice(0, 5000)
        .map(([k, v]) => ({
          name: k.split('node_modules/').pop(),
          version: v.version,
        }));
    }
    return content.split('\n').filter(Boolean).slice(0, 5000);
  }
  if (
    action === 'headers_audit' ||
    action === 'tls_audit' ||
    action === 'cors_audit' ||
    action === 'csp_audit' ||
    action === 'redirect_audit' ||
    action === 'cookie_audit' ||
    action === 'security_txt' ||
    action === 'robots_audit' ||
    action === 'dns_audit' ||
    action === 'url_audit' ||
    action === 'exposed_metadata'
  ) {
    const raw = need(i, 'url');
    const safe = await assertSafeUrl(raw);
    if (action === 'url_audit')
      return {
        url: safe.toString(),
        protocol: safe.protocol,
        host: safe.hostname,
        allowed: true,
        policy: 'public HTTP(S) only; resolved-address checks applied',
      };
    if (action === 'dns_audit')
      return {
        url: safe.toString(),
        host: safe.hostname,
        validated: 'assertSafeUrl rejects private and special-purpose DNS resolutions',
        note: 'This reports the policy preflight; it does not claim DNS pinning.',
      };
    if (action === 'security_txt' || action === 'robots_audit') {
      safe.pathname = action === 'security_txt' ? '/.well-known/security.txt' : '/robots.txt';
      safe.search = '';
      safe.hash = '';
    }
    const res = await fetchWithOptions(safe.toString(), {
      method: 'GET',
      cache: false,
      maxBytes: 150_000,
      retries: 0,
    });
    const h = res.headers;
    const security = {
      status: res.status,
      finalUrl: safe.toString(),
      headers: h,
    };
    if (action === 'headers_audit' || action === 'tls_audit')
      return {
        ...security,
        checks: {
          hsts: Boolean(h['strict-transport-security']),
          csp: Boolean(h['content-security-policy']),
          xContentTypeOptions: Boolean(h['x-content-type-options']),
          frameProtection: Boolean(h['x-frame-options'] || h['content-security-policy']?.includes('frame-ancestors')),
          referrerPolicy: Boolean(h['referrer-policy']),
          permissionsPolicy: Boolean(h['permissions-policy']),
        },
        tls_note:
          safe.protocol === 'https:'
            ? 'HTTPS request completed; certificate chain details are not exposed by fetch client.'
            : 'Not HTTPS',
      };
    if (action === 'cors_audit')
      return {
        status: res.status,
        allowOrigin: h['access-control-allow-origin'] || null,
        allowCredentials: h['access-control-allow-credentials'] || null,
        allowMethods: h['access-control-allow-methods'] || null,
        allowHeaders: h['access-control-allow-headers'] || null,
      };
    if (action === 'csp_audit')
      return {
        status: res.status,
        csp: h['content-security-policy'] || null,
        reportOnly: h['content-security-policy-report-only'] || null,
      };
    if (action === 'redirect_audit')
      return {
        status: res.status,
        location: h.location || null,
        finalUrl: safe.toString(),
        note: 'Redirect chain detail is only reported where provided by HTTP client metadata.',
      };
    if (action === 'cookie_audit')
      return {
        status: res.status,
        cookieHeaderVisible: Boolean(h['set-cookie']),
        note: 'Set-Cookie values are intentionally removed from output; use browser audit tooling for attributes.',
      };
    return {
      status: res.status,
      url: safe.toString(),
      text: res.text.slice(0, 100000),
    };
  }
  throw new Error('UNSUPPORTED_SECURITY_ACTION');
}

const knowledgeFile = () =>
  path.resolve(process.env.PRO_FETCH_KNOWLEDGE_DB || path.join(os.homedir(), '.pro-fetch', 'knowledge.json'));
async function readKnowledge(): Promise<Array<Record<string, unknown>>> {
  const p = knowledgeFile();
  try {
    const x = JSON.parse(await readFile(p, 'utf8'));
    return Array.isArray(x) ? (x.filter((v) => v && typeof v === 'object') as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}
async function writeKnowledge(docs: Array<Record<string, unknown>>): Promise<void> {
  const p = knowledgeFile();
  await mkdir(path.dirname(p), { recursive: true });
  const tmp = p + '.' + randomUUID() + '.tmp';
  await writeFile(tmp, JSON.stringify(docs, null, 2), 'utf8');
  await (await import('node:fs/promises')).rename(tmp, p);
}
function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) || []).filter(
    (t) =>
      ![
        'the',
        'and',
        'for',
        'with',
        'this',
        'that',
        'from',
        'have',
        'are',
        'not',
        'you',
        'but',
        'per',
        'dan',
        'uchun',
        'bilan',
        'yoki',
      ].includes(t),
  );
}
async function createEmbedding(text: string): Promise<{
  vector?: number[];
  status: 'disabled' | 'ready' | 'unavailable';
}> {
  const token = getCredential('OPENAI_API_KEY');
  if (!token) return { status: 'disabled' };
  const base = (
    process.env.OPENAI_EMBEDDINGS_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'
  ).replace(/\/+$/, '');
  const endpoint = /\/v\d+$/i.test(base) ? `${base}/embeddings` : `${base}/v1/embeddings`;
  try {
    const data = await httpJson(endpoint, {
      method: 'POST',
      token,
      body: JSON.stringify({
        model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
        input: text.slice(0, 8000),
      }),
      maxBytes: 2_000_000,
    });
    const vector = (data as { data?: Array<{ embedding?: unknown }> })?.data?.[0]?.embedding;
    if (
      !Array.isArray(vector) ||
      !vector.length ||
      vector.length > 4096 ||
      !vector.every((x) => typeof x === 'number' && Number.isFinite(x))
    )
      return { status: 'unavailable' };
    return { vector: vector as number[], status: 'ready' };
  } catch {
    return { status: 'unavailable' };
  }
}
function cosine(a: unknown, b: unknown): number | undefined {
  if (
    !Array.isArray(a) ||
    !Array.isArray(b) ||
    a.length === 0 ||
    a.length !== b.length ||
    !a.every((x) => typeof x === 'number') ||
    !b.every((x) => typeof x === 'number')
  )
    return undefined;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let j = 0; j < a.length; j++) {
    dot += (a[j] as number) * (b[j] as number);
    na += (a[j] as number) ** 2;
    nb += (b[j] as number) ** 2;
  }
  return na > 0 && nb > 0 ? Math.max(0, Math.min(1, dot / Math.sqrt(na * nb))) : undefined;
}
async function runKnowledge(action: string, i: Record<string, unknown>): Promise<unknown> {
  let docs = await readKnowledge();
  const now = new Date().toISOString();
  if (action === 'ingest' || action === 'ingest_url') {
    ensureMutationAllowed(i, `knowledge ${action}`);
    let content = inputString(i, 'content');
    let source = inputString(i, 'source');
    let title = inputString(i, 'title', '');
    if (action === 'ingest_url') {
      const u = need(i, 'url');
      const res = await fetchWithOptions(u, {
        cache: false,
        maxBytes: 1_000_000,
      });
      content = res.text;
      source = u;
      if (!title) title = u;
    }
    if (!content.trim()) throw new Error('MISSING_INPUT: content required');
    if (Buffer.byteLength(content) > 1_000_000) throw new Error('CONTENT_TOO_LARGE');
    const embedding = await createEmbedding(`${title}\n${content}`);
    const id = createHash('sha256').update(`${source}\n${title}\n${content}`).digest('hex').slice(0, 24);
    const doc = {
      id,
      title: title || 'Untitled',
      source,
      content,
      ...(embedding.vector ? { embedding: embedding.vector } : {}),
      tags: Array.isArray(i.tags) ? i.tags.filter((x) => typeof x === 'string').slice(0, 50) : [],
      createdAt: now,
      updatedAt: now,
    };
    docs = docs.filter((d) => d.id !== id);
    docs.unshift(doc);
    await writeKnowledge(docs.slice(0, 10000));
    return {
      id,
      title: doc.title,
      stored: true,
      bytes: Buffer.byteLength(content),
      count: docs.length,
      embeddingStatus:
        embedding.status === 'ready'
          ? 'stored'
          : embedding.status === 'disabled'
            ? 'lexical-only-no-api-key'
            : 'lexical-only-embedding-provider-unavailable',
    };
  }
  if (action === 'get') {
    const id = need(i, 'document_id');
    const doc = docs.find((d) => d.id === id);
    if (!doc) throw new Error('NOT_FOUND: document not indexed');
    const { embedding, ...publicDoc } = doc;
    return publicDoc;
  }
  if (action === 'list')
    return {
      count: docs.length,
      documents: docs
        .slice(Math.max(0, Number(i.offset) || 0), Math.max(0, Number(i.offset) || 0) + bounded(i, 'limit', 50, 200))
        .map(({ content, embedding, ...d }) => ({
          ...d,
          contentBytes: Buffer.byteLength(String(content || '')),
          embeddingStored: Array.isArray(embedding),
        })),
    };
  if (action === 'search' || action === 'rank') {
    const query = need(i, 'query');
    const q = tokens(query);
    const queryEmbedding = await createEmbedding(query);
    const found = docs
      .map((d) => {
        const t = tokens(
          `${d.title || ''} ${d.source || ''} ${d.content || ''} ${((d.tags as string[]) || []).join(' ')}`,
        );
        const set = new Set(t);
        const matched = q.filter((w) => set.has(w));
        const lexical = q.length ? matched.length / q.length : 0;
        const semantic = queryEmbedding.vector ? cosine(queryEmbedding.vector, d.embedding) : undefined;
        const score = semantic === undefined ? lexical : 0.35 * lexical + 0.65 * semantic;
        return {
          id: d.id,
          title: d.title,
          source: d.source,
          score,
          lexicalScore: lexical,
          ...(semantic === undefined ? {} : { semanticScore: semantic }),
          matchedTerms: matched,
          snippet: String(d.content || '').slice(0, 700),
        };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return {
      query,
      count: found.length,
      results: found.slice(0, bounded(i, 'limit', 10, 100)),
      ranking: queryEmbedding.vector
        ? 'hybrid semantic embeddings + lexical overlap'
        : queryEmbedding.status === 'disabled'
          ? 'normalized lexical overlap; set OPENAI_API_KEY and OPENAI_EMBEDDING_MODEL for hybrid retrieval'
          : 'normalized lexical overlap; embedding provider unavailable',
      embeddingStatus: queryEmbedding.status,
    };
  }
  if (action === 'delete') {
    ensureMutationAllowed(i, 'knowledge delete');
    const id = need(i, 'document_id');
    const old = docs.length;
    docs = docs.filter((d) => d.id !== id);
    if (old === docs.length) throw new Error('NOT_FOUND');
    await writeKnowledge(docs);
    return { deleted: true, count: docs.length };
  }
  if (action === 'stats')
    return {
      count: docs.length,
      bytes: docs.reduce((s, d) => s + Buffer.byteLength(String(d.content || '')), 0),
      path: knowledgeFile(),
      tags: [...new Set(docs.flatMap((d) => (Array.isArray(d.tags) ? (d.tags as string[]) : [])))].slice(0, 500),
    };
  if (action === 'rebuild')
    return {
      rebuilt: true,
      documents: docs.length,
      index: 'lexical index calculated on demand; no stale external index',
      timestamp: now,
    };
  if (action === 'chunk') {
    const text = need(i, 'text');
    const size = Math.max(200, Math.min(6000, Number(i.amount) || 1200));
    const overlap = Math.min(300, Math.floor(size / 5));
    const chunks: Array<{ index: number; text: string }> = [];
    for (let start = 0; start < text.length && chunks.length < 2000; start += size - overlap)
      chunks.push({
        index: chunks.length,
        text: text.slice(start, start + size),
      });
    return { count: chunks.length, size, overlap, chunks };
  }
  if (action === 'summarize') {
    const text = need(i, 'text');
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    const terms = new Map<string, number>();
    for (const t of tokens(text)) terms.set(t, (terms.get(t) || 0) + 1);
    const ranked = sentences
      .map((s, index) => ({
        s,
        index,
        score: tokens(s).reduce((sum, t) => sum + (terms.get(t) || 0), 0) / Math.max(1, tokens(s).length),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(10, Number(i.amount) || 5)))
      .sort((a, b) => a.index - b.index);
    return {
      summary: ranked.map((x) => x.s).join(' '),
      method: 'extractive term-frequency ranking; not an LLM summary',
    };
  }
  if (action === 'citation_extract' || action === 'validate_citations') {
    const text = need(i, 'text');
    const urls = [...new Set(text.match(/https?:\/\/[^\s<>"')\]]+/g) || [])].slice(0, bounded(i, 'limit', 50, 200));
    if (action === 'citation_extract') return { count: urls.length, urls };
    const results = [];
    for (const url of urls) {
      try {
        const r = await fetchWithOptions(url, {
          method: 'HEAD',
          cache: false,
          retries: 0,
          timeoutMs: 6000,
          maxBytes: 1024,
        });
        results.push({ url, status: r.status, ok: r.status < 400 });
      } catch (e) {
        results.push({
          url,
          ok: false,
          error: e instanceof Error ? e.message : 'unavailable',
        });
      }
    }
    return { count: results.length, results };
  }
  if (action === 'dedupe') {
    const groups = new Map<string, string[]>();
    for (const d of docs) {
      const hash = createHash('sha256')
        .update(
          String(d.content || '')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase(),
        )
        .digest('hex');
      groups.set(hash, [...(groups.get(hash) || []), String(d.id)]);
    }
    return {
      duplicateGroups: [...groups.values()].filter((x) => x.length > 1),
      count: docs.length,
    };
  }
  if (action === 'export')
    return {
      version: 1,
      exportedAt: now,
      documents: docs.slice(0, bounded(i, 'limit', 1000, 10000)),
    };
  if (action === 'import') {
    ensureMutationAllowed(i, 'knowledge import');
    const parsed = JSON.parse(need(i, 'text'));
    const incoming = Array.isArray(parsed) ? parsed : (parsed as { documents?: unknown })?.documents;
    if (!Array.isArray(incoming)) throw new Error('INVALID_IMPORT: expected array or {documents: []}');
    for (const x of incoming.slice(0, 1000)) {
      if (!x || typeof x !== 'object' || typeof (x as Record<string, unknown>).content !== 'string') continue;
      const d = x as Record<string, unknown>;
      docs.unshift({
        id: typeof d.id === 'string' ? d.id : randomUUID(),
        title: String(d.title || 'Imported'),
        content: String(d.content).slice(0, 1_000_000),
        source: String(d.source || ''),
        tags: Array.isArray(d.tags) ? d.tags.filter((t) => typeof t === 'string').slice(0, 50) : [],
        updatedAt: now,
      });
    }
    const seen = new Set<string>();
    docs = docs
      .filter((d) => {
        const id = String(d.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 10000);
    await writeKnowledge(docs);
    return { imported: incoming.length, stored: docs.length };
  }
  if (action === 'tag') {
    ensureMutationAllowed(i, 'knowledge tag');
    const id = need(i, 'document_id');
    const doc = docs.find((d) => d.id === id);
    if (!doc) throw new Error('NOT_FOUND');
    doc.tags = Array.isArray(i.tags) ? i.tags.filter((x) => typeof x === 'string').slice(0, 50) : [];
    doc.updatedAt = now;
    await writeKnowledge(docs);
    return { updated: true, id, tags: doc.tags };
  }
  if (action === 'update') {
    ensureMutationAllowed(i, 'knowledge update');
    const id = need(i, 'document_id');
    const doc = docs.find((d) => d.id === id);
    if (!doc) throw new Error('NOT_FOUND');
    if (typeof i.title === 'string') {
      if (Buffer.byteLength(i.title) > 10000) throw new Error('INPUT_TOO_LARGE: title 10 KiB dan katta.');
      doc.title = i.title;
    }
    if (typeof i.content === 'string') {
      if (Buffer.byteLength(i.content) > 1024 * 1024)
        throw new Error('INPUT_TOO_LARGE: knowledge content 1 MiB dan katta.');
      doc.content = i.content;
    }
    doc.updatedAt = now;
    await writeKnowledge(docs);
    return { updated: true, id };
  }
  throw new Error('UNSUPPORTED_KNOWLEDGE_ACTION');
}

async function runCollaboration(provider: string, action: string, i: Record<string, unknown>): Promise<unknown> {
  const q = inputString(i, 'query');
  const limit = bounded(i, 'limit', 20, 100);
  const tokenName: Record<string, string> = {
    slack: 'SLACK_BOT_TOKEN',
    linear: 'LINEAR_API_KEY',
    jira: 'JIRA_TOKEN',
    notion: 'NOTION_TOKEN',
  };
  const token = getCredential(tokenName[provider]);
  if (!token)
    throw new Error(`CREDENTIAL_MISSING: ${tokenName[provider]} yoki ${tokenName[provider]}_FILE talab qilinadi.`);
  if (provider === 'slack') {
    const base = 'https://slack.com/api/';
    let method = 'GET',
      endpoint = '',
      body: string | undefined;
    switch (action) {
      case 'search':
        endpoint = `search.messages?query=${encodeURIComponent(need(i, 'query'))}&count=${limit}`;
        break;
      case 'channels':
        endpoint = `conversations.list?limit=${limit}&types=public_channel,private_channel`;
        break;
      case 'history':
        endpoint = `conversations.history?channel=${encodeURIComponent(need(i, 'channel'))}&limit=${limit}`;
        break;
      case 'users':
        endpoint = `users.list?limit=${limit}`;
        break;
      case 'user_get':
        endpoint = `users.info?user=${encodeURIComponent(need(i, 'id'))}`;
        break;
      case 'post_message':
        ensureMutationAllowed(i, 'Slack postMessage');
        method = 'POST';
        endpoint = 'chat.postMessage';
        body = JSON.stringify({
          channel: need(i, 'channel'),
          text: need(i, 'message'),
        });
        break;
      case 'replies':
        endpoint = `conversations.replies?channel=${encodeURIComponent(need(i, 'channel'))}&ts=${encodeURIComponent(need(i, 'id'))}&limit=${limit}`;
        break;
    }
    const data = await httpJson(base + endpoint, {
      method,
      token,
      body,
      headers: provider === 'slack' ? { authorization: `Bearer ${token}` } : {},
    });
    if ((data as { ok?: boolean })?.ok === false)
      throw new Error('SLACK_API_ERROR: ' + String((data as { error?: string }).error || 'unknown'));
    return data;
  }
  if (provider === 'linear') {
    const gql: Record<string, { query: string; variables: Record<string, unknown> }> = {
      search: {
        query: 'query Search($term:String!){ search(term:$term, first:50){ nodes { id identifier title url } } }',
        variables: { term: need(i, 'query') },
      },
      issue_get: {
        query: 'query Issue($id:String!){ issue(id:$id){ id identifier title description url state { name } } }',
        variables: { id: need(i, 'issue_id') },
      },
      issues: {
        query: 'query Issues($first:Int!){ issues(first:$first){ nodes { id identifier title url state { name } } } }',
        variables: { first: limit },
      },
      teams: {
        query: 'query Teams { teams { nodes { id name key } } }',
        variables: {},
      },
      users: {
        query: 'query Users { users { nodes { id name email } } }',
        variables: {},
      },
      issue_create: {
        query:
          'mutation IssueCreate($input:IssueCreateInput!){ issueCreate(input:$input){ success issue { id identifier title url } } }',
        variables: {
          input: {
            teamId: need(i, 'team_id'),
            title: need(i, 'title'),
            description: inputString(i, 'description'),
          },
        },
      },
      issue_update: {
        query:
          'mutation IssueUpdate($id:String!,$input:IssueUpdateInput!){ issueUpdate(id:$id,input:$input){ success issue { id identifier title url } } }',
        variables: {
          id: need(i, 'issue_id'),
          input: {
            ...(typeof i.title === 'string' ? { title: i.title } : {}),
            ...(typeof i.description === 'string' ? { description: i.description } : {}),
          },
        },
      },
    };
    const spec = gql[action];
    if (!spec) throw new Error('UNSUPPORTED_LINEAR_ACTION');
    if (['issue_create', 'issue_update'].includes(action)) ensureMutationAllowed(i, `Linear ${action}`);
    const data = await httpJson('https://api.linear.app/graphql', {
      method: 'POST',
      token,
      body: JSON.stringify(spec),
      headers: { authorization: token },
    });
    if ((data as { errors?: unknown[] })?.errors?.length)
      throw new Error('LINEAR_GRAPHQL_ERROR: ' + JSON.stringify((data as { errors: unknown[] }).errors).slice(0, 500));
    return data;
  }
  if (provider === 'jira') {
    const base = (await assertSafeUrl(need({ base: process.env.JIRA_BASE_URL }, 'base'))).toString().replace(/\/$/, '');
    const email = getCredential('JIRA_EMAIL');
    if (!email) throw new Error('CREDENTIAL_MISSING: Jira API uchun JIRA_EMAIL ham talab qilinadi.');
    const auth = Buffer.from(`${email}:${token}`).toString('base64');
    let method = 'GET',
      endpoint = '',
      body: string | undefined;
    switch (action) {
      case 'search':
        endpoint = `/rest/api/3/search?jql=${encodeURIComponent(need(i, 'query'))}&maxResults=${limit}`;
        break;
      case 'issue_get':
        endpoint = `/rest/api/3/issue/${encodeURIComponent(need(i, 'issue_id'))}`;
        break;
      case 'projects':
        endpoint = `/rest/api/3/project/search?maxResults=${limit}`;
        break;
      case 'comments':
        endpoint = `/rest/api/3/issue/${encodeURIComponent(need(i, 'issue_id'))}/comment?maxResults=${limit}`;
        break;
      case 'issue_create':
        ensureMutationAllowed(i, 'Jira create issue');
        method = 'POST';
        endpoint = '/rest/api/3/issue';
        body = JSON.stringify({
          fields: {
            project: { key: need(i, 'project') },
            summary: need(i, 'title'),
            description: {
              type: 'doc',
              version: 1,
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: inputString(i, 'description') }],
                },
              ],
            },
            issuetype: { name: 'Task' },
          },
        });
        break;
      case 'issue_update':
        ensureMutationAllowed(i, 'Jira update issue');
        method = 'PUT';
        endpoint = `/rest/api/3/issue/${encodeURIComponent(need(i, 'issue_id'))}`;
        body = JSON.stringify({
          fields: {
            ...(typeof i.title === 'string' ? { summary: i.title } : {}),
            ...(typeof i.description === 'string'
              ? {
                  description: {
                    type: 'doc',
                    version: 1,
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: i.description }],
                      },
                    ],
                  },
                }
              : {}),
          },
        });
        break;
      case 'transitions':
        endpoint = `/rest/api/3/issue/${encodeURIComponent(need(i, 'issue_id'))}/transitions`;
        break;
    }
    return await httpJson(base + endpoint, {
      method,
      body,
      headers: { authorization: `Basic ${auth}` },
    });
  }
  // Notion API
  const base = 'https://api.notion.com/v1';
  const headers = { 'Notion-Version': '2022-06-28' };
  let method = 'GET',
    endpoint = '',
    body: string | undefined;
  switch (action) {
    case 'search':
      method = 'POST';
      endpoint = '/search';
      body = JSON.stringify({ query: need(i, 'query'), page_size: limit });
      break;
    case 'page_get':
      endpoint = `/pages/${encodeURIComponent(need(i, 'page_id'))}`;
      break;
    case 'database_query':
      method = 'POST';
      endpoint = `/databases/${encodeURIComponent(need(i, 'database_id'))}/query`;
      body = JSON.stringify({ page_size: limit });
      break;
    case 'block_children':
      endpoint = `/blocks/${encodeURIComponent(need(i, 'page_id'))}/children?page_size=${limit}`;
      break;
    case 'page_create': {
      ensureMutationAllowed(i, 'Notion create page');
      const dbId = need(i, 'database_id');
      const db = await httpJson(`${base}/databases/${encodeURIComponent(dbId)}`, { token, headers });
      const properties = (db as { properties?: Record<string, { type?: string }> }).properties || {};
      const titleKey = Object.keys(properties).find((key) => properties[key]?.type === 'title');
      if (!titleKey) throw new Error('NOTION_TITLE_PROPERTY_NOT_FOUND: database’da title property yo‘q.');
      method = 'POST';
      endpoint = '/pages';
      body = JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          [titleKey]: { title: [{ text: { content: need(i, 'title') } }] },
        },
        ...(i.content
          ? {
              children: [
                {
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: [
                      {
                        type: 'text',
                        text: { content: String(i.content).slice(0, 2000) },
                      },
                    ],
                  },
                },
              ],
            }
          : {}),
      });
      break;
    }
    case 'page_update': {
      ensureMutationAllowed(i, 'Notion update page');
      const pageId = need(i, 'page_id');
      const page = await httpJson(`${base}/pages/${encodeURIComponent(pageId)}`, { token, headers });
      const properties = (page as { properties?: Record<string, { type?: string }> }).properties || {};
      const titleKey = Object.keys(properties).find((key) => properties[key]?.type === 'title');
      if (!titleKey) throw new Error('NOTION_TITLE_PROPERTY_NOT_FOUND: page’da title property yo‘q.');
      method = 'PATCH';
      endpoint = `/pages/${encodeURIComponent(pageId)}`;
      body = JSON.stringify({
        properties: {
          [titleKey]: { title: [{ text: { content: need(i, 'title') } }] },
        },
      });
      break;
    }
    case 'page_archive':
      ensureMutationAllowed(i, 'Notion archive page');
      method = 'PATCH';
      endpoint = `/pages/${encodeURIComponent(need(i, 'page_id'))}`;
      body = JSON.stringify({ archived: true });
      break;
  }
  return await httpJson(base + endpoint, { method, token, body, headers });
}

async function runStorage(provider: string, action: string, i: Record<string, unknown>): Promise<unknown> {
  const tokenName: Record<string, string> = {
    dropbox: 'DROPBOX_TOKEN',
    google_drive: 'GOOGLE_DRIVE_TOKEN',
    onedrive: 'MICROSOFT_GRAPH_TOKEN',
  };
  const token = provider === 's3' ? undefined : getCredential(tokenName[provider]);
  if (provider !== 's3' && !token)
    throw new Error(`CREDENTIAL_MISSING: ${tokenName[provider]} yoki ${tokenName[provider]}_FILE talab qilinadi.`);
  if (provider === 'dropbox') {
    const p = inputString(i, 'path', '');
    if (action === 'list')
      return httpJson('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        token,
        body: JSON.stringify({
          path: p,
          recursive: false,
          limit: bounded(i, 'limit', 100, 2000),
        }),
      });
    if (action === 'search')
      return httpJson('https://api.dropboxapi.com/2/files/search_v2', {
        method: 'POST',
        token,
        body: JSON.stringify({
          query: need(i, 'query'),
          options: { max_results: bounded(i, 'limit', 100, 200) },
        }),
      });
    if (action === 'get')
      return httpJson('https://api.dropboxapi.com/2/files/get_metadata', {
        method: 'POST',
        token,
        body: JSON.stringify({ path: need(i, 'path') }),
      });
    ensureMutationAllowed(i, 'Dropbox upload');
    const content = need(i, 'content');
    const arg = {
      path: need(i, 'path'),
      mode: 'overwrite',
      autorename: false,
      mute: true,
    };
    const res = await fetchWithOptions('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/octet-stream',
        'dropbox-api-arg': JSON.stringify(arg),
      },
      body: content,
      cache: false,
      maxBytes: 500000,
    });
    if (res.status >= 300) throw new Error('DROPBOX_UPLOAD_HTTP_' + res.status);
    return JSON.parse(res.text || '{}');
  }
  if (provider === 'google_drive') {
    const base = 'https://www.googleapis.com/drive/v3/files';
    if (action === 'list' || action === 'search') {
      const u = new URL(base);
      u.searchParams.set('pageSize', String(bounded(i, 'limit', 100, 1000)));
      u.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,size,webViewLink)');
      if (action === 'search')
        u.searchParams.set('q', `name contains '${need(i, 'query').replace(/'/g, "\\'")}' and trashed = false`);
      return await httpJson(u.toString(), { token });
    }
    if (action === 'get')
      return await httpJson(
        `${base}/${encodeURIComponent(need(i, 'id'))}?fields=id,name,mimeType,modifiedTime,size,webViewLink`,
        { token },
      );
    ensureMutationAllowed(i, 'Google Drive upload');
    const metadata = { name: need(i, 'name'), mimeType: 'text/plain' };
    if (Buffer.byteLength(need(i, 'content')) > 1024 * 1024)
      throw new Error('INPUT_TOO_LARGE: content 1 MiB dan katta.');
    const res = await fetchWithOptions('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'multipart/related; boundary=profetch',
      },
      body: `--profetch\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--profetch\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${need(i, 'content')}\r\n--profetch--`,
      cache: false,
      maxBytes: 500000,
    });
    if (res.status >= 300) throw new Error('GOOGLE_DRIVE_UPLOAD_HTTP_' + res.status);
    return JSON.parse(res.text || '{}');
  }
  if (provider === 'onedrive') {
    const base = 'https://graph.microsoft.com/v1.0/me/drive';
    if (action === 'list') {
      const raw = safeCloudPath(inputString(i, 'path'));
      const itemPath = raw ? `/root:/${raw.split('/').map(encodeURIComponent).join('/')}:/children` : '/root/children';
      return httpJson(`${base}${itemPath}?$top=${bounded(i, 'limit', 100, 999)}`, { token });
    }
    if (action === 'search') {
      const query = need(i, 'query').replace(/'/g, "''");
      return httpJson(`${base}/root/search(q='${encodeURIComponent(query)}')?$top=${bounded(i, 'limit', 100, 999)}`, {
        token,
      });
    }
    if (action === 'get')
      return httpJson(`${base}/items/${encodeURIComponent(need(i, 'id'))}`, {
        token,
      });
    ensureMutationAllowed(i, 'OneDrive upload');
    const dest = safeCloudPath(need(i, 'path')).split('/').map(encodeURIComponent).join('/');
    if (!dest) throw new Error('MISSING_INPUT: OneDrive upload path talab qilinadi.');
    if (Buffer.byteLength(need(i, 'content')) > 1024 * 1024)
      throw new Error('INPUT_TOO_LARGE: content 1 MiB dan katta.');
    return await httpJson(`${base}/root:/${dest}:/content`, {
      method: 'PUT',
      token,
      body: need(i, 'content'),
      headers: { 'content-type': 'text/plain' },
    });
  }
  const bucket = safeSegment(need(i, 'bucket'), 'bucket');
  if (action === 'list')
    return await command(
      'aws',
      [
        's3api',
        'list-objects-v2',
        '--bucket',
        bucket,
        '--prefix',
        inputString(i, 'prefix'),
        '--max-keys',
        String(bounded(i, 'limit', 100, 1000)),
      ],
      safeLocalPath(inputString(i, 'cwd')),
    );
  if (action === 'head')
    return await command(
      'aws',
      ['s3api', 'head-object', '--bucket', bucket, '--key', need(i, 'object_key')],
      safeLocalPath(inputString(i, 'cwd')),
    );
  if (action === 'get')
    return await command(
      'aws',
      ['s3', 'cp', `s3://${bucket}/${need(i, 'object_key')}`, '-'],
      safeLocalPath(inputString(i, 'cwd')),
    );
  ensureMutationAllowed(i, 'S3 upload');
  const src = safeLocalPath(need(i, 'local_path'));
  return await command(
    'aws',
    ['s3', 'cp', src, `s3://${bucket}/${need(i, 'object_key')}`],
    safeLocalPath(inputString(i, 'cwd')),
  );
}

async function runProductivity(provider: string, action: string, i: Record<string, unknown>): Promise<unknown> {
  const limit = bounded(i, 'limit', 20, 100);
  if (provider === 'gmail') {
    const token = getCredential('GOOGLE_ACCESS_TOKEN') || getCredential('GMAIL_TOKEN');
    if (!token) throw new Error('CREDENTIAL_MISSING: GOOGLE_ACCESS_TOKEN talab qilinadi.');
    const base = 'https://gmail.googleapis.com/gmail/v1/users/me';
    if (action === 'messages' || action === 'threads') {
      const resource = action === 'messages' ? 'messages' : 'threads';
      const u = new URL(`${base}/${resource}`);
      u.searchParams.set('maxResults', String(limit));
      if (i.query) u.searchParams.set('q', String(i.query));
      return await httpJson(u.toString(), { token });
    }
    if (action === 'message_get')
      return await httpJson(`${base}/messages/${encodeURIComponent(need(i, 'id'))}?format=full`, { token });
    if (action === 'labels') return await httpJson(`${base}/labels`, { token });
    const recipient = need(i, 'recipient'),
      subject = need(i, 'subject'),
      body = need(i, 'body_text');
    if (/[\r\n<>]/.test(recipient) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
      throw new Error('INVALID_EMAIL_RECIPIENT');
    const raw = `To: ${recipient}\r\nSubject: ${subject.replace(/[\r\n]/g, ' ')}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`;
    const encoded = Buffer.from(raw).toString('base64url');
    if (action === 'send') {
      ensureMutationAllowed(i, 'Gmail send');
      if (i.confirm_send !== true) throw new Error('CONFIRMATION_REQUIRED: confirm_send=true talab qilinadi.');
      return await httpJson(`${base}/messages/send`, {
        method: 'POST',
        token,
        body: JSON.stringify({ raw: encoded }),
      });
    }
    ensureMutationAllowed(i, 'Gmail draft create');
    return await httpJson(`${base}/drafts`, {
      method: 'POST',
      token,
      body: JSON.stringify({ message: { raw: encoded } }),
    });
  }
  if (provider === 'calendar') {
    const token = getCredential('GOOGLE_ACCESS_TOKEN');
    if (!token) throw new Error('CREDENTIAL_MISSING: GOOGLE_ACCESS_TOKEN talab qilinadi.');
    const base = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    if (action === 'events') {
      const u = new URL(base);
      u.searchParams.set('maxResults', String(limit));
      if (i.start) u.searchParams.set('timeMin', String(i.start));
      if (i.end) u.searchParams.set('timeMax', String(i.end));
      u.searchParams.set('singleEvents', 'true');
      u.searchParams.set('orderBy', 'startTime');
      return await httpJson(u.toString(), { token });
    }
    if (action === 'event_get') return await httpJson(`${base}/${encodeURIComponent(need(i, 'event_id'))}`, { token });
    if (action === 'event_delete') {
      ensureMutationAllowed(i, 'Calendar event delete');
      if (i.confirm_delete !== true) throw new Error('CONFIRMATION_REQUIRED');
      const res = await fetchWithOptions(`${base}/${encodeURIComponent(need(i, 'event_id'))}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
        cache: false,
      });
      return {
        status: res.status,
        deleted: res.status >= 200 && res.status < 300,
      };
    }
    ensureMutationAllowed(i, `Calendar ${action}`);
    if (action === 'quick_add') {
      const u = new URL(`${base}/quickAdd`);
      u.searchParams.set('text', need(i, 'text'));
      return await httpJson(u.toString(), {
        method: 'POST',
        token,
        body: '{}',
      });
    }
    const title = need(i, 'title');
    const start = need(i, 'start'),
      end = need(i, 'end');
    const body = {
      summary: title,
      description: inputString(i, 'description'),
      start: { dateTime: start },
      end: { dateTime: end },
    };
    if (action === 'event_update')
      return await httpJson(`${base}/${encodeURIComponent(need(i, 'event_id'))}`, {
        method: 'PUT',
        token,
        body: JSON.stringify(body),
      });
    return await httpJson(base, {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    });
  }
  const token = getCredential('TODOIST_API_TOKEN');
  if (!token) throw new Error('CREDENTIAL_MISSING: TODOIST_API_TOKEN talab qilinadi.');
  const base = 'https://api.todoist.com/api/v1/tasks';
  if (action === 'tasks')
    return await httpJson(`${base}?limit=${limit}${i.query ? '&filter=' + encodeURIComponent(String(i.query)) : ''}`, {
      token,
    });
  if (action === 'task_get')
    return await httpJson(`${base}/${encodeURIComponent(need(i, 'id'))}`, {
      token,
    });
  if (action === 'task_create') {
    ensureMutationAllowed(i, 'Todoist task create');
    return await httpJson(base, {
      method: 'POST',
      token,
      body: JSON.stringify({
        content: need(i, 'content'),
        description: inputString(i, 'description'),
        priority: Number(i.priority) || 1,
      }),
    });
  }
  if (action === 'task_update') {
    ensureMutationAllowed(i, 'Todoist task update');
    return await httpJson(`${base}/${encodeURIComponent(need(i, 'id'))}`, {
      method: 'POST',
      token,
      body: JSON.stringify({
        content: inputString(i, 'content'),
        description: inputString(i, 'description'),
        priority: Number(i.priority) || 1,
      }),
    });
  }
  if (action === 'task_close') {
    ensureMutationAllowed(i, 'Todoist task close');
    return await httpJson(`${base}/${encodeURIComponent(need(i, 'id'))}/close`, { method: 'POST', token, body: '{}' });
  }
  ensureMutationAllowed(i, 'Todoist task delete');
  return await httpJson(`${base}/${encodeURIComponent(need(i, 'id'))}`, {
    method: 'DELETE',
    token,
  });
}

async function executeSpec(spec: Spec, i: Record<string, unknown>): Promise<ToolResult> {
  let value: unknown;
  switch (spec.category) {
    case 'git':
      value = await runGit(spec.action, i);
      break;
    case 'codehost':
      value = await runCodehost(spec.provider!, spec.action, i);
      break;
    case 'devops':
      value = await runDevops(spec.provider!, spec.action, i);
      break;
    case 'database':
      value = await runDatabase(spec.provider!, spec.action, i);
      break;
    case 'security':
      value = await runSecurity(spec.action, i);
      break;
    case 'knowledge':
      value = await runKnowledge(spec.action, i);
      break;
    case 'collaboration':
      value = await runCollaboration(spec.provider!, spec.action, i);
      break;
    case 'storage':
      value = await runStorage(spec.provider!, spec.action, i);
      break;
    case 'productivity':
      value = await runProductivity(spec.provider!, spec.action, i);
      break;
  }
  return result(value);
}

for (const spec of SPECS) {
  const props = spec.props || [];
  const properties = schemas(props);
  const def: ToolDefinition = {
    name: spec.name,
    category: spec.category,
    description: `${spec.title}. Pro-Fetch MAX; real provider/CLI operation with shared execution policies.`,
    inputSchema: {
      type: 'object',
      properties,
      required: spec.required || [],
      additionalProperties: false,
    },
    handler: async (input) => executeSpec(spec, input),
  };
  defineTool(def);
}
// Coverage composites for git/devops/database/security and codehost/collaboration/storage/
// productivity. Measured as having zero composite coverage before these were added; see
// scripts/measure-composite-coverage.mts.
//
// Imported for the side effect of registration: each composite calls `defineTool` itself on import,
// so re-defining them here would collide. They live beside the MAX packs rather than in a category
// index because those packs register via SPECS, not per-category index files.
import '../tools/git/workspace_ops_composites.js';

export function maxPlatformToolCount(): number {
  return SPECS.length;
}
export function maxPlatformManifest(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of SPECS) counts[s.category] = (counts[s.category] || 0) + 1;
  return counts;
}
