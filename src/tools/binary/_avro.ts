/**
 * Avro object-container reading, on top of avsc.
 *
 * Two things forced this file to exist rather than a three-line call into avsc.
 *
 * **avsc has no buffer-based container reader.** `Type.fromBuffer` decodes one *raw* Avro value and
 * rejects an object container file outright with `truncated buffer`. The container path goes through
 * `streams.RawDecoder`, which is a Duplex stream: it emits values only once the writable side is
 * finished, so reading `decoded.length` straight after `write()` returns 0 and looks like an empty
 * file. Every use here awaits the `end` event, which is the whole reason this is centralised.
 *
 * **avsc's writer is broken on this Node.** `type.toBuffer([{...}])` throws
 * `invalid "string": undefined` on Node 24 - measured for a plain string, an int and a record. The
 * reader is unaffected. This tool only reads, so it is not a problem here, but it is why the test
 * fixture is a hand-encoded container file rather than one avsc produced.
 *
 * The container framing itself - magic, metadata map, sync marker, data blocks - is parsed here
 * because it is a fixed, specified layout and avsc does not expose the header for a buffer.
 */
import { inflateSync } from 'node:zlib';

type AvroModule = {
  Type: { forSchema: (schema: unknown, options?: unknown) => AvroType };
  streams: {
    RawDecoder: new (
      schema: unknown,
      options?: { noDecode?: boolean },
    ) => NodeJS.ReadWriteStream & { on: (event: string, listener: (...args: never[]) => void) => unknown };
  };
};

type AvroType = { name?: string; fromBuffer: (data: Buffer) => unknown };

export interface AvroContainerHeader {
  /** 'Obj\x01' when the input is an object container file; 'raw' when it is a bare value. */
  layout: 'container' | 'raw';
  codec: string | null;
  sync: Buffer | null;
  /** The schema the file itself declares, or null for a raw value. */
  embedded_schema: unknown;
  metadata: Record<string, string>;
}

export interface AvroDecodeResult extends AvroContainerHeader {
  records: unknown[];
  block_count: number;
}

let loaded: Promise<AvroModule> | null = null;

/**
 * avsc is CommonJS and assigns its exports at runtime, so an ESM import yields
 * `{ Service, default, module.exports }` and no named `Type`. Reaching for `Type` directly compiles
 * cleanly and throws `Cannot read properties of undefined` on first use - measured, not assumed.
 */
export async function loadAvro(): Promise<AvroModule> {
  if (!loaded) {
    loaded = (async () => {
      const imported = (await import('avsc')) as unknown as { default?: AvroModule };
      return imported.default ?? (imported as unknown as AvroModule);
    })();
  }
  return loaded;
}

