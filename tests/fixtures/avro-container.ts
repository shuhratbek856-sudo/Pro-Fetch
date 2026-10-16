// A genuine Avro OCF file, encoded by hand.
//
// avsc 5.7.9's *writer* is broken on Node 24 - `Type.forSchema('string').toBuffer(['a'])` throws
// `invalid "string": undefined` - so a fixture cannot be produced with the library that is being
// tested. Its reader is fine, which is the half this tool uses.
//
// OCF layout, per the Avro specification:
//
//   "Obj" + 0x01          magic and version
//   map<string,bytes>     metadata: long count, that many key/value pairs, then a 0 terminator
//   16 bytes              sync marker
//   blocks                long count, long byte size, payload ... then a 0 terminator
//
// long is zig-zag + varint; string is a long length followed by UTF-8 bytes.

const zig = (value: number): Buffer => {
  const n = (value << 1) ^ (value >> 31);
  const out: number[] = [];
  let v = n;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return Buffer.from(out);
};

const bytes = (value: Buffer): Buffer => Buffer.concat([zig(value.length), value]);
const text = (value: string): Buffer => bytes(Buffer.from(value, 'utf8'));

const meta = (entries: Array<[string, string]>): Buffer =>
  Buffer.concat([
    zig(entries.length),
    ...entries.map(([key, value]) => Buffer.concat([text(key), bytes(Buffer.from(value, 'utf8'))])),
    zig(0),
  ]);

const sync = Buffer.alloc(16, 0x2a);

export interface AvroFixture {
  schema: Record<string, unknown>;
  buffer: Buffer;
}

/** Two records of `{name: string, age: int}` in a single-block OCF file. */
export function buildAvroFixture(): AvroFixture {
  const schema = {
    type: 'record',
    name: 'Person',
    fields: [
      { name: 'name', type: 'string' },
      { name: 'age', type: 'int' },
    ],
  } as Record<string, unknown>;

  const records = [
    { name: 'Ali', age: 30 },
    { name: 'Vali', age: 25 },
  ];

  const payload = Buffer.concat(records.map((record) => Buffer.concat([text(record.name), zig(record.age)])));

  const header = Buffer.concat([
    Buffer.from('Obj', 'ascii'),
    Buffer.from([1]),
    meta([
      ['avro.schema', JSON.stringify(schema)],
      ['avro.codec', 'null'],
    ]),
    sync,
  ]);

  // The block terminator is **two** zero longs - count and size - not one. Writing a single zero
  // makes every decoder read past the end of the file and report `truncated buffer`, which looks like a
  // corrupt file rather than a malformed fixture.
  const block = Buffer.concat([zig(records.length), zig(payload.length), payload, zig(0), zig(0)]);
  return { schema, buffer: Buffer.concat([header, block]) };
}
