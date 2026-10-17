/**
 * ZIP reading and writing, implemented here rather than through a dependency.
 *
 * A ZIP file is a small, fully specified format, and the four things that matter about handling one
 * are all security decisions rather than clever code:
 *
 * **Entry names are attacker-controlled strings.** `../../.ssh/authorized_keys` is a valid entry name
 * in a perfectly well-formed archive, and writing it out verbatim is how a tool that "extracts a zip"
 * becomes arbitrary file write. Every name goes through `entryPath` before it touches the disk.
 *
 * **The declared sizes are claims, not measurements.** An entry can claim to expand to 100 GB from a
 * few hundred compressed bytes. Nothing is written before the inflated length is checked against a
 * limit, and the check is on the *actual* inflated byte count rather than the header field.
 *
 * **The central directory can disagree with the local headers.** Readers that trust the local header
 * instead of the central directory are the ones that get exploited, because the two can name different
 * files. This module takes its names, sizes and CRCs from the central directory and treats the local
 * header only as a way to find the data.
 *
 * **A CRC is a check, not a security boundary.** It is verified because a wrong answer is worse than
 * no answer, and it is never presented as more than that.
 */

import { deflateRawSync, inflateRawSync } from 'node:zlib';

export const METHOD_STORE = 0;
export const METHOD_DEFLATE = 8;

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_EOCD_LOCATOR = 0x07064b50;

/** Refuse anything larger than this by default. A 4 GB "text file" is an attack, not a document. */
export const DEFAULT_MAX_INFLATED_BYTES = 512 * 1024 * 1024;
/** And this many entries. Each costs a directory record even when every entry is empty. */
export const DEFAULT_MAX_ENTRIES = 10_000;

export interface ZipEntry {
  /** The name exactly as stored, which may be unsafe to write to disk. */
  name: string;
  method: number;
  compressed_size: number;
  uncompressed_size: number;
  crc32: number;
  dos_time: number;
  dos_date: number;
  is_directory: boolean;
  comment: string;
  /** Offset of this entry's local header, from the central directory. */
  local_offset: number;
}

export interface Archive {
  entries: ZipEntry[];
  comment: string;
  /** Set when the archive declares a ZIP64 size the 32-bit fields cannot express. */
  zip64: boolean;
}

