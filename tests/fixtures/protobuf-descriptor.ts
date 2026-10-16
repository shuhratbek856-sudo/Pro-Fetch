/**
 * A hand-encoded protobuf FileDescriptorSet and a matching message.
 *
 * `protoc` is not available here, and compiling a `.proto` is exactly what the tool deliberately does
 * not do - it consumes a descriptor set instead. So the fixture encodes the wire format directly, which
 * also keeps the test honest about what the tool is actually asked to parse.
 *
 * Wire format: each field is a varint tag `(field_number << 3) | wire_type`, then the value.
 * wire_type 2 is length-delimited, 0 is a varint.
 */

const varint = (value: number): Buffer => {
  const out: number[] = [];
  let remaining = value;
  while (remaining > 0x7f) {
    out.push((remaining & 0x7f) | 0x80);
    remaining = Math.floor(remaining / 128);
  }
  out.push(remaining);
  return Buffer.from(out);
};

const tag = (field: number, wireType: number): Buffer => varint((field << 3) | wireType);
const lengthDelimited = (field: number, value: Buffer): Buffer =>
  Buffer.concat([tag(field, 2), varint(value.length), value]);
const stringField = (field: number, value: string): Buffer => lengthDelimited(field, Buffer.from(value, 'utf8'));
const varintField = (field: number, value: number): Buffer => Buffer.concat([tag(field, 0), varint(value)]);

/** FieldDescriptorProto.type: 9 = TYPE_STRING, 5 = TYPE_INT32. */
const TYPE_STRING = 9;
const TYPE_INT32 = 5;

export interface ProtobufFixture {
  descriptorSet: Buffer;
  message: Buffer;
  messageType: string;
}

/**
 * `syntax = "proto3"; message Person { string name = 1; int32 age = 2; }`
 *
 * The package is left empty and the message is named `Person`, so the fully qualified name to pass to
 * the tool is `Person`.
 */
export function buildPersonFixture(): ProtobufFixture {
  // `json_name` (field 10) is written by every real protoc output and is what `toJson` uses for the
  // key. Without it the descriptor parses fine and the JSON comes back as `{"": 30}` - the field name
  // is simply absent, with nothing to say so.
  const nameField = Buffer.concat([
    stringField(1, 'name'),
    varintField(3, 1),
    varintField(5, TYPE_STRING),
    stringField(10, 'name'),
  ]);
  const ageField = Buffer.concat([
    stringField(1, 'age'),
    varintField(3, 2),
    varintField(5, TYPE_INT32),
    stringField(10, 'age'),
  ]);
  const personDescriptor = Buffer.concat([
    stringField(1, 'Person'),
    lengthDelimited(2, nameField),
    lengthDelimited(2, ageField),
  ]);
  // FileDescriptorProto: name = 1, message_type = 4, syntax = 12. Getting those numbers wrong is not
  // caught by any type checker - the descriptor simply fails to parse with "illegal tag: field no 13".
  const fileDescriptor = Buffer.concat([
    stringField(1, 'person.proto'),
    lengthDelimited(4, personDescriptor),
    stringField(12, 'proto3'),
  ]);
  const descriptorSet = lengthDelimited(1, fileDescriptor);

  const message = Buffer.concat([stringField(1, 'Ali'), varintField(2, 30)]);

  return { descriptorSet, message, messageType: 'Person' };
}
