// Locks the three binary readers against real files, not against the shape of the code.
//
// Two of the three fixtures are encoded here rather than produced by the library under test, and that
// is the point of them:
//
//   - avsc 5.7.9's **writer** is broken on Node 24: `type.toBuffer([{...}])` throws
//     `invalid "string": undefined` for a plain string, an int and a record alike. Its reader is fine,
//     which is the half `pro_binary_avro_read` uses. So the Avro fixture is a hand-encoded object
//     container, which also means the test does not validate the reader against the writer that made
//     the bug invisible in the first place.
//   - `protoc` is not available, and the protobuf tool deliberately consumes a descriptor set rather
//     than compiling a `.proto`. So the descriptor is encoded field by field.
//
// The Parquet file is a real one from `apache/parquet-testing` (alltypes_plain.parquet, 8 rows, 11
// columns) and is committed as a fixture: hyparquet cannot write Parquet, so there is no way to
// produce it at test time.
//
// Three implementation details were found by measurement and are easy to regress, so each is asserted
// rather than assumed:
//
//   - hyparquet's `parquetReadObjects` **returns** rows; its `onComplete` is never called and awaiting
//     it yields zero rows while the real data sits in the return value.
//   - Parquet int64 columns decode as `BigInt`, which `JSON.stringify` refuses to serialise. The tool
//     has to convert, exactly, or a large id comes back rounded.
//   - avsc's container reader is a Duplex stream that emits only once the writable side finishes, so
//     reading the row count immediately after `write()` returns zero.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import '../src/loader.js';
import { callTool } from '../src/router.js';
import { buildAvroFixture } from './fixtures/avro-container.js';
import { buildPersonFixture } from './fixtures/protobuf-descriptor.js';
import type { ToolResult } from '../src/core/types.js';

const ORIGINAL = { ...process.env };
beforeEach(() => {
  process.env = { ...ORIGINAL };
  process.env.PRO_FETCH_PROFILE = 'full';
});
afterEach(() => {
  process.env = { ...ORIGINAL };
});

const text = (result: ToolResult): string =>
  (result.content ?? [])
    .filter((item) => item.type === 'text')
    .map((item) => item.text)
    .join('\n');

const payload = (result: ToolResult): Record<string, any> => {
  const body = text(result);
  const start = body.indexOf('```json');
  if (start < 0) throw new Error(`natijada JSON blok yo'q: ${body.slice(0, 160)}`);
  const end = body.indexOf('```', start + 7);
  return JSON.parse(body.slice(start + 7, end < 0 ? undefined : end));
};

const PARQUET = readFileSync('tests/fixtures/sample.parquet');

describe('pro_binary_parquet_read', () => {
  it('reads a real file: rows, schema and provenance', async () => {
    const result = await callTool('pro_binary_parquet_read', {
      base64: PARQUET.toString('base64'),
    });
    const data = payload(result);
    // 8 rows is the point: the parquet-wasm version of this tool reported 0 for this same file.
    expect(data.num_rows).toBe(8);
    expect(data.schema.fields.length).toBeGreaterThanOrEqual(8);
    expect(data.created_by).toContain('impala');
    expect(data.rows.length).toBe(8);
  });

  it('reports truncation instead of silently returning a prefix', async () => {
    const data = payload(
      await callTool('pro_binary_parquet_read', {
        base64: PARQUET.toString('base64'),
        rows: 3,
      }),
    );
    expect(data.rows_returned).toBe(3);
    expect(data.truncated).toBe(true);
  });

  it('honours a column projection', async () => {
    const data = payload(
      await callTool('pro_binary_parquet_read', {
        base64: PARQUET.toString('base64'),
        columns: ['int_col'],
      }),
    );
    expect(Object.keys(data.rows[0])).toEqual(['int_col']);
  });

  it('names the columns that exist when one does not', async () => {
    const result = await callTool('pro_binary_protobuf_decode', {
      base64: 'AA==',
      message_type: 'X',
    });
    expect(result.isError).toBeTruthy();

    const parquet = await callTool('pro_binary_parquet_read', {
      base64: PARQUET.toString('base64'),
      columns: ['nope'],
    });
    expect(text(parquet)).toMatch(/topilmadi/);
    expect(text(parquet)).toMatch(/int_col/);
  });

  it('refuses a file that is not Parquet', async () => {
    const result = await callTool('pro_binary_parquet_read', {
      base64: Buffer.from('this is not parquet').toString('base64'),
    });
    expect(result.isError).toBeTruthy();
    expect(text(result)).toMatch(/Parquet fayli emas/);
  });
});

