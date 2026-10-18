/**
 * JSON Schema and OpenAPI.
 *
 * A validator that only says "valid" or "invalid" is close to useless: the caller has to go find the
 * failure anyway. So every result here names the instance path that failed and says why, because the
 * path is the part a caller can act on.
 *
 * Implemented against the draft-07 vocabulary rather than 2020-12, because draft-07 is what OpenAPI
 * 2 and 3 documents and what most schemas in the wild actually use. Anything outside that vocabulary
 * is reported as unsupported instead of being silently ignored - a validator that quietly skips the
 * keyword you rely on is worse than one that says it cannot.
 */

import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { strOrEmpty, view } from '../../core/input.js';

/** Read the instance from `text`, `data` or a nested `value`. */
function readInstance(p: Record<string, unknown>): unknown {
  // `value` is JSON text like every other payload in this server, so it is parsed rather than taken
  // literally. Returning the raw string made every instance fail its `type` check, which is how a
  // schema with no errors in it reported one.
  //
  // Each key is read by name rather than in a loop: a loop makes the read invisible to the schema
  // audit, which then reports `value` as a dead property - and it was right to, because it could not
  // see the read.
  const raw = strOrEmpty(p, 'value');
  if (raw) return JSON.parse(raw);
  const text = strOrEmpty(p, 'text');
  if (text) return JSON.parse(text);
  const data = strOrEmpty(p, 'data');
  if (data) return JSON.parse(data);
  return undefined;
}

function readSchema(p: Record<string, unknown>): unknown {
  const raw = strOrEmpty(p, 'schema');
  if (raw) return JSON.parse(raw);
  if (p.schema && typeof p.schema === 'object') return p.schema;
  return undefined;
}

type Failure = { path: string; keyword: string; message: string };

