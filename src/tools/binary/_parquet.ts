/**
 * Parquet reading, on hyparquet.
 *
 * `parquet-wasm` was tried first and does not work here. Measured on Node 24 with parquet-wasm 0.9.0:
 * `readMetadata(bytes)` returns an object whose only key is `__wbg_ptr` - a raw wasm-bindgen pointer
 * rather than the metadata - so `num_rows` is `undefined`, `readSchema` returns no fields, and the tool
 * reports "0 rows" for a file that has 8. That is the exact failure this project keeps refusing to ship:
 * a well-formed success that is wrong. The WebAssembly glue and the binary disagree, and no entry point
 * exposes an `init` to fix it.
 *
 * hyparquet is pure JavaScript, so there is no wasm to mismatch. Two of its behaviours are load-bearing
 * and are easy to get wrong:
 *
 *   - `parquetReadObjects` **returns** the rows. The `onComplete` callback documented for the streaming
 *     reader is not invoked by it, and awaiting it yields an array of length 0 while the real rows sit
 *     in the return value. Measured.
 *   - decoded values can be `BigInt` (int64 columns). `JSON.stringify` throws `Do not know how to
 *     serialize a BigInt`, so values are converted on the way out - as a number when it is exactly
 *     representable, and as a string otherwise, because silently losing precision on a 64-bit id is
 *     worse than returning text.
 */

/** Row count, group count and the file's own schema, without decoding a row. */
export interface ParquetDescription {
  num_rows: number;
  row_groups: number;
  version: number;
  created_by: string | null;
  schema: { fields: ParquetField[] };
}

export interface ParquetField {
  name: string;
  type: string | null;
  repetition_type: string | null;
  converted_type: string | null;
}

interface HyparquetNode {
  name?: string;
  type?: string;
  repetition_type?: string;
  converted_type?: string;
  num_children?: number;
}

interface HyparquetMetadata {
  version: number;
  schema: HyparquetNode[];
  num_rows: number;
  row_groups: Array<{ num_rows: number }>;
  created_by?: string;
}

interface Hyparquet {
  parquetMetadata: (file: ArrayBuffer) => HyparquetMetadata;
  parquetReadObjects: (options: {
    file: ArrayBuffer;
    metadata?: HyparquetMetadata;
    columns?: string[];
    rowStart?: number;
    rowEnd?: number;
  }) => Promise<Array<Record<string, unknown>>>;
}

let loaded: Promise<Hyparquet> | null = null;

export async function loadParquet(): Promise<Hyparquet> {
  if (!loaded) {
    loaded = import('hyparquet') as unknown as Promise<Hyparquet>;
  }
  return loaded;
}

/** The exact bytes of a Node buffer as a standalone ArrayBuffer, which is what hyparquet requires. */
export function toArrayBuffer(source: Buffer): ArrayBuffer {
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy.buffer;
}

/**
 * The leaf columns.
 *
 * hyparquet returns the schema as a flat list whose first entry is the root, so the leaves are
 * everything after it. Walking `num_children` would be more precise but the flat form is what the
 * library documents and it keeps the code readable.
 */
function leavesOf(metadata: HyparquetMetadata): HyparquetNode[] {
  const schema = metadata.schema ?? [];
  const root = schema[0];
  const rest = schema.slice(1);
  // A schema whose root declares no children is a single-column file stored without a group node.
  if (root && root.num_children === undefined) return schema;
  return rest.filter((node) => node && node.name !== undefined);
}

export async function describeParquet(file: ArrayBuffer): Promise<ParquetDescription> {
  const api = await loadParquet();
  const metadata = api.parquetMetadata(file);
  const leaves = leavesOf(metadata);
  // hyparquet types row counts as number, but a large file pushes them into BigInt territory and
  // `JSON.stringify` then throws `Do not know how to serialize a BigInt` from inside the result
  // serialiser - which surfaces as a failure to read a perfectly good file.
  const counts = metadata.num_rows ?? 0;
  return {
    num_rows: typeof counts === 'bigint' ? Number(counts) : Number(counts ?? 0),
    row_groups: metadata.row_groups?.length ?? 0,
    version: Number(metadata.version ?? 0),
    created_by: metadata.created_by ?? null,
    schema: {
      fields: leaves.map((leaf) => ({
        name: leaf.name ?? '',
        type: leaf.type ?? null,
        repetition_type: leaf.repetition_type ?? null,
        converted_type: leaf.converted_type ?? null,
      })),
    },
  };
}

export async function readParquetRows(
  file: ArrayBuffer,
  limit: number,
  columns?: readonly string[],
): Promise<Array<Record<string, unknown>>> {
  const api = await loadParquet();
  const metadata = api.parquetMetadata(file);
  // `rowEnd` is passed to the reader so only the requested rows are decoded. Materialising a multi-
  // gigabyte file to return twenty rows would work and be useless.
  const rows = await api.parquetReadObjects({
    file,
    metadata,
    ...(columns && columns.length > 0 ? { columns: [...columns] } : {}),
    rowStart: 0,
    rowEnd: limit,
  });
  return rows.map((row) => jsonSafe(row) as Record<string, unknown>);
}

/**
 * BigInt-safe conversion.
 *
 * Numbers are kept when the value round-trips exactly; anything above `Number.MAX_SAFE_INTEGER` becomes
 * a string rather than an approximation, because a caller comparing ids cannot tell a rounded value
 * from a correct one.
 */
function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out[key] = jsonSafe(entry);
    }
    return out;
  }
  return value;
}