/** Avro longs are zig-zag encoded varints. */
function readLong(buffer: Buffer, position: number): { value: number; next: number } {
  let shift = 0;
  let raw = 0;
  let byte: number;
  let cursor = position;
  do {
    if (cursor >= buffer.length) throw new Error('uzunlik chegarasi oshdi (buffer tugagan)');
    byte = buffer[cursor++];
    raw |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  return { value: (raw >>> 1) ^ -(raw & 1), next: cursor };
}

function readBytes(buffer: Buffer, position: number): { value: Buffer; next: number } {
  const length = readLong(buffer, position);
  const end = length.next + length.value;
  if (end > buffer.length) throw new Error('uzunlik chegarasi oshdi (buffer tugagan)');
  return { value: buffer.subarray(length.next, end), next: end };
}

/**
 * Read the container header.
 *
 * Returns `layout: 'raw'` for anything that does not start with the four magic bytes, so the caller can
 * fall back to a single-value decode instead of reporting a corrupt file.
 */
export function readContainerHeader(buffer: Buffer): AvroContainerHeader {
  if (buffer.length < 4 || buffer.toString('ascii', 0, 3) !== 'Obj') {
    return { layout: 'raw', codec: null, sync: null, embedded_schema: null, metadata: {} };
  }
  const version = buffer[3];
  if (version !== 1) {
    throw new Error(`Avro konteyner versiyasi ${version} — faqat 1 qo‘llab-quvvatlanadi.`);
  }

  let position = 4;
  const count = readLong(buffer, position);
  position = count.next;

  const metadata: Record<string, string> = {};
  for (let index = 0; index < count.value; index++) {
    const key = readBytes(buffer, position);
    position = key.next;
    const value = readBytes(buffer, position);
    position = value.next;
    metadata[key.value.toString('utf8')] = value.value.toString('utf8');
  }
  const terminator = readLong(buffer, position);
  position = terminator.next;

  // Sixteen bytes of sync marker. Nothing in this tool verifies data against it - that would mean
  // implementing the CRC-32-AVRO check - but skipping it correctly is what makes block parsing work.
  if (position + 16 > buffer.length) throw new Error('sync marker kesilgan');
  const sync = buffer.subarray(position, position + 16);
  position += 16;

  let embedded: unknown = null;
  if (metadata['avro.schema']) {
    try {
      embedded = JSON.parse(metadata['avro.schema']);
    } catch (error) {
      throw new Error(`Fayldagi avro.schema JSON emas: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    layout: 'container',
    codec: metadata['avro.codec'] ?? 'null',
    sync,
    embedded_schema: embedded,
    metadata,
    // Kept so the block walk can resume exactly where the header ended.
    ...({ header_end: position } as Record<string, unknown>),
  };
}

/** The offset the block walk starts at, recovered from the same place the header walk stopped. */
export function blockStart(buffer: Buffer): number {
  let position = 4;
  const count = readLong(buffer, position);
  position = count.next;
  for (let index = 0; index < count.value; index++) {
    position = readBytes(buffer, position).next;
    position = readBytes(buffer, position).next;
  }
  position = readLong(buffer, position).next + 16;
  return position;
}

/**
 * Decode an Avro input, container or bare.
 *
 * `schema` is the caller's schema. A container carries its own in `avro.schema`; when both are present
 * the file's wins, because a writer's schema is the one its bytes actually encode.
 */
export async function decodeAvro(buffer: Buffer, schema: unknown, limit: number): Promise<AvroDecodeResult> {
  const avro = await loadAvro();
  const header = readContainerHeader(buffer);

  if (header.layout === 'raw') {
    const type = avro.Type.forSchema(schema, { logicalTypes: true });
    const single = type.fromBuffer(buffer);
    const all = Array.isArray(single) ? single : [single];
    return { ...header, records: all.slice(0, limit), block_count: 0 };
  }

  const effective = header.embedded_schema ?? schema;
  const type = avro.Type.forSchema(effective, { logicalTypes: true });
  const codec = header.codec ?? 'null';

  const records: unknown[] = [];
  let position = blockStart(buffer);
  let blockCount = 0;

  while (position < buffer.length) {
    const count = readLong(buffer, position);
    position = count.next;
    const size = readLong(buffer, position);
    position = size.next;
    if (count.value === 0 && size.value === 0) break;

    // Block data is `size` raw bytes, not a length-prefixed byte string. Reading it as one runs the
    // next varint through the block payload and desynchronises every block after it.
    const bodyEnd = position + size.value;
    if (bodyEnd > buffer.length) throw new Error('blok chegarasi oshdi (buffer tugagan)');
    const body = buffer.subarray(position, bodyEnd);
    position = bodyEnd;
    if (records.length < limit) {
      let decoded: Buffer;
      if (codec === 'null') decoded = body;
      else if (codec === 'deflate') decoded = inflateSync(body);
      else {
        throw new Error(
          `"${codec}" kodek qo‘llab-quvvatlanmaydi. Faqat null va deflate o‘qiladi; ` +
            `boshqa siqilgan fayl uchun shu kodekli kutubxona kerak.`,
        );
      }
      records.push(...(await decodeBlock(avro, effective, decoded, limit - records.length)));
    }
    blockCount++;
  }

  return { ...header, records, block_count: blockCount, codec, ...(type.name ? {} : {}) };
}

/**
 * One block through avsc's streaming decoder.
 *
 * Awaiting `end` is not optional. The decoder buffers a partial record at the end of a chunk and only
 * emits what it has once the writable side finishes; reading the count immediately after `write()`
 * returns zero, which is indistinguishable from an empty block.
 */
function decodeBlock(avro: AvroModule, schema: unknown, data: Buffer, limit: number): Promise<unknown[]> {
  const decoder = new avro.streams.RawDecoder(schema);
  const values: unknown[] = [];
  decoder.on('data', ((value: unknown) => {
    if (values.length < limit) values.push(value);
  }) as never);
  decoder.on('error', (() => {}) as never);
  const finished = new Promise<void>((resolve) => {
    decoder.on('end', (() => resolve()) as never);
    decoder.on('close', (() => resolve()) as never);
  });
  decoder.write(data);
  decoder.end();
  return finished.then(() => values);
}