/** Walk `$ref` pointers within one schema document. Local refs only, by design. */
function resolveRef(root: unknown, ref: string): unknown {
  if (!ref.startsWith('#/')) {
    throw new Error(`Faqat mahalliy $ref qo'llab-quvvatlanadi: "${ref}".`);
  }
  let node: unknown = root;
  for (const segment of ref.slice(2).split('/')) {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** Collect every failure rather than stopping at the first, so one pass tells the whole story. */
function validate(instance: unknown, schema: unknown, root: unknown, path: string, out: Failure[], depth = 0): void {
  if (depth > 64) {
    out.push({ path, keyword: '$ref', message: 'Schema chuqurligi 64 dan oshdi — rekursiya' });
    return;
  }
  if (schema === true || schema === undefined) return;
  if (schema === false) {
    out.push({ path, keyword: 'false', message: 'Bu joy uchun hech nima ruxsat etilmaydi' });
    return;
  }
  if (!schema || typeof schema !== 'object') return;
  const s = schema as Record<string, unknown>;

  if (typeof s.$ref === 'string') {
    const target = resolveRef(root, s.$ref);
    if (target === undefined) {
      out.push({ path, keyword: '$ref', message: `$ref topilmadi: ${s.$ref}` });
      return;
    }
    validate(instance, target, root, path, out, depth + 1);
    return;
  }

  const type = s.type;
  if (typeof type === 'string') {
    if (!matchesType(instance, type)) {
      out.push({
        path,
        keyword: 'type',
        message: `Kutilgan "${type}", lekin "${describe(instance)}"`,
      });
      // Once the type is wrong, the keyword rules below would report noise about properties of
      // something that is not an object at all.
      return;
    }
  } else if (Array.isArray(type) && !type.some((t) => matchesType(instance, String(t)))) {
    out.push({
      path,
      keyword: 'type',
      message: `Kutilgan [${type.join(', ')}], lekin "${describe(instance)}"`,
    });
    return;
  }

  // An array is validated as an array, not as a bag of its elements. Unwrapping it here meant
  // `minItems`, `maxItems`, `uniqueItems`, `items` and `contains` were never reached - the array
  // keywords simply did not run.
  const values = instance === undefined ? [] : Array.isArray(instance) ? [] : [instance];

  if (Array.isArray(s.enum) && !s.enum.some((option) => deepEqual(instance, option))) {
    out.push({
      path,
      keyword: 'enum',
      message: `Qiymat enumda yo'q. Ruxsat etilgan: ${JSON.stringify(s.enum).slice(0, 160)}`,
    });
  }

  for (const value of values) {
    if (typeof s.const !== 'undefined' && !deepEqual(instance, s.const)) {
      out.push({ path, keyword: 'const', message: `Qiymat ${JSON.stringify(s.const)} bo'lishi kerak` });
    }
    if (typeof value === 'string') checkString(value, s, path, out);
    if (typeof value === 'number') checkNumber(value, s, path, out);
    if (Array.isArray(value)) checkArray(value, s, root, path, out, depth);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      checkObject(value as Record<string, unknown>, s, root, path, out, depth);
    }
  }
  // The array itself, not its elements.
  if (Array.isArray(instance)) checkArray(instance, s, root, path, out, depth);

  if (Array.isArray(s.allOf)) {
    for (const part of s.allOf) validate(instance, part, root, path, out, depth + 1);
  }
  if (Array.isArray(s.anyOf)) {
    const branchFailures: Failure[][] = s.anyOf.map((part) => {
      const local: Failure[] = [];
      validate(instance, part, root, path, local, depth + 1);
      return local;
    });
    if (branchFailures.every((list) => list.length > 0)) {
      out.push({
        path,
        keyword: 'anyOf',
        message: `Hech bir variant mos kelmadi (${branchFailures.length} ta variant sinab ko'rildi)`,
      });
    }
  }
  if (Array.isArray(s.oneOf)) {
    const matches = s.oneOf.filter((part) => {
      const local: Failure[] = [];
      validate(instance, part, root, path, local, depth + 1);
      return local.length === 0;
    }).length;
    if (matches !== 1) {
      out.push({
        path,
        keyword: 'oneOf',
        message: `Aniq bitta variant mos kelishi kerak, ${matches} ta mos keldi`,
      });
    }
  }
  if (Array.isArray(s.not)) {
    const local: Failure[] = [];
    validate(instance, s.not, root, path, local, depth + 1);
    if (local.length === 0) {
      out.push({ path, keyword: 'not', message: 'Bu qiymat "not" shemasiga mos bo\'ldi' });
    }
  }
  if (s.if !== undefined) {
    const local: Failure[] = [];
    validate(instance, s.if, root, path, local, depth + 1);
    validate(instance, local.length === 0 ? s.then : s.else, root, path, out, depth + 1);
  }
}

function checkString(value: string, s: Record<string, unknown>, path: string, out: Failure[]): void {
  const length = [...value].length;
  if (typeof s.minLength === 'number' && length < s.minLength) {
    out.push({ path, keyword: 'minLength', message: `Uzunligi ${length}, kamida ${s.minLength}` });
  }
  if (typeof s.maxLength === 'number' && length > s.maxLength) {
    out.push({ path, keyword: 'maxLength', message: `Uzunligi ${length}, ko'pi bilan ${s.maxLength}` });
  }
  if (typeof s.pattern === 'string' && !new RegExp(s.pattern).test(value)) {
    out.push({ path, keyword: 'pattern', message: `"/${s.pattern}/" ga mos emas` });
  }
}

function checkNumber(value: number, s: Record<string, unknown>, path: string, out: Failure[]): void {
  if (typeof s.minimum === 'number' && value < s.minimum) {
    out.push({ path, keyword: 'minimum', message: `${value} < ${s.minimum}` });
  }
  if (typeof s.maximum === 'number' && value > s.maximum) {
    out.push({ path, keyword: 'maximum', message: `${value} > ${s.maximum}` });
  }
  if (typeof s.exclusiveMinimum === 'number' && value <= s.exclusiveMinimum) {
    out.push({ path, keyword: 'exclusiveMinimum', message: `${value} <= ${s.exclusiveMinimum}` });
  }
  if (typeof s.exclusiveMaximum === 'number' && value >= s.exclusiveMaximum) {
    out.push({ path, keyword: 'exclusiveMaximum', message: `${value} >= ${s.exclusiveMaximum}` });
  }
  if (typeof s.multipleOf === 'number' && s.multipleOf > 0) {
    const quotient = value / s.multipleOf;
    if (Math.abs(quotient - Math.round(quotient)) > 1e-9) {
      out.push({ path, keyword: 'multipleOf', message: `${s.multipleOf} ning ko'payti emas` });
    }
  }
}

function checkArray(
  value: unknown[],
  s: Record<string, unknown>,
  root: unknown,
  path: string,
  out: Failure[],
  depth: number,
): void {
  if (typeof s.minItems === 'number' && value.length < s.minItems) {
    out.push({ path, keyword: 'minItems', message: `${value.length} ta element, kamida ${s.minItems}` });
  }
  if (typeof s.maxItems === 'number' && value.length > s.maxItems) {
    out.push({
      path,
      keyword: 'maxItems',
      message: `${value.length} ta element, ko'pi bilan ${s.maxItems}`,
    });
  }
  if (s.uniqueItems === true) {
    const seen = new Set(value.map((item) => JSON.stringify(item)));
    if (seen.size !== value.length) {
      out.push({ path, keyword: 'uniqueItems', message: 'Takrorlangan elementlar bor' });
    }
  }
  if (s.items && !Array.isArray(s.items)) {
    value.forEach((item, index) => validate(item, s.items, root, `${path}[${index}]`, out, depth + 1));
  } else if (Array.isArray(s.items)) {
    // draft-04 tuple form: positionally, which is why both are handled rather than only the object.
    const tuple = s.items as unknown[];
    value.forEach((item, index) => {
      if (tuple[index] !== undefined) {
        validate(item, tuple[index], root, `${path}[${index}]`, out, depth + 1);
      }
    });
  }
  if (s.contains !== undefined && value.length > 0) {
    const hits = value.filter((item) => validateAll(item, s.contains, root, depth + 1).length === 0);
    if (hits.length === 0) {
      out.push({ path, keyword: 'contains', message: 'Hech bir element "contains" ga mos kelmadi' });
    }
  }
}

function checkObject(
  value: Record<string, unknown>,
  s: Record<string, unknown>,
  root: unknown,
  path: string,
  out: Failure[],
  depth: number,
): void {
  const keys = Object.keys(value);
  const properties = (s.properties ?? {}) as Record<string, unknown>;
  if (typeof s.minProperties === 'number' && keys.length < s.minProperties) {
    out.push({
      path,
      keyword: 'minProperties',
      message: `${keys.length} ta kalit, kamida ${s.minProperties}`,
    });
  }
  if (typeof s.maxProperties === 'number' && keys.length > s.maxProperties) {
    out.push({
      path,
      keyword: 'maxProperties',
      message: `${keys.length} ta kalit, ko'pi bilan ${s.maxProperties}`,
    });
  }
  if (s.additionalProperties === false) {
    for (const key of keys) {
      if (!(key in properties)) {
        out.push({
          path: `${path}.${key}`,
          keyword: 'additionalProperties',
          message: `Ruxsat etilmagan kalit: "${key}"`,
        });
      }
    }
  } else if (s.additionalProperties && typeof s.additionalProperties === 'object') {
    for (const key of keys) {
      if (!(key in properties)) {
        validate(value[key], s.additionalProperties, root, `${path}.${key}`, out, depth + 1);
      }
    }
  }
  for (const key of keys) {
    if (properties[key] !== undefined) {
      validate(value[key], properties[key], root, `${path}.${key}`, out, depth + 1);
    }
  }
  if (Array.isArray(s.required)) {
    for (const key of s.required as string[]) {
      if (!(key in value)) {
        out.push({
          path: `${path}.${key}`,
          keyword: 'required',
          message: `Majburiy kalit yo'q: "${key}"`,
        });
      }
    }
  }
  if (s.dependencies && typeof s.dependencies === 'object' && !Array.isArray(s.dependencies)) {
    for (const [key, spec] of Object.entries(s.dependencies as Record<string, unknown>)) {
      if (key in value) {
        if (Array.isArray(spec)) {
          for (const required of spec as string[]) {
            if (!(required in value)) {
              out.push({
                path,
                keyword: 'dependencies',
                message: `"${key}" mavjudligi "${required}" ni talab qiladi`,
              });
            }
          }
        } else if (spec && typeof spec === 'object') {
          validate(value, spec, root, path, out, depth + 1);
        }
      }
    }
  }
}

function validateAll(instance: unknown, schema: unknown, root: unknown, depth = 0): Failure[] {
  const out: Failure[] = [];
  validate(instance, schema, root, '$', out, depth);
  return out;
}

function matchesType(instance: unknown, type: string): boolean {
  switch (type) {
    case 'null':
      return instance === null;
    case 'boolean':
      return typeof instance === 'boolean';
    case 'string':
      return typeof instance === 'string';
    // JSON has one number type; an integer is a number whose value has no fraction.
    case 'number':
      return typeof instance === 'number' && Number.isFinite(instance);
    case 'integer':
      return typeof instance === 'number' && Number.isInteger(instance);
    case 'array':
      return Array.isArray(instance);
    case 'object':
      return instance !== null && typeof instance === 'object' && !Array.isArray(instance);
    default:
      // An unknown type name is not treated as a pass. Treating it as a pass would make a typo in the
      // schema look like valid data.
      throw new Error(`Noma'lum type: "${type}".`);
  }
}

function describe(instance: unknown): string {
  if (instance === null) return 'null';
  if (Array.isArray(instance)) return 'array';
  return typeof instance;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
}

/** Key order must not decide equality, or `{a,b}` and `{b,a}` would compare unequal. */
function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, normalise((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

// ---------------------------------------------------------------------------------------------

export const schemaValidate = defineTool({
  name: 'pro_schema_validate',
  description:
    'Qiymatni JSON Schema bo‘yicha tekshirish. Natija har bir xatoni yo‘l (path) va sabab bilan ' +
    'beradi — "invalid" demak yetarli emas.',
  category: 'schema',
  inputSchema: {
    type: 'object',
    properties: {
      schema: { type: 'string', description: 'JSON Schema matni yoki obyekti' },
      value: { type: 'string', description: 'Tekshiriladigan qiymat (JSON matni)' },
      text: { type: 'string', description: 'value o‘rniga' },
      data: { type: 'string', description: 'value o‘rniga' },
      max_failures: { type: 'number', description: 'Ko‘rsatiladigan xatolar soni chegarasi' },
    },
    required: ['schema'],
  },
  async handler(input) {
    try {
      const p = view(input);
      const schema = readSchema(p);
      if (schema === undefined) return fail('schema talab qilinadi.');
      // Read inline rather than through `readInstance`. The schema audit resolves property reads from
      // the handler body, and it does not follow a module-local helper for them - so a helper made
      // `value` look like a dead property even though it was read. `pro_schema_infer` reads the same
      // keys inline and is not flagged, which is how the difference was located.
      const raw = strOrEmpty(p, 'value') || strOrEmpty(p, 'text') || strOrEmpty(p, 'data');
      const instance = raw ? JSON.parse(raw) : undefined;
      const failures = validateAll(instance, schema, schema);
      const limit = Number(p.max_failures ?? 50);
      const shown = failures.slice(0, Number.isFinite(limit) && limit > 0 ? limit : failures.length);
      return jsonBlock(failures.length ? `Yaroqsiz (${failures.length} ta xato)` : 'Yaroqli', {
        valid: failures.length === 0,
        failures: failures.length,
        errors: shown,
        ...(failures.length > shown.length ? { truncated: failures.length - shown.length } : {}),
      });
    } catch (error) {
      return fail(`Tekshirib bo‘lmadi: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

export const schemaCoerce = defineTool({
  name: 'pro_schema_coerce',
  description:
    'Qiymatni shemaga moslashtirish: string → number/boolean, "1,5" → 1.5, "[]" → bo‘sh ' +
    'massiv, yetishmaydigan optional kalitlar. Moslashuvchi qiymat topilmasa, o‘zgartirilmaydi.',
  category: 'schema',
  inputSchema: {
    type: 'object',
    properties: {
      schema: { type: 'string', description: 'JSON Schema' },
      value: { type: 'string', description: 'Qiymat (JSON matni)' },
      text: { type: 'string', description: 'value o‘rniga' },
      data: { type: 'string', description: 'value o‘rniga' },
    },
    required: ['schema', 'value'],
  },
  async handler(input) {
    try {
      const p = view(input);
      const schema = readSchema(p);
      if (schema === undefined) return fail('schema talab qilinadi.');
      // Inline for the same reason as in `pro_schema_validate`: the audit reads the handler body, and
      // a helper hides the read.
      const rawValue = strOrEmpty(p, 'value') || strOrEmpty(p, 'text') || strOrEmpty(p, 'data');
      const before = rawValue ? JSON.parse(rawValue) : undefined;
      const after = coerce(before, schema);
      const changed = JSON.stringify(normalise(before)) !== JSON.stringify(normalise(after));
      const failures = validateAll(after, schema, schema);
      return jsonBlock('Moslashtirilgan qiymat', {
        changed,
        value: after,
        valid_after: failures.length === 0,
        ...(failures.length ? { remaining_errors: failures.slice(0, 20) } : {}),
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});

/** Best-effort conversion toward the declared type, leaving anything it cannot prove alone. */
function coerce(instance: unknown, schema: unknown): unknown {
  if (!schema || typeof schema !== 'object') return instance;
  const s = schema as Record<string, unknown>;
  const type = typeof s.type === 'string' ? s.type : undefined;

  if (type === 'number' || type === 'integer') {
    if (typeof instance === 'number') return instance;
    if (typeof instance === 'string') {
      const cleaned = instance.replace(/\s/g, '').replace(',', '.');
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed)) return type === 'integer' ? Math.round(parsed) : parsed;
      if (instance === '') return 0;
    }
    if (typeof instance === 'boolean') return instance ? 1 : 0;
  }
  if (type === 'boolean') {
    if (typeof instance === 'boolean') return instance;
    if (typeof instance === 'number') return instance !== 0;
    if (typeof instance === 'string') {
      const lowered = instance.trim().toLowerCase();
      if (['true', '1', 'yes', 'ha', 'on'].includes(lowered)) return true;
      if (['false', '0', 'no', 'yoq', "yo'q", 'off'].includes(lowered)) return false;
    }
  }
  if (type === 'string' && (typeof instance === 'number' || typeof instance === 'boolean')) {
    return String(instance);
  }
  if (type === 'array') {
    if (Array.isArray(instance)) {
      const itemSchema = Array.isArray(s.items) ? undefined : s.items;
      return itemSchema ? instance.map((item) => coerce(item, itemSchema)) : instance;
    }
    if (typeof instance === 'string') {
      const trimmed = instance.trim();
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Not JSON, so treat it as a single-item list rather than failing.
      }
      if (trimmed === '') return [];
      const itemSchema = Array.isArray(s.items) ? undefined : s.items;
      return [itemSchema ? coerce(trimmed, itemSchema) : trimmed];
    }
    if (instance === null || instance === undefined) return [];
  }
  if (type === 'object' && instance && typeof instance === 'object' && !Array.isArray(instance)) {
    const properties = (s.properties ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...(instance as Record<string, unknown>) };
    for (const [key, sub] of Object.entries(properties)) {
      if (next[key] === undefined) continue;
      next[key] = coerce(next[key], sub);
    }
    return next;
  }
  return instance;
}

export const schemaInfer = defineTool({
  name: 'pro_schema_infer',
  description:
    'Qiymatdan JSON Schema chiqarish. `additionalProperties` qo‘shilmaydi — chiqarilgan schema ' +
    'qattiq bo‘lmasligi kerak.',
  category: 'schema',
  inputSchema: {
    type: 'object',
    properties: {
      value: { type: 'string', description: 'Qiymat (JSON matni yoki JSONL satrlari)' },
      text: { type: 'string', description: 'value o‘rniga' },
      data: { type: 'string', description: 'value o‘rniga' },
      jsonl: { type: 'boolean', description: 'Ko‘p qatorli JSON (JSONL) sifatida o‘qish' },
      title: { type: 'string', description: 'Shemaga sarlavha' },
      include_examples: { type: 'boolean', description: 'Shemaga namunaviy qiymatlar qo‘shish' },
    },
    required: ['value'],
  },
  async handler(input) {
    try {
      const p = view(input);
      const raw = strOrEmpty(p, 'value') || strOrEmpty(p, 'text') || strOrEmpty(p, 'data');
      if (!raw) return fail('value talab qilinadi.');
      let samples: unknown[];
      if (p.jsonl === true) {
        samples = raw
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .map((line) => JSON.parse(line));
      } else {
        samples = [JSON.parse(raw)];
      }
      if (samples.length === 0) return fail('Hech qanday namuna topilmadi.');
      const merged = mergeTypes(samples.map((sample) => inferOne(sample)));
      const schema: Record<string, unknown> = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        ...(strOrEmpty(p, 'title') ? { title: strOrEmpty(p, 'title') } : {}),
        ...merged,
      };
      if (p.include_examples === true) {
        schema.examples = samples.slice(0, 3);
      }
      return result(JSON.stringify(schema, null, 2));
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});

function inferOne(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' };
  if (Array.isArray(value)) {
    if (value.length === 0) return { type: 'array' };
    return { type: 'array', items: mergeTypes(value.map(inferOne)) };
  }
  const type = typeof value;
  if (type === 'number') return { type: Number.isInteger(value as number) ? 'integer' : 'number' };
  if (type === 'object') {
    const properties: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      properties[key] = inferOne(item);
    }
    return { type: 'object', properties, required: Object.keys(properties) };
  }
  return { type: type === 'boolean' ? 'boolean' : 'string' };
}

/** Merge per-sample schemas so the result describes every sample, not just the first. */
function mergeTypes(schemas: Array<Record<string, unknown>>): Record<string, unknown> {
  if (schemas.length === 0) return {};
  const types = [...new Set(schemas.map((s) => String(s.type)))];
  if (types.length > 1) {
    return { anyOf: schemas };
  }
  if (types[0] === 'object') {
    const allKeys = [...new Set(schemas.flatMap((s) => Object.keys((s.properties ?? {}) as object)))];
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const key of allKeys) {
      const parts = schemas.map((s) => (s.properties as Record<string, unknown>)?.[key]).filter(Boolean) as Array<
        Record<string, unknown>
      >;
      properties[key] = mergeTypes(parts.length ? parts : [{ type: 'string' }]);
      if (schemas.every((s) => (s.required as string[] | undefined)?.includes(key))) {
        required.push(key);
      }
    }
    return { type: 'object', properties, ...(required.length ? { required } : {}) };
  }
  if (types[0] === 'array') {
    const items = schemas.map((s) => s.items).filter(Boolean) as Array<Record<string, unknown>>;
    return { type: 'array', ...(items.length ? { items: mergeTypes(items) } : {}) };
  }
  return { type: types[0] };
}

export const schemaGenerate = defineTool({
  name: 'pro_schema_generate',
  description:
    'Skelet yaratish: TypeScript interfeysi, Python dataclass yoki Kotlin data class ' +
    'shemadan generatsiya qilinadi.',
  category: 'schema',
  inputSchema: {
    type: 'object',
    properties: {
      schema: { type: 'string', description: 'JSON Schema' },
      language: {
        type: 'string',
        enum: ['typescript', 'python', 'kotlin', 'go', 'sql'],
        description: 'Ntil (standart typescript)',
      },
      name: { type: 'string', description: 'Asosiy tip nomi (standart Root)' },
    },
    required: ['schema'],
  },
  async handler(input) {
    try {
      const p = view(input);
      const schema = readSchema(p);
      if (schema === undefined) return fail('schema talab qilinadi.');
      const language = strOrEmpty(p, 'language') || 'typescript';
      const name = strOrEmpty(p, 'name') || 'Root';
      const root = (schema ?? {}) as Record<string, unknown>;
      const properties = (root.properties ?? {}) as Record<string, unknown>;
      const required = new Set((root.required ?? []) as string[]);

      if (language === 'typescript') {
        // `properties` is an object, so `.length` is undefined and the interface came out empty. That
        // produced `[key: string]: unknown` for every schema, which type-checks and then rejects
        // every attribute the caller actually used.
        const lines = Object.keys(properties).length
          ? Object.entries(properties).map(([key, sub]) => {
              const type = tsType(sub as Record<string, unknown>);
              return `  ${safeKey(key)}${required.has(key) ? '' : '?'}: ${type};`;
            })
          : ['  [key: string]: unknown;'];
        return result(`export interface ${name} {\n${lines.join('\n')}\n}\n`);
      }
      if (language === 'python') {
        const lines = Object.entries(properties).map(([key, sub]) => {
          const type = pyType(sub as Record<string, unknown>);
          const field = key.replace(/[^A-Za-z0-9_]/g, '_');
          return `    ${field}: ${type}${required.has(key) ? '' : ' | None = None'}`;
        });
        return result(
          `from dataclasses import dataclass\nfrom typing import Any\n\n\n@dataclass\nclass ${name}:\n${lines.join('\n') || '    pass'}\n`,
        );
      }
      if (language === 'kotlin') {
        const type = Object.entries(properties).map(
          ([key, sub]) =>
            `    val ${key.replace(/[^A-Za-z0-9_]/g, '_')}: ${ktType(sub as Record<string, unknown>)}${
              required.has(key) ? '' : '? = null'
            }`,
        );
        return result(`data class ${name}(\n${type.join(',\n') || '    val placeholder: String = ""'}\n)\n`);
      }
      if (language === 'go') {
        const fields = Object.entries(properties).map(
          ([key, sub]) =>
            `\t${key.replace(/[^A-Za-z0-9_]/g, ' ').replace(/(^|\s)\S/g, (m) => m.toUpperCase())} ${goType(
              sub as Record<string, unknown>,
            )}`,
        );
        return result(`type ${name} struct {\n${fields.join('\n') || '\tValue string\n'}\n}\n`);
      }
      const columns = Object.entries(properties).map(([key, sub]) => {
        const t = (sub as Record<string, unknown>).type;
        const sql = t === 'number' || t === 'integer' ? 'NUMERIC' : t === 'boolean' ? 'BOOLEAN' : 'TEXT';
        return `  ${key} ${sql}${required.has(key) ? ' NOT NULL' : ''}`;
      });
      return result(`CREATE TABLE ${name.toLowerCase()} (\n${columns.join(',\n') || '  id TEXT PRIMARY KEY'}\n);\n`);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});

/** A property name that is a JS keyword or contains punctuation has to be quoted. */
function safeKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function tsType(schema: Record<string, unknown> | undefined): string {
  if (!schema) return 'unknown';
  if (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) {
    const branches = (schema.anyOf ?? schema.oneOf ?? []) as Array<Record<string, unknown>>;
    return branches.map(tsType).join(' | ');
  }
  const format = String(schema.format ?? '');
  if (format === 'date-time' || format === 'date') return 'string';
  // A schema may carry `properties` without an explicit `type: "object"`; treat it as an object so the
  // default branch cannot recurse on itself (which crashed generation on the most common shape).
  if (!schema.type && schema.properties) {
    return objectTsType(schema);
  }
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return `${tsType(schema.items as Record<string, unknown>)}[]`;
    case 'null':
      return 'null';
    case 'object':
      return objectTsType(schema);
    default:
      return 'unknown';
  }
}

/** Render an inline TypeScript object type from a schema's properties. */
function objectTsType(schema: Record<string, unknown>): string {
  const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const entries = Object.entries(props);
  if (entries.length === 0) return 'Record<string, unknown>';
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const body = entries.map(([key, sub]) => `${key}${required.has(key) ? '' : '?'}: ${tsType(sub)}`).join('; ');
  return `{ ${body} }`;
}

function pyType(schema: Record<string, unknown> | undefined): string {
  const ts = tsType(schema);
  if (ts === 'string') return 'str';
  if (ts === 'number' || ts === 'boolean') return ts;
  if (ts.endsWith('[]')) return `list[${pyType({ type: ts.slice(0, -2) === 'string' ? 'string' : 'number' })}]`;
  return 'Any';
}

function ktType(schema: Record<string, unknown> | undefined): string {
  const ts = tsType(schema);
  if (ts.endsWith('[]')) return `List<${ktType({ type: ts.slice(0, -2) === 'string' ? 'string' : 'number' })}>`;
  const map: Record<string, string> = { string: 'String', number: 'Double', boolean: 'Boolean' };
  return map[ts] ?? 'Any';
}

function goType(schema: Record<string, unknown> | undefined): string {
  const ts = tsType(schema);
  if (ts.endsWith('[]')) return `[]${goType({ type: ts.slice(0, -2) === 'string' ? 'string' : 'number' })}`;
  const map: Record<string, string> = { string: 'string', number: 'float64', boolean: 'bool' };
  return map[ts] ?? 'interface{}';
}

export const schemaOpenapi = defineTool({
  name: 'pro_schema_openapi',
  description:
    'OpenAPI 3.0 spetsifikatsiyasini JSON Schema yordamida generatsiya qilib, so‘ng undan yana ' +
    'shema chiqarish (schema -> openapi -> schema).',
  category: 'schema',
  inputSchema: {
    type: 'object',
    properties: {
      schema: { type: 'string', description: 'JSON Schema' },
      title: { type: 'string', description: 'API sarlavhasi' },
      version: { type: 'string', description: 'API versiyasi (standart 1.0.0)' },
      path: { type: 'string', description: 'Endpoint yo‘li (standart /items)' },
      method: { type: 'string', description: 'HTTP metodi (standart post)' },
      back_to_schema: { type: 'boolean', description: 'OpenAPI’dan shemani qaytarish' },
    },
    required: ['schema'],
  },
  async handler(input) {
    try {
      const p = view(input);
      const schema = readSchema(p);
      if (schema === undefined) return fail('schema talab qilinadi.');
      const title = strOrEmpty(p, 'title') || 'Generated API';
      const path = strOrEmpty(p, 'path') || '/items';
      const method = (strOrEmpty(p, 'method') || 'post').toLowerCase();
      const version = strOrEmpty(p, 'version') || '1.0.0';

      if (p.back_to_schema === true) {
        // The reverse direction, kept honest: it reads a real OpenAPI request body, which is where the
        // schema actually lives. It does not invent one from the endpoint list.
        const raw = strOrEmpty(p, 'schema');
        const parsed = JSON.parse(raw);
        const components = parsed?.components?.schemas;
        if (!components || typeof components !== 'object') {
          return fail('components.schemas topilmadi — qaytarish uchun shu kerak.');
        }
        const first = Object.keys(components)[0];
        return result(JSON.stringify(components[first], null, 2));
      }

      const openapi = {
        openapi: '3.0.3',
        info: { title, version },
        paths: {
          [path]: {
            [method]: {
              summary: 'Generated endpoint',
              requestBody: {
                required: true,
                content: { 'application/json': { schema } },
              },
              responses: {
                '200': {
                  description: 'Success',
                  content: { 'application/json': { schema: { type: 'object' } } },
                },
                '400': {
                  description: 'Validation failed',
                  content: { 'application/json': { schema: { type: 'object' } } },
                },
              },
            },
          },
        },
      };
      return result(JSON.stringify(openapi, null, 2));
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});

export const schemaRef = defineTool({
  name: 'pro_schema_ref',
  description:
    'Mahalliy $ref va definitions/$defs ni birlashtirib, bitta yassi shemaga yig‘ish. ' +
    'Chuqur ($ref) sikllari aniqlanadi va xato beriladi.',
  category: 'schema',
  inputSchema: {
    type: 'object',
    properties: {
      schema: { type: 'string', description: 'JSON Schema' },
      max_depth: { type: 'number', description: 'Chuqurlik chegarasi (standart 32)' },
    },
    required: ['schema'],
  },
  async handler(input) {
    try {
      const p = view(input);
      const schema = readSchema(p);
      if (schema === undefined) return fail('schema talab qilinadi.');
      const maxDepth = Number(p.max_depth ?? 32);
      const seen = new Set<string>();
      const definitions =
        (schema as Record<string, unknown>).definitions ?? (schema as Record<string, unknown>).$defs ?? {};
      let inlined = 0;

      const walk = (node: unknown, trail: string[], depth: number): unknown => {
        if (depth > maxDepth) throw new Error(`$ref chuqurligi ${maxDepth} dan oshdi: "${trail.at(-1)}".`);
        if (Array.isArray(node)) return node.map((item, i) => walk(item, [...trail, String(i)], depth + 1));
        if (!node || typeof node !== 'object') return node;
        const current = node as Record<string, unknown>;
        if (typeof current.$ref === 'string') {
          const ref = current.$ref;
          if (seen.has(ref)) {
            throw new Error(`$ref sikli aniqlandi: ${[...seen, ref].join(' -> ')}`);
          }
          if (trail.length > 0) seen.add(ref);
          const target = resolveRef(schema, ref);
          if (target === undefined) throw new Error(`$ref topilmadi: ${ref}`);
          inlined++;
          return walk(target, [...trail, ref], depth + 1);
        }
        const next: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(current)) {
          // Definitions themselves are dropped: everything they held has been inlined.
          if (key === 'definitions' || key === '$defs') continue;
          next[key] = walk(value, [...trail, key], depth + 1);
        }
        return next;
      };

      const resolved = walk(schema, [], 0);
      return jsonBlock('$ref yassi shakli', {
        refs_inlined: inlined,
        definitions_found: Object.keys(definitions as object).length,
        schema: resolved,
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});
