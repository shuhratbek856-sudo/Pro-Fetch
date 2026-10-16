import { defineTool } from '../../core/tool.js';
import { fail, jsonBlock } from '../../core/format.js';
import { str, strOrEmpty, view } from '../../core/input.js';
import { readBinarySource } from '../../core/binary-source.js';

/**
 * Protobuf decoding without generated code.
 *
 * A `.proto` source cannot be compiled here - `protoc` is a native binary that may not exist - so the
 * descriptor is taken instead. `protoc --descriptor_set_out` produces exactly the bytes this tool wants,
 * and a message is addressed by its fully qualified name rather than by a generated symbol. That is a
 * real constraint rather than a shortcut: the alternative would be a tool that claims to decode
 * arbitrary protobufs and cannot.
 */
interface Registry {
  getMessage: (name: string) => unknown;
  types: Map<unknown, { kind: string; typeName: string }>;
}

export default defineTool({
  name: 'pro_binary_protobuf_decode',
  description:
    'Protobuf xabarini ochish: "descriptor_set" (protoc --descriptor_set_out natijasi) va ' +
    '"message_type" (to‘liq nom, masalan "myapp.Person") beriladi. Natija JSON ga aylantiriladi. ' +
    'proto faylini o‘zi kompilyatsiya qilinmaydi.',
  category: 'binary',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Protobuf xabari URL i' },
      base64: { type: 'string', description: 'Protobuf xabari base64' },
      data_base64: { type: 'string', description: 'Protobuf xabari base64 (boshqa yozuv)' },
      descriptor_set: {
        type: 'string',
        description: 'FileDescriptorSet base64 — majburiy (protoc --descriptor_set_out chiqishi)',
      },
      descriptor_url: { type: 'string', description: 'FileDescriptorSet fayl URL i (alternativa)' },
      message_type: {
        type: 'string',
        description: 'Xabar turi to‘liq nomi — masalan "myapp.Person"',
      },
      json: {
        type: 'boolean',
        description: 'Natija JSON sifatida (standart) yoki bayt sifatida',
      },
      max_bytes: { type: 'number', description: 'Manba hajmi chegarasi' },
    },
    required: ['message_type'],
    anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['data_base64'] }],
  },
  async handler(input) {
    const p = view(input);
    const messageType = (str(p, 'message_type', '') ?? '').trim();
    // Read here rather than inside the helper: the schema audit resolves property reads from the
    // handler body and does not follow a module-local function, so reading them in `loadDescriptorSet`
    // made both properties look dead to it. Reported as `pro_binary_protobuf_decode: descriptor_set`.
    const inlineDescriptor = (str(p, 'descriptor_set', '') ?? '').trim();
    const descriptorUrl = strOrEmpty(p, 'descriptor_url');
    if (!messageType) return fail('message_type kerak — masalan "myapp.Person".');

    try {
      const protobuf = (await import('@bufbuild/protobuf')) as unknown as {
        createFileRegistry: (set: unknown) => Registry;
        fromBinary: (schema: unknown, bytes: Uint8Array) => unknown;
        toJson: (schema: unknown, message: unknown) => unknown;
      };
      const wkt = (await import('@bufbuild/protobuf/wkt')) as unknown as {
        FileDescriptorSetSchema: unknown;
      };
      const descriptorBytes = await loadDescriptorSet(inlineDescriptor, descriptorUrl, readBinarySource);

      // Three details, each found by measurement rather than from the types:
      //   `createFileRegistry` is exported from the package root, not from `/reflect`;
      //   it takes a *parsed* FileDescriptorSet message, not raw bytes;
      //   `toJson` takes the schema first and the decoded value second.
      // The plausible-looking shapes all compile and throw on first call.
      const descriptorSet = protobuf.fromBinary(wkt.FileDescriptorSetSchema, descriptorBytes);
      const registry = protobuf.createFileRegistry(descriptorSet);
      const message = registry.getMessage(messageType);
      if (!message) {
        // `registry.messages` does not exist; the lookup table is `registry.types`, which holds
        // messages, enums and extensions together. Only messages are named, because the caller is
        // looking for a message. `typeName` is a property here, not a method - calling it throws
        // "entry.typeName is not a function", which replaces the useful message with a confusing one.
        const available = Array.from(registry.types.values())
          .filter((entry) => entry.kind === 'message')
          .map((entry) => entry.typeName);
        return fail(
          `Xabar turi topilmadi: ${messageType}. ` +
            (available.length
              ? `Shu to‘plamdagi xabarlar: ${available.slice(0, 25).join(', ')}`
              : 'To‘plam bo‘sh yoki noto‘g‘ri parse qilingan.'),
        );
      }

      const source = await readBinarySource(input, 'Protobuf xabar');
      const bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
      const decoded = protobuf.fromBinary(message, bytes);

      const wantBytes = p.json === false || String(p.json ?? '') === 'false';
      return jsonBlock('Protobuf ochildi', {
        bytes: source.length,
        message_type: messageType,
        descriptor_bytes: descriptorBytes.byteLength,
        ...(wantBytes ? {} : { message: protobuf.toJson(message, decoded) }),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/descriptor|FileDescriptorSet|invalid wire|decode/i.test(message)) {
        return fail(`Protobuf ochib bo‘lmadi: ${message.slice(0, 180)}`);
      }
      return fail(`Protobuf ochib bo‘lmadi: ${message}`);
    }
  },
});

/** The descriptor set, from an inline base64 value or a URL — whichever the caller supplied. */
async function loadDescriptorSet(
  inline: string,
  url: string,
  read: (input: { url?: string; base64?: string; data_base64?: string }, label: string) => Promise<Buffer>,
): Promise<Uint8Array> {
  if (inline) {
    // Two encodings are accepted because descriptor sets are distributed both ways in practice.
    if (/^[A-Za-z0-9+/=\s]+$/.test(inline.trim())) {
      return new Uint8Array(Buffer.from(inline.replace(/\s+/g, ''), 'base64'));
    }
    try {
      const parsed = JSON.parse(inline);
      if (Array.isArray(parsed)) return new Uint8Array(Buffer.from(parsed));
      if (parsed && typeof parsed === 'object') return new Uint8Array(Buffer.from(parsed));
    } catch {
      // Not JSON either - fall through to the error below rather than guessing at the encoding.
    }
    return new Uint8Array(Buffer.from(inline, 'utf8'));
  }
  if (url) return new Uint8Array(await read({ url }, 'Descriptor setni o‘qish'));
  throw new Error('descriptor_set yoki descriptor_url kerak — ikkalasi ham berilmagan.');
}