// ---------------------------------------------------------------------------------------------
// CRC-32
// ---------------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(data: Buffer, seed = 0): number {
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (let index = 0; index < data.length; index += 1) {
    crc = (CRC_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------

function findEndOfCentralDirectory(buffer: Buffer): number {
  // The EOCD is at the end unless there is a trailing comment, so scan backwards over the maximum
  // comment length rather than assuming the last 22 bytes.
  const minimum = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

export function readZip(input: Buffer, maxEntries = DEFAULT_MAX_ENTRIES): Archive {
  if (input.length < 22) throw new Error('ZIP fayl juda qisqa: boshlang‘ich qismi ham yo‘q.');
  const eocd = findEndOfCentralDirectory(input);
  if (eocd < 0) throw new Error('ZIP fayl oxirida markaziy katalog topilmadi (bu ZIP emas).');

  const entryCount = input.readUInt16LE(eocd + 10);
  const directorySize = input.readUInt32LE(eocd + 12);
  const directoryOffset = input.readUInt32LE(eocd + 16);
  const commentLength = input.readUInt16LE(eocd + 20);
  const comment = input.subarray(eocd + 22, eocd + 22 + commentLength).toString('utf8');

  if (entryCount > maxEntries) {
    throw new Error(`arkivda ${entryCount} ta yozuv bor, chegaradan ko‘p (${maxEntries}).`);
  }

  // ZIP64: the 32-bit fields saturate at 0xffffffff/0xffff, and the real values live in a separate
  // record. Report it rather than pretending the counts are literal.
  const zip64 = entryCount === 0xffff || directoryOffset === 0xffffffff || directorySize === 0xffffffff;
  let entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  if (cursor >= 0 && cursor + directorySize <= input.length) {
    entries = [];
    for (let index = 0; index < entryCount; index += 1) {
      if (cursor + 46 > input.length) throw new Error(`markaziy katalog ${index}-yozuvda kesilib qoldi.`);
      if (input.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
        throw new Error(`markaziy katalog ${index}-yozuvda noto‘g‘ri imzo.`);
      }
      const method = input.readUInt16LE(cursor + 10);
      const dosTime = input.readUInt16LE(cursor + 12);
      const dosDate = input.readUInt16LE(cursor + 14);
      const crc = input.readUInt32LE(cursor + 16);
      const compressedSize = input.readUInt32LE(cursor + 20);
      const uncompressedSize = input.readUInt32LE(cursor + 24);
      const nameLength = input.readUInt16LE(cursor + 28);
      const extraLength = input.readUInt16LE(cursor + 30);
      const entryCommentLength = input.readUInt16LE(cursor + 32);
      const localOffset = input.readUInt32LE(cursor + 42);
      const nameStart = cursor + 46;
      const name = input.subarray(nameStart, nameStart + nameLength).toString('utf8');
      const entryComment = input
        .subarray(nameStart + nameLength + extraLength, nameStart + nameLength + extraLength + entryCommentLength)
        .toString('utf8');

      entries.push({
        name,
        method,
        compressed_size: compressedSize,
        uncompressed_size: uncompressedSize,
        crc32: crc,
        dos_time: dosTime,
        dos_date: dosDate,
        is_directory: name.endsWith('/') || name.endsWith('\\'),
        comment: entryComment,
        local_offset: localOffset,
      });
      cursor = nameStart + nameLength + extraLength + entryCommentLength;
    }
  }

  return { entries, comment, zip64 };
}

/**
 * The bytes of one entry, inflated and CRC-checked.
 *
 * The inflate limit is applied to what actually comes out, not to the header's claim, because the
 * header is the part an attacker controls.
 */
export function readEntry(archive: Buffer, entry: ZipEntry, maxInflatedBytes = DEFAULT_MAX_INFLATED_BYTES): Buffer {
  if (entry.local_offset + 30 > archive.length) {
    throw new Error(`${entry.name}: mahalliy sarlavha fayl chegarasidan tashqarida.`);
  }
  if (archive.readUInt32LE(entry.local_offset) !== LOCAL_SIGNATURE) {
    throw new Error(`${entry.name}: mahalliy sarlavha imzosi noto‘g‘ri.`);
  }
  const nameLength = archive.readUInt16LE(entry.local_offset + 26);
  const extraLength = archive.readUInt16LE(entry.local_offset + 28);
  const dataStart = entry.local_offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressed_size;
  if (dataEnd > archive.length) {
    throw new Error(`${entry.name}: siqilgan ma'lumot fayl chegarasidan tashqarida.`);
  }
  const raw = archive.subarray(dataStart, dataEnd);
  if (entry.compressed_size === 0 && entry.uncompressed_size === 0) return Buffer.alloc(0);

  let data: Buffer;
  if (entry.method === METHOD_STORE) {
    data = Buffer.from(raw);
  } else if (entry.method === METHOD_DEFLATE) {
    data = inflateRawSync(raw, { maxOutputLength: maxInflatedBytes });
  } else {
    throw new Error(`${entry.name}: qo‘llab-quvvatlanmaydigan siqish usuli ${entry.method}.`);
  }

  if (data.length > maxInflatedBytes) {
    throw new Error(`${entry.name}: ochilgan hajm ${data.length} bayt, chegaradan ko‘p (${maxInflatedBytes}).`);
  }
  const actual = crc32(data);
  if (entry.crc32 !== 0 && actual !== entry.crc32) {
    throw new Error(`${entry.name}: CRC mos kelmadi ( kutilgan ${entry.crc32}, ${actual}).`);
  }
  return data;
}

// ---------------------------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------------------------

export interface SafeEntryName {
  /** The path to write, relative and slash-separated. */
  path: string;
  /** Why a name was changed, for the caller to report rather than hide. */
  note?: string;
  /** True when the name tried to leave the destination entirely and was rewritten. */
  contained: boolean;
}

/**
 * Turn a stored entry name into a path that stays inside the destination.
 *
 * Three separate escapes are handled, because each has to be: `..` segments, an absolute path, and a
 * Windows drive letter. Backslashes are folded to forward slashes first, because an archive written on
 * Windows can name `..\..\x` and a POSIX-only check reads that as one harmless filename.
 */
export function entryPath(name: string): SafeEntryName {
  const unified = name.replace(/\\/g, '/');
  const wasAbsolute = unified.startsWith('/');
  const withoutLeadingSlash = unified.replace(/^\/+/, '');
  const segments: string[] = [];
  let traversal = false;
  for (const segment of withoutLeadingSlash.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      traversal = true;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  // A drive letter such as `C:` in the first segment is not a legal directory name here.
  const driveLetter = /^[A-Za-z]:/.test(withoutLeadingSlash);
  const cleaned = segments.filter((segment, index) => !(index === 0 && /^[A-Za-z]:$/.test(segment)));
  const result = cleaned.join('/');

  // `contained` means "this name had to be changed to stay inside the destination". An absolute path
  // and a drive letter both count: each was rewritten. The first version reported only `..` traversal,
  // so an absolute name came back flagged as safe while having silently lost its leading slash - the
  // caller reading `contained: false` would assume nothing was touched.
  const contained = traversal || wasAbsolute || driveLetter;
  const note = !contained
    ? undefined
    : traversal
      ? 'nom ichki yo‘lni tashqariga chiqishga urinildi va tozalandi'
      : 'nom mutlaq yo‘l edi va nisbiyga o‘zgartirildi';

  return { path: result, note, contained };
}

// ---------------------------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------------------------

export interface WriteEntry {
  name: string;
  data: Buffer;
  /** `deflate` is the default; `store` is for data that is already compressed. */
  method?: typeof METHOD_STORE | typeof METHOD_DEFLATE;
  dos_date?: number;
  dos_time?: number;
  comment?: string;
}

/** MS-DOS date and time, the format every ZIP tool reads. */
export function toDosDateTime(date: Date): { date: number; time: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
  };
}

/**
 * Build an archive.
 *
 * The archive comment is a real field at the end of the end-of-central-directory record, and the
 * first version accepted a `comment` argument and wrote a zero length instead. `pro_zip_create` took
 * a comment from the caller, reported it back in its own summary, and dropped it on the way into the
 * file - so `pro_zip_inspect` on the result reported none, with nothing in between indicating a loss.
 */
export function writeZip(entries: WriteEntry[], comment = ''): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const isDirectory = entry.name.endsWith('/');
    const data = isDirectory ? Buffer.alloc(0) : entry.data;
    const method = isDirectory ? METHOD_STORE : (entry.method ?? METHOD_DEFLATE);
    // Storing is not always smaller: deflate adds a header to data shorter than about 16 bytes, so
    // choosing by actual comparison beats choosing by method.
    const deflated = method === METHOD_DEFLATE ? deflateRawSync(data, { level: 9 }) : Buffer.alloc(0);
    const useDeflate = method === METHOD_DEFLATE && deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const effectiveMethod = useDeflate ? METHOD_DEFLATE : METHOD_STORE;
    const crc = crc32(data);

    const nameBytes = Buffer.from(entry.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(effectiveMethod, 8);
    local.writeUInt16LE(entry.dos_time ?? 0, 10);
    local.writeUInt16LE(entry.dos_date ?? 0x21, 12); // 1980-01-01
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, payload);

    const commentBytes = Buffer.from(entry.comment ?? '', 'utf8');
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(effectiveMethod, 10);
    central.writeUInt16LE(entry.dos_time ?? 0, 12);
    central.writeUInt16LE(entry.dos_date ?? 0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(commentBytes.length, 32);
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    // The high two bytes of the external attributes carry the Unix mode, which is how an extracted
    // file keeps its permissions. 0644 for a file, 0755 for a directory.
    central.writeUInt32LE(((isDirectory ? 0o040755 : 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes, commentBytes);

    offset += local.length + nameBytes.length + payload.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  // The comment length field is two bytes, so a longer comment cannot be stored and must not be
  // silently truncated to whatever fits.
  const commentBytes = Buffer.from(comment, 'utf8');
  if (commentBytes.length > 0xffff) {
    throw new Error(`arxiv izohi ${commentBytes.length} bayt, ZIP faqat 65535 baytga sig‘adi.`);
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(commentBytes.length, 20);

  return Buffer.concat([...locals, centralBuffer, eocd, commentBytes]);
}

/** A ZIP64 end-of-central-directory locator, for archives the 32-bit fields cannot describe. */
export function zip64Locator(archiveSize: number): Buffer {
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(ZIP64_EOCD_LOCATOR, 0);
  locator.writeUInt32LE(0, 4);
  // `writeUInt64LE` does not exist on Buffer - the 64-bit writers are BigInt-only. TypeScript caught
  // this at build time rather than at runtime, which is the one piece of good luck in this function.
  locator.writeBigUInt64LE(BigInt(archiveSize), 8);
  locator.writeUInt32LE(1, 16);
  return locator;
}

// ---------------------------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------------------------

export interface ArchiveSummary {
  entries: number;
  files: number;
  directories: number;
  compressed_bytes: number;
  uncompressed_bytes: number;
  /** null when the archive holds nothing, since an empty ratio has no value to report. */
  compression_ratio: number | null;
  methods: Record<string, number>;
  largest: Array<{ name: string; uncompressed_bytes: number }>;
  total_entries_over_limit: number;
}

export function summarise(archive: Archive): ArchiveSummary {
  let compressed = 0;
  let uncompressed = 0;
  let directories = 0;
  let methods: Record<string, number> = {};
  const sizes: Array<{ name: string; uncompressed_bytes: number }> = [];

  for (const entry of archive.entries) {
    compressed += entry.compressed_size;
    uncompressed += entry.uncompressed_size;
    if (entry.is_directory) directories += 1;
    const label =
      entry.method === METHOD_STORE ? 'store' : entry.method === METHOD_DEFLATE ? 'deflate' : `method_${entry.method}`;
    methods[label] = (methods[label] ?? 0) + 1;
    sizes.push({ name: entry.name, uncompressed_bytes: entry.uncompressed_size });
  }

  sizes.sort((a, b) => b.uncompressed_bytes - a.uncompressed_bytes);

  return {
    entries: archive.entries.length,
    files: archive.entries.length - directories,
    directories,
    compressed_bytes: compressed,
    uncompressed_bytes: uncompressed,
    compression_ratio: uncompressed > 0 ? Number((uncompressed / compressed).toFixed(3)) : null,
    methods,
    largest: sizes.slice(0, 5),
    // A ratio far above what deflate can explain on real data is the signature of an archive whose
    // purpose is to fill a disk. Reported, never acted on.
    total_entries_over_limit: compressed > 0 && uncompressed / compressed > 1000 ? 1 : 0,
  };
}
