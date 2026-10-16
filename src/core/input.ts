/**
 * Typed accessors for tool input.
 *
 * Tool handlers receive `Record<string, unknown>`, so the ergonomic pattern used to be
 * `const p = input as any` (168 occurrences) which erased type checking and hid typos: reading a
 * misspelled property returned `undefined` and silently produced wrong output.
 *
 * These helpers read the same `Record<string, unknown>` but coerce and validate explicitly, so a
 * missing or wrongly-typed argument fails loudly instead of propagating `undefined`.
 */

/** A tool-input view whose property access yields coerced primitives.
 *
 * Handlers previously used `const p = input as any`, which typed every property as `any` and so
 * silenced checking entirely — a misspelled argument silently read as `undefined`.
 * `view()` keeps the ergonomic `p.owner` / `p.url` style while typing the result.
 *
 * Prefer the explicit accessors (`str`, `num`, `bool`, …) in new code; `view()` exists so the
 * existing call sites keep working without a behaviour change.
 */
export type InputView = {
  readonly [key: string]: string | number | boolean | null | undefined | unknown[] | Record<string, unknown>;
};

/** Wrap raw tool input in a typed view. */
export function view(input: Record<string, unknown>): InputView {
  return input as InputView;
}

/** Treat an API response body as an array of records.
 *
 * GitHub (and most JSON APIs) return arrays whose element shape varies by endpoint, so handlers
 * read fields directly off each item. Typing those items as `any` silenced all checking; this
 * returns `Record<string, unknown>[]` instead, which still allows `item.name` while catching
 * genuine mistakes such as iterating a non-array.
 */
export function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  return asArray(value)?.filter((item): item is Record<string, unknown> => asRecord(item) !== undefined) ?? [];
}

/** Read a nested value from an API response, e.g. `path(r.json, 'commit.author.name')`. */
export function path(source: unknown, dotted: string): unknown {
  let current: unknown = source;
  for (const segment of dotted.split('.')) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[segment];
  }
  return current;
}

/** Read a nested value as a string, defaulting when absent or not a string. */
export function pathStr(source: unknown, dotted: string, fallback = ''): string {
  const value = path(source, dotted);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

/** Read a nested value as a finite number, defaulting when absent or unparsable. */
export function pathNum(source: unknown, dotted: string, fallback = 0): number {
  const value = path(source, dotted);
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Read a string argument. Returns `undefined` when absent, `fallback` when unresolvable. */
export function str(input: Record<string, unknown>, key: string, fallback?: string): string | undefined {
  const value = input[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

/** Read a required string argument, or `undefined` when absent/empty. */
export function optionalStr(input: Record<string, unknown>, key: string): string | undefined {
  const value = str(input, key);
  return value && value.trim() ? value : undefined;
}

/** Read a string argument, falling back to `''` — handy for optional text fields. */
export function strOrEmpty(input: Record<string, unknown>, key: string): string {
  return str(input, key, '') as string;
}

/** Read a required string argument. Throws a descriptive error when it is missing. */
export function requireStr(input: Record<string, unknown>, key: string): string {
  const value = optionalStr(input, key);
  if (value === undefined) throw new Error(`MISSING_INPUT: '${key}' argumenti talab qilinadi.`);
  return value;
}

/**
 * Read a finite **whole** number, clamped to `[min, max]`. Returns `fallback` when absent or unparsable.
 *
 * The `Math.floor` is load-bearing for pixel counts and load-bearing as a trap for everything else. A
 * brightness of `0.5` floors to `0`, which is indistinguishable from "not supplied": measured on
 * `pro_image_adjust`, `brightness: 0.5`, `contrast: 0.5` and `saturation: -0.7` were all silently
 * discarded and the tool reported that nothing had changed. The caller asked for half the brightness
 * and got the original file back with a success.
 *
 * Use `float` for any parameter that is not a count.
 */
export function num(
  input: Record<string, unknown>,
  key: string,
  fallback: number,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const raw = input[key];
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

/**
 * Read a finite number without rounding, clamped to `[min, max]`.
 *
 * Present because `num` floors, and a parameter on a unit scale - brightness, contrast, saturation,
 * opacity, progress - loses its entire value to that floor whenever it is below 1. Every such
 * parameter that reads 0 because of rounding is a silent no-op: the call succeeds and the output is
 * the input.
 *
 * `fallback` is returned only when the value is absent or unparsable. A value outside `[min, max]` is
 * clamped, and the caller is expected to report what it actually applied rather than what was asked
 * for - clamping a brightness of 2 to 1 is a reasonable reading, whereas reporting "brightness 2"
 * after applying 1 is not.
 */
export function float(
  input: Record<string, unknown>,
  key: string,
  fallback: number,
  min = -Number.MAX_VALUE,
  max = Number.MAX_VALUE,
): number {
  const raw = input[key];
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

/** Read a boolean, accepting the string forms MCP clients often send. */
export function bool(input: Record<string, unknown>, key: string, fallback = false): boolean {
  const value = input[key];
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return fallback;
}

/** Read an array argument, returning `[]` when absent. Non-arrays are wrapped. */
export function arr(input: Record<string, unknown>, key: string): unknown[] {
  const value = input[key];
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

/** Read a plain-object argument, returning `{}` when absent or not an object. */
export function obj(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = input[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

/** Read a `Record<string, string>` argument (for header maps and similar). */
export function strMap(input: Record<string, unknown>, key: string): Record<string, string> {
  const source = obj(input, key);
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (typeof value === 'string') out[name] = value;
    else if (typeof value === 'number' || typeof value === 'boolean') out[name] = String(value);
  }
  return out;
}

/** Parse a JSON argument, returning `fallback` when absent or malformed. */
export function json(input: Record<string, unknown>, key: string, fallback: unknown = undefined): unknown {
  const raw = input[key];
  if (typeof raw !== 'string') return typeof raw === 'object' && raw !== null ? raw : fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return fallback;
  }
}

/** Narrow an unknown value to a plain object, or `undefined`. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}

/** Narrow an unknown value to an array, or `undefined`. */
export function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

/** Recursively walk a parsed-JSON value. Safe for any shape because it accepts `unknown`. */
export function walkJson(value: unknown, visit: (node: unknown, key: string) => void, prefix = ''): void {
  const record = asRecord(value);
  if (!record) return;
  for (const [key, item] of Object.entries(record)) {
    const path = prefix ? prefix + '.' + key : key;
    visit(item, path);
    if (item && typeof item === 'object' && !Array.isArray(item)) walkJson(item, visit, path);
  }
}