describe('pro_binary_avro_read', () => {
  const fixture = buildAvroFixture();

  it('reads an object container, using the schema the file carries', async () => {
    const result = await callTool('pro_binary_avro_read', {
      base64: fixture.buffer.toString('base64'),
    });
    const data = payload(result);
    expect(data.layout).toBe('container');
    expect(data.codec).toBe('null');
    expect(data.schema_name).toBe('Person');
    expect(data.records).toHaveLength(2);
    expect(data.records[0]).toEqual({ name: 'Ali', age: 30 });
  });

  it('needs a schema only when the input is a bare value', async () => {
    const without = await callTool('pro_binary_avro_read', {
      base64: fixture.buffer.toString('base64'),
    });
    expect(without.isError).toBeFalsy();

    const bare = Buffer.from([
      6,
      65,
      108,
      105, // string "Ali"
      60, // int 30
    ]);
    const missing = await callTool('pro_binary_avro_read', {
      base64: bare.toString('base64'),
    });
    expect(missing.isError).toBeTruthy();
    expect(text(missing)).toMatch(/konteyner fayl emas/);

    const given = await callTool('pro_binary_avro_read', {
      base64: bare.toString('base64'),
      schema: JSON.stringify(fixture.schema),
    });
    expect(payload(given).records[0]).toEqual({ name: 'Ali', age: 30 });
  });

  it('reports a broken schema with the parser position', async () => {
    const result = await callTool('pro_binary_avro_read', {
      base64: fixture.buffer.toString('base64'),
      schema: '{not json',
    });
    expect(result.isError).toBeTruthy();
    expect(text(result)).toMatch(/Sxema JSON emas/);
  });
});

describe('pro_binary_protobuf_decode', () => {
  const fixture = buildPersonFixture();
  const descriptor = fixture.descriptorSet.toString('base64');
  const message = fixture.message.toString('base64');

  it('decodes a message against a descriptor set', async () => {
    const result = await callTool('pro_binary_protobuf_decode', {
      base64: message,
      descriptor_set: descriptor,
      message_type: 'Person',
    });
    const data = payload(result);
    expect(data.message).toEqual({ name: 'Ali', age: 30 });
    expect(data.descriptor_bytes).toBe(fixture.descriptorSet.length);
  });

  it('lists the messages it does have when the name is wrong', async () => {
    const result = await callTool('pro_binary_protobuf_decode', {
      base64: message,
      descriptor_set: descriptor,
      message_type: 'Nope',
    });
    expect(result.isError).toBeTruthy();
    expect(text(result)).toMatch(/topilmadi/);
    expect(text(result)).toMatch(/Person/);
  });

  it('says which input is missing', async () => {
    const noDescriptor = await callTool('pro_binary_protobuf_decode', {
      base64: message,
      message_type: 'Person',
    });
    expect(text(noDescriptor)).toMatch(/descriptor_set/);

    const noType = await callTool('pro_binary_protobuf_decode', {
      base64: message,
      descriptor_set: descriptor,
    });
    expect(noType.isError).toBeTruthy();
  });
});

describe('the fixtures are real', () => {
  it('the parquet file is a Parquet file', () => {
    // Without this the suite could pass against an empty buffer and a decoder that reports zero rows
    // for everything - which is exactly the defect this test file exists to prevent.
    expect(PARQUET.length).toBeGreaterThan(1000);
    expect(PARQUET.toString('ascii', 0, 4)).toBe('PAR1');
    expect(PARQUET.toString('ascii', PARQUET.length - 4)).toBe('PAR1');
  });

  it('the avro container starts with the container magic', () => {
    const fixture = buildAvroFixture();
    expect(fixture.buffer.toString('ascii', 0, 3)).toBe('Obj');
    expect(fixture.buffer[3]).toBe(1);
  });
});
