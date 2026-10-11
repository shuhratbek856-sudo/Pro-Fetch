import type { ToolDefinition } from './types.js';
import path from 'node:path';
import { realpathSync } from 'node:fs';
import { assertGithubInput } from './github-input-guard.js';
import { currentProfile, isToolVisibleInProfile, profileEnforced } from './profile.js';
import { isMutationTool } from './tool-classification.js';
import { boundedEnv } from './bounded-env.js';

export class PolicyError extends Error {
  readonly code = 'POLICY_BLOCKED';
  readonly retryable = false;
  constructor(message: string) {
    super(message);
    this.name = 'PolicyError';
  }
}

function csv(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  );
}

/**
 * Resolve a path the way the filesystem will: symlinks are followed for the deepest ancestor that
 * already exists, and the not-yet-created remainder is appended unchanged. A plain `path.resolve`
 * does not follow symlinks, so a link inside the sandbox pointing outside it would bypass the check.
 */
export function realResolve(target: string): string {
  const resolved = path.resolve(target);
  let current = resolved;
  const tail: string[] = [];
  for (;;) {
    try {
      const real = realpathSync.native(current);
      return tail.length ? path.join(real, ...[...tail].reverse()) : real;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return resolved;
      tail.push(path.basename(current));
      current = parent;
    }
  }
}

export { isMutationTool } from './tool-classification.js';

export function assertToolAllowed(tool: ToolDefinition, input: Record<string, unknown>): void {
  const deniedTools = csv('PRO_FETCH_DENIED_TOOLS');
  const allowedTools = csv('PRO_FETCH_ALLOWED_TOOLS');
  const deniedCategories = new Set([...csv('PRO_FETCH_DENIED_CATEGORIES')].map((value) => value.toLowerCase()));
  if (deniedTools.has(tool.name))
    throw new PolicyError(`Tool '${tool.name}' PRO_FETCH_DENIED_TOOLS siyosati bilan bloklangan.`);
  if (deniedCategories.has(tool.category.toLowerCase()))
    throw new PolicyError(`'${tool.category}' kategoriyasi bloklangan.`);
  if (allowedTools.size > 0 && !allowedTools.has(tool.name))
    throw new PolicyError(`Tool '${tool.name}' allowlist ichida yo'q.`);
  assertProfileVisibility(tool);
  const outputPathFields = ['output_path', 'storage_state_path'];
  for (const field of outputPathFields) {
    const rawPath = input[field];
    if (typeof rawPath !== 'string' || !rawPath.trim()) continue;
    if (process.env.PRO_FETCH_READ_ONLY === 'true')
      throw new PolicyError(`PRO_FETCH_READ_ONLY=true rejimida ${field} orqali faylga yozish bloklangan.`);
    const configuredRoot = process.env.PRO_FETCH_OUTPUT_ROOT?.trim();
    if (configuredRoot) {
      const root = realResolve(configuredRoot);
      const destination = realResolve(rawPath);
      const relative = path.relative(root, destination);
      if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
        throw new PolicyError(`${field} PRO_FETCH_OUTPUT_ROOT sandboxidan tashqariga chiqmoqda.`);
      }
    }
  }
  if (process.env.PRO_FETCH_READ_ONLY === 'true') {
    const exceptions = csv('PRO_FETCH_MUTATION_ALLOWLIST');
    if (!exceptions.has(tool.name) && isMutationTool(tool.name))
      throw new PolicyError(`'${tool.name}' yozish/o'zgartirish amali. PRO_FETCH_READ_ONLY=true.`);
    const method = typeof input.method === 'string' ? input.method.trim().toUpperCase() : '';
    if (!exceptions.has(tool.name) && method && !new Set(['GET', 'HEAD', 'OPTIONS']).has(method)) {
      throw new PolicyError(`HTTP ${method} usuli PRO_FETCH_READ_ONLY=true rejimida bloklangan.`);
    }
  }
  if (
    tool.category === 'browser' &&
    /(?:evaluate|execute|script)/i.test(tool.name) &&
    process.env.PRO_FETCH_ALLOW_JS !== 'true'
  ) {
    throw new PolicyError(
      'Brauzerda ixtiyoriy JavaScript bajarish o‘chirilgan. PRO_FETCH_ALLOW_JS=true ni faqat ishonchli loyihalarda yoqing.',
    );
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(input);
  } catch {
    throw new PolicyError('Tool input JSON formatida bo‘lishi kerak.');
  }
  const maxInputBytes = boundedEnv('PRO_FETCH_MAX_INPUT_BYTES', 2 * 1024 * 1024, 1024, 20 * 1024 * 1024);
  if (Buffer.byteLength(serialized ?? '', 'utf8') > maxInputBytes)
    throw new PolicyError(`Tool input hajmi ${maxInputBytes} baytdan oshdi.`);
  assertGithubInput(tool, input);
}

export { boundedEnv } from './bounded-env.js';

/** Optional hard profile gate, active only when `PRO_FETCH_ENFORCE_PROFILE=true`.
 *
 * Profiles are normally a visibility mechanism, so this stays off by default: the `smart`
 * profile would otherwise be unable to reach the tools its meta-executor exists to call.
 * When it is on, the active profile becomes a real allowlist. `smart` is rejected explicitly
 * because it is defined by reaching tools outside its own visible set — silently blocking
 * every one of them would look like a broken install rather than a configuration error.
 */
export function assertProfileVisibility(tool: ToolDefinition): void {
  if (!profileEnforced()) return;
  const profile = currentProfile();
  if (profile === 'smart') {
    throw new PolicyError(
      "PRO_FETCH_ENFORCE_PROFILE=true 'smart' profili bilan birga ishlatilmaydi: smart profil meta-executor orqali ko'rinmaydigan tool'larni chaqirish uchun mo'ljallangan. 'minimal', 'standard' yoki 'full' profilidan foydalaning.",
    );
  }
  if (!isToolVisibleInProfile(tool, profile)) {
    throw new PolicyError(
      `Tool '${tool.name}' '${profile}' profilida ko'rinmaydi va PRO_FETCH_ENFORCE_PROFILE=true bilan bloklangan.`,
    );
  }
}
