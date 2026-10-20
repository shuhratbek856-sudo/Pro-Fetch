/**
 * Encoding and text transforms.
 *
 * Everything here is a pure function over a string: no network, no credential, no file. That is the
 * point of putting it first — a category that cannot be exercised without an API key cannot be
 * verified until someone holds that key, and 572 tools had no such category at all.
 */

import { timingSafeEqual } from 'node:crypto';
import { domainToASCII, domainToUnicode } from 'node:url';
import { defineTool } from '../../core/tool.js';
import { result, fail, jsonBlock } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';

// ---------------------------------------------------------------------------------------------
// Base-N codecs
//
// Implemented rather than taken from Buffer, because Node has no base32 or base58 and both appear in
// real identifiers: base32 in Kubernetes secrets and Google auth, base58 in Solana addresses.
// ---------------------------------------------------------------------------------------------

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '').toUpperCase().replace(/\s+/g, '');
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    const index = B32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`base32: noto'g'ri belgi "${char}".`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** Bitcoin/IPFS alphabet: digits and letters, but no 0, O, I or l. */
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function toBase58(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (let i = 0; bytes[i] === 0 && i < bytes.length - 1; i++) out += B58_ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i--) out += B58_ALPHABET[digits[i]];
  return out;
}

function fromBase58(text: string): Uint8Array {
  const out: number[] = [];
  for (const char of text) {
    const index = B58_ALPHABET.indexOf(char);
    if (index === -1) throw new Error(`base58: noto'g'ri belgi "${char}".`);
    let carry = index;
    for (let i = 0; i < out.length; i++) {
      carry += out[i] * 58;
      out[i] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) {
      out.push(carry & 255);
      carry >>= 8;
    }
  }
  for (let i = 0; text[i] === B58_ALPHABET[0] && i < text.length - 1; i++) out.push(0);
  return new Uint8Array(out.reverse());
}

const ASCII85_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~';

/**
 * Ascii85, the always-five-digits form.
 *
 * An earlier version tried the partial-group form, emitting `n+1` digits followed by `~>` per group.
 * That is not the variant the length is recoverable from, and it round-tripped wrongly for every input
 * whose length was not a multiple of four - one byte produced `VE~>`, which is not decodable. Adobe
 * Ascii85 pads the final group with zeros and writes a single `~>` at the end of the stream.
 *
 * The consequence is that trailing NUL bytes are not preserved, because a padded group is
 * indistinguishable from a full one. That is stated in the tool description rather than discovered.
 */
function toBase85(bytes: Uint8Array): string {
  let out = '';
  const padded = new Uint8Array(4);
  for (let i = 0; i < bytes.length; i += 4) {
    const chunk = bytes.subarray(i, i + 4);
    padded.fill(0);
    padded.set(chunk);
    let value = padded[0] * 0x1000000 + padded[1] * 0x10000 + padded[2] * 0x100 + padded[3];
    const chars: string[] = [];
    for (let j = 0; j < 5; j++) {
      chars.unshift(ASCII85_ALPHABET[value % 85]);
      value = Math.floor(value / 85);
    }
    out += chars.join('');
  }
  return bytes.length === 0 ? '' : out + '~>';
}

function fromBase85(text: string): Uint8Array {
  const clean = text.replace(/~>\s*$/, '').replace(/\s+/g, '');
  const out: number[] = [];
  for (let i = 0; i < clean.length; i += 5) {
    const group = clean.slice(i, i + 5);
    if (group.length === 0) break;
    if (group.length < 2) throw new Error('base85: qisman guruh kamida 2 belgidan iborat bo�lishi kerak.');
    let value = 0;
    for (const char of group) {
      const index = ASCII85_ALPHABET.indexOf(char);
      if (index === -1) throw new Error(`base85: noto'g'ri belgi "${char}".`);
      value = value * 85 + index;
    }
    const bytes = [
      Math.floor(value / 0x1000000) & 255,
      Math.floor(value / 0x10000) & 255,
      Math.floor(value / 0x100) & 255,
      value & 255,
    ];
    out.push(...bytes.slice(0, group.length - 1));
  }
  // The final group was zero-padded by the encoder, so trailing NULs are padding rather than data.
  while (out.length > 0 && out[out.length - 1] === 0) out.pop();
  return new Uint8Array(out);
}

/** Decode any of the recognised alphabets, used by the batch tool. */
function decodeAny(encoded: string, alphabet: string): Buffer {
  switch (alphabet.toLowerCase()) {
    case 'base32':
      return Buffer.from(fromBase32(encoded));
    case 'base58':
      return Buffer.from(fromBase58(encoded));
    case 'base85':
      return Buffer.from(fromBase85(encoded));
    case 'base64':
      return Buffer.from(encoded, 'base64');
    default:
      throw new Error(`Noma'lum alfavit: "${alphabet}". base32, base58, base85, base64.`);
  }
}

/** Reinterpret bytes as text in an encoding Node's Buffer understands, or as a hex/base64 dump. */
function bytesAsText(bytes: Uint8Array, encoding: string): string {
  const key = encoding.trim().toLowerCase();
  if (key === 'hex') return Buffer.from(bytes).toString('hex');
  if (key === 'base64') return Buffer.from(bytes).toString('base64');
  if (key === 'base64url') return Buffer.from(bytes).toString('base64url');
  return Buffer.from(bytes).toString(key as BufferEncoding);
}

/** Best-effort text detection for the decode tool, so a caller does not have to guess. */
function sniffText(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes);
  const slice = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (slice.includes(0)) return 'binary'; // a NUL byte means this is not text
  const utf8 = buffer.toString('utf8');
  const printable = [...utf8].filter((c) => c >= ' ' || c === '\n' || c === '\t' || c === '\r').length;
  return printable / Math.max(1, utf8.length) > 0.95 ? 'utf8' : 'latin1';
}

// ---------------------------------------------------------------------------------------------
// JWT
//
// Decode and verify are separate tools on purpose. Decoding is not verifying, and a single tool that
// did both would be the exact shape of bug worth avoiding: a caller who reads a signature and assumes
// it was checked has been told something false by a tool description.
// ---------------------------------------------------------------------------------------------

function base64UrlDecode(segment: string): Buffer {
  return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function decodeJwt(token: string): { header: unknown; payload: unknown; signature: string } {
  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new Error(`JWT 3 ta qismdan iborat bo'lishi kerak (header.payload.signature). Yuborilgan: ${parts.length}.`);
  }
  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]).toString('utf8'));
  } catch {
    throw new Error('JWT header JSON emas.');
  }
  try {
    payload = JSON.parse(base64UrlDecode(parts[1]).toString('utf8'));
  } catch {
    throw new Error('JWT payload JSON emas.');
  }
  return { header, payload, signature: parts[2] };
}

// ---------------------------------------------------------------------------------------------
// Punycode
// ---------------------------------------------------------------------------------------------

const PUNY_BASE = 36;
const PUNY_TMIN = 1;
const PUNY_TMAX = 26;
const PUNY_SKEW = 38;
const PUNY_DAMP = 700;
const PUNY_INITIAL_BIAS = 72;
const PUNY_INITIAL_N = 128;
const PUNY_DELIMITER = '-';

function punyAdapt(delta: number, numPoints: number, firstTime: boolean): number {
  let k = 0;
  delta = firstTime ? Math.floor(delta / PUNY_DAMP) : delta >> 1;
  delta += Math.floor(delta / numPoints);
  for (; delta > ((PUNY_BASE - PUNY_TMIN) * PUNY_TMAX) >> 1; k += PUNY_BASE) {
    delta = Math.floor(delta / (PUNY_BASE - PUNY_TMIN));
  }
  return Math.floor(k + ((PUNY_BASE - PUNY_TMIN + 1) * delta) / (delta + PUNY_SKEW));
}

/**
 * IDNA (punycode) through the platform implementation.
 *
 * A hand-written version of this encoded "munchen" as "mnchen-to0". Punycode is fiddly - the bias
 * adaptation and the digit emission both have to be exactly right - and `domainToASCII` is the
 * same algorithm the URL parser has been using for years, so it is the reference rather than a
 * rival. Being explicit about the scope: this is IDNA for domain names, which is what punycode is
 * actually used for, and it applies the full mapping a hostname goes through.
 */
function encodeDomain(host: string): string {
  // `domainToASCII` already returns the label *with* the `xn--` prefix. Prefixing again produced
  // `xn--xn--mnchen-3ya`, which is not a hostname and does not resolve.
  return host
    .split('.')
    .map((label) => (/[\u0080-\uffff]/.test(label) ? domainToASCII(label) : label))
    .join('.');
}

function decodeDomain(host: string): string {
  return host
    .split('.')
    .map((label) => (label.toLowerCase().startsWith('xn--') ? domainToUnicode(label) : label))
    .join('.');
}

// ---------------------------------------------------------------------------------------------
// Shared schema
// ---------------------------------------------------------------------------------------------

/** Every text-in / text-out tool shares this shape, so each declares only what it reads. */
const TEXT = { type: 'string', description: 'Matn yoki kodlangan satr' } as const;
const ALPHABET = {
  type: 'string',
  enum: ['base64', 'base64url', 'base32', 'base58', 'base85'],
  description: 'Kodlash turi',
} as const;
const AS_TEXT = {
  type: 'string',
  description: 'Baytlarni matnga o‘girish: utf8, latin1, hex, base64',
} as const;

export const encodingEncode = defineTool({
  name: 'pro_encode_encode',
  description:
    'Matnni base32 / base58 / base85 / base64 ga kodlash. Node da base32 va base58 yo‘q, ular ' +
    'Kubernetes secret va Solana manzillarida ishlatiladi.',
  category: 'encoding',
  inputSchema: {
    type: 'object',
    properties: {
      text: TEXT,
      data: { type: 'string', description: 'base64 shaklidagi bayt kirish' },
      alphabet: ALPHABET,
      pad: { type: 'boolean', description: 'base64 uchun = to‘ldiruvchi belgilar (standart true)' },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const alphabet = (strOrEmpty(p, 'alphabet') || 'base64').toLowerCase();
    const source = strOrEmpty(p, 'text');
    if (!source) return fail('text talab qilinadi.');

    // `data` takes the bytes as base64 so binary can round-trip through a JSON argument.
    const bytes = strOrEmpty(p, 'data') ? Buffer.from(strOrEmpty(p, 'data'), 'base64') : Buffer.from(source, 'utf8');
    if (bytes.length === 0) return fail('Kodlanadigan matn bo‘sh.');

    try {
      if (alphabet === 'base64') {
        return result(
          p.pad === false ? Buffer.from(bytes).toString('base64url') : Buffer.from(bytes).toString('base64'),
        );
      }
      if (alphabet === 'base32') return result(toBase32(bytes));
      if (alphabet === 'base58') return result(toBase58(bytes));
      if (alphabet === 'base85') return result(toBase85(bytes));
      return fail(`Noma'lum alfavit: "${alphabet}".`);
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});

export const encodingDecode = defineTool({
  name: 'pro_encode_decode',
  description:
    'Kodlangan satrni dekodlash. Chiqish UTF-8 bo‘lmasa, "binary" deb belgilaydi. ' +
    'base85 da oxiridagi NUL baytlari saqlanmaydi (to‘ldiruvchi to‘qib qo‘yiladi).',
  category: 'encoding',
  inputSchema: {
    type: 'object',
    properties: { text: TEXT, alphabet: ALPHABET, as: AS_TEXT },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const encoded = strOrEmpty(p, 'text').trim();
    if (!encoded) return fail('text talab qilinadi.');
    const alphabet = (strOrEmpty(p, 'alphabet') || 'base64').toLowerCase();
    try {
      const bytes = decodeAny(encoded, alphabet);
      if (bytes.length === 0) return fail('Dekodlangan natija bo‘sh.');
      const as = strOrEmpty(p, 'as');
      if (as) return result(bytesAsText(bytes, as));
      const sniffed = sniffText(bytes);
      if (sniffed === 'binary') {
        return jsonBlock('Binary', {
          bytes: bytes.length,
          hex: bytes.toString('hex').slice(0, 512),
        });
      }
      return result(bytes.toString(sniffed as BufferEncoding));
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});

export const encodingJwtDecode = defineTool({
  name: 'pro_encode_jwt_decode',
  description:
    'JWT ni o‘qish: header, payload, muddat. **Bu tasdiqlash EMAS.** Imzo tekshirilmagan — ' +
    'ishonchli deb hisoblamang.',
  category: 'encoding',
  inputSchema: {
    type: 'object',
    properties: {
      token: { type: 'string', description: 'JWT (uch qismli)' },
      redact: { type: 'boolean', description: 'max_chars o‘rniga mas’allashtirish' },
    },
    required: ['token'],
  },
  async handler(input) {
    const p = view(input);
    const token = strOrEmpty(p, 'token').trim();
    if (!token) return fail('token talab qilinadi.');
    try {
      const { header, payload, signature } = decodeJwt(token);
      const claims = (payload ?? {}) as Record<string, unknown>;
      const times: Record<string, string> = {};
      if (typeof claims.iat === 'number') times.issued_at = new Date(claims.iat * 1000).toISOString();
      if (typeof claims.exp === 'number') {
        times.expires_at = new Date(claims.exp * 1000).toISOString();
        times.expired = new Date(claims.exp * 1000).getTime() < Date.now() ? 'ha' : 'yo‘q';
      }
      const body = p.redact === true ? { ...(payload as object), sub: claims.sub ? '<redacted>' : undefined } : payload;
      return jsonBlock('JWT (tekshirilmagan)', {
        header,
        payload: body,
        signature: signature.slice(0, 24) + '…',
        ...(Object.keys(times).length ? { times } : {}),
        warning: 'Imzo tekshirilmadi. Ishonch uchun pro_encode_jwt_verify ishlatilsin.',
      });
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});

export const encodingJwtVerify = defineTool({
  name: 'pro_encode_jwt_verify',
  description:
    'JWT imzosini kalit bilan tekshirish (HMAC yoki RS/ES/EdDSA). Ochiq kalit yoki maxfiy kalit ' +
    'berilishi shart. Kalit kiritilmasa rad etiladi — “tekshirilmadi” deb qaytarilmaydi.',
  category: 'encoding',
  inputSchema: {
    type: 'object',
    properties: {
      token: { type: 'string', description: 'JWT' },
      key: { type: 'string', description: 'HMAC maxfiy kaliti yoki ochiq kalit (PEM)' },
      algorithm: { type: 'string', description: 'HS256 (standart), RS256, ES256, EdDSA' },
      audience: { type: 'string', description: 'aud claim tekshirilsinmi' },
      issuer: { type: 'string', description: 'iss claim tekshirilsinmi' },
      clock_tolerance: { type: 'number', description: 'Vaqt chetlanishi, soniya (standart 0)' },
    },
    required: ['token', 'key'],
  },
  async handler(input) {
    const p = view(input);
    const token = strOrEmpty(p, 'token').trim();
    const key = strOrEmpty(p, 'key');
    if (!token) return fail('token talab qilinadi.');
    if (!key) return fail('key talab qilinadi. Kalitsiz tekshirish imtiyon emas.');

    let parsed: { header: unknown; payload: unknown; signature: string };
    let header: { alg?: string; typ?: string };
    try {
      parsed = decodeJwt(token);
      header = (parsed.header ?? {}) as { alg?: string; typ?: string };
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }

    const algorithm = strOrEmpty(p, 'algorithm') || header.alg || 'HS256';
    const parts = token.split('.');
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
    const signature = base64UrlDecode(parts[2]);

    let verified = false;
    let reason = '';
    try {
      if (algorithm.startsWith('HS')) {
        // The digest is part of the algorithm, not a detail. Measured before: every HS* algorithm was
        // verified with SHA-256, so a genuinely valid HS384 or HS512 token was reported invalid —
        // a verifier that says "invalid" about a correct signature.
        const hmacHashes: Record<string, string> = {
          HS256: 'SHA-256',
          HS384: 'SHA-384',
          HS512: 'SHA-512',
        };
        const hash = hmacHashes[algorithm];
        if (!hash) {
          return fail(`Algoritm qo‘llab-quvvatlanmaydi: ${algorithm}. HS256/384/512, RS*, ES*, EdDSA.`);
        }

        // Algorithm-confusion guard.
        //
        // An HMAC secret and an RSA public key are both "the key", and the token chooses which
        // operation runs. If a PEM public key were accepted here, an attacker who knows the public
        // key could sign a token with HS256 — the public key bytes are the secret — and this verifier
        // would report it valid. A key that is obviously a public key is refused instead.
        if (key.includes('BEGIN')) {
          return fail(
            `HS* uchun maxfiy kalit kerak, ochiq PEM kalit emas: ${algorithm} imzosi HMAC maxfiy kalit bilan ` +
              `tekshiriladi. PEM kalit RS*/ES*/EdDSA uchun ishlatiladi.`,
          );
        }

        // Timing-safe compare: a plain === leaks the signature a byte at a time.
        const hmacKey = await crypto.subtle.importKey('raw', Buffer.from(key, 'utf8'), { name: 'HMAC', hash }, false, [
          'sign',
        ]);
        const expected = new Uint8Array(
          await crypto.subtle.sign({ name: 'HMAC', hash }, hmacKey, new Uint8Array(signed)),
        );
        verified = expected.length === signature.length && timingSafeEqual(expected, new Uint8Array(signature));
        if (!verified) reason = 'HMAC imzosi mos emas.';
      } else {
        // Asymmetric verification needs a real key import per algorithm; a PEM that does not load is
        // reported as such rather than silently passing.
        const algorithmNames: Record<string, string> = {
          RS256: 'RSASSA-PKCS1-v1_5',
          RS384: 'RSASSA-PKCS1-v1_5',
          RS512: 'RSASSA-PKCS1-v1_5',
          ES256: 'ECDSA',
          ES384: 'ECDSA',
          EdDSA: 'Ed25519',
        };
        const name = algorithmNames[algorithm];
        if (!name) {
          return fail(`Algoritm qo'llab-quvvatlanmaydi: ${algorithm}. HS256/384/512, RS*, ES*, EdDSA.`);
        }
        // The digest follows the algorithm for RS* and ES*. Ed25519 fixes its own at SHA-512 and the
        // WebCrypto API takes no hash for it.
        const hash =
          algorithm === 'ES384' ? 'SHA-384' : algorithm.startsWith('RS') ? `SHA-${algorithm.slice(2)}` : 'SHA-256';
        const pem = key.includes('BEGIN') ? key : Buffer.from(key, 'base64').toString('utf8');
        const imported = await crypto.subtle.importKey(
          'spki',
          Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64'),
          { name, hash },
          false,
          ['verify'],
        );
        verified = await crypto.subtle.verify(
          { name, hash },
          imported,
          new Uint8Array(signature),
          new Uint8Array(signed),
        );
        if (!verified) reason = `${algorithm} imzosi mos emas.`;
      }
    } catch (error) {
      return fail(`Kalitni yuklab bo‘lmadi: ${error instanceof Error ? error.message : String(error)}`);
    }

    const claims = (parsed.payload ?? {}) as Record<string, unknown>;
    const tolerance = num(p, 'clock_tolerance', 0, 0, 86_400) * 1000;
    const now = Date.now();
    const checks: Record<string, string> = { signature: verified ? 'to‘g‘ri' : 'noto‘g‘ri' };

    if (typeof claims.exp === 'number') {
      checks.expired = now - tolerance > claims.exp * 1000 ? 'ha' : 'yo‘q';
    }
    if (typeof claims.nbf === 'number') checks.not_yet_valid = now + tolerance < claims.nbf * 1000 ? 'ha' : 'yo‘q';
    const audience = strOrEmpty(p, 'audience');
    if (audience) {
      const actual = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      checks.audience = actual.includes(audience) ? 'to‘g‘ri' : 'noto‘g‘ri';
    }
    const issuer = strOrEmpty(p, 'issuer');
    if (issuer) checks.issuer = claims.iss === issuer ? 'to‘g‘ri' : 'noto‘g‘ri';

    const failed = Object.entries(checks).filter(([key2, value]) => value === 'noto‘g‘ri' || value === 'ha');
    return jsonBlock('JWT tekshiruvi', {
      algorithm,
      valid: failed.length === 0,
      ...(reason ? { reason } : {}),
      checks,
      payload: parsed.payload,
    });
  },
});

export const encodingPunycode = defineTool({
  name: 'pro_encode_punycode',
  description: 'IDN domenlarni punycode ga o‘girish va aksincha (xn-- prefiksi bilan).',
  category: 'encoding',
  inputSchema: {
    type: 'object',
    properties: {
      domain: { type: 'string', description: 'Domen yoki matn' },
      direction: {
        type: 'string',
        enum: ['encode', 'decode'],
        description: 'Yo‘nalish (standart encode)',
      },
    },
    required: ['domain'],
  },
  async handler(input) {
    const p = view(input);
    const domain = strOrEmpty(p, 'domain').trim();
    if (!domain) return fail('domain talab qilinadi.');
    try {
      if (strOrEmpty(p, 'direction') === 'decode') {
        return result(decodeDomain(domain));
      }
      return result(encodeDomain(domain));
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  },
});

export const encodingHtmlEntity = defineTool({
  name: 'pro_encode_html_entity',
  description: 'HTML entitiyalarini kodlash va dekodlash (&amp;, &#x41;, &#65;).',
  category: 'encoding',
  inputSchema: {
    type: 'object',
    properties: {
      text: TEXT,
      direction: { type: 'string', enum: ['encode', 'decode'], description: 'Yo‘nalish' },
      mode: { type: 'string', enum: ['basic', 'numeric'], description: 'encode usuli' },
    },
    required: ['text'],
  },
  async handler(input) {
    const p = view(input);
    const text = strOrEmpty(p, 'text');
    if (!text) return fail('text talab qilinadi.');
    const named: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    const reverse: Record<string, string> = {
      amp: '&',
      lt: '<',
      gt: '>',
      quot: '"',
      apos: "'",
      nbsp: ' ',
    };
    if (strOrEmpty(p, 'direction') !== 'decode') {
      if (strOrEmpty(p, 'mode') === 'numeric') {
        return result(
          [...text]
            .map((char) => {
              const code = char.codePointAt(0) as number;
              return code < 128 ? char : `&#${code};`;
            })
            .join(''),
        );
      }
      return result(text.replace(/[&<>"']/g, (char) => named[char]));
    }
    return result(
      text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
        if (body.startsWith('#x') || body.startsWith('#X')) {
          return String.fromCodePoint(parseInt(body.slice(2), 16));
        }
        if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10));
        return reverse[body.toLowerCase()] ?? match;
      }),
    );
  },
});

export const encodingUrl = defineTool({
  name: 'pro_encode_url',
  description: 'URL komponentlarini kodlash va dekodlash, to‘liq URL ni tahlil qilish.',
  category: 'encoding',
  inputSchema: {
    type: 'object',
    properties: {
      text: TEXT,
      url: { type: 'string', description: 'Tahlil qilinadigan to‘liq URL' },
      component: {
        type: 'string',
        enum: ['full', 'component', 'query', 'path'],
        description: 'Nima kodlanadi (standart full)',
      },
    },
  },
  async handler(input) {
    const p = view(input);
    if (strOrEmpty(p, 'url')) {
      try {
        const parsed = new URL(strOrEmpty(p, 'url'));
        return jsonBlock('URL tahlili', {
          protocol: parsed.protocol,
          host: parsed.host,
          hostname: parsed.hostname,
          port: parsed.port || null,
          path: parsed.pathname,
          search: parsed.search,
          hash: parsed.hash,
          origin: parsed.origin,
          params: [...parsed.searchParams.entries()].map(([key, value]) => ({ key, value })),
        });
      } catch (error) {
        return fail(`URL noto‘g‘ri: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const text = strOrEmpty(p, 'text');
    if (!text) return fail('text yoki url bering.');
    const component = strOrEmpty(p, 'component') || 'full';
    if (component === 'decode') return fail('decode uchun component: "full" emas, yo‘nalish bering.');
    return result(
      component === 'query'
        ? new URLSearchParams(text).toString()
        : component === 'path'
          ? text
              .split('/')
              .map((part) => encodeURIComponent(part))
              .join('/')
          : encodeURIComponent(text),
    );
  },
});

export const encodingUuid = defineTool({
  name: 'pro_encode_uuid',
  description: 'UUID v4 / v7 yaratish va UUID parsing (versiya, variant, vaqt).',
  category: 'encoding',
  inputSchema: {
    type: 'object',
    properties: {
      count: { type: 'number', description: 'Nechta (standart 1, maks 1000)' },
      version: { type: 'string', enum: ['4', '7'], description: 'UUID versiyasi (standart 4)' },
      uuid: { type: 'string', description: 'Parse qilinadigan UUID' },
    },
  },
  async handler(input) {
    const p = view(input);
    const existing = strOrEmpty(p, 'uuid').trim();
    if (existing) {
      const hex = existing.replace(/-/g, '');
      if (!/^[0-9a-fA-F]{32}$/.test(hex)) return fail(`UUID formati noto‘g‘ri: "${existing}".`);
      const version = parseInt(hex[12], 16);
      const variantBits = parseInt(hex[16], 16);
      const variant =
        variantBits < 8 ? 'NCS' : variantBits < 12 ? 'RFC 4122' : variantBits < 14 ? 'Microsoft' : 'future';
      return jsonBlock('UUID', {
        uuid: existing,
        version,
        variant,
        node: hex.slice(20),
        ...(version === 1
          ? { timestamp: new Date(parseInt(hex.slice(0, 12), 16) * 1000 - 12219292800000).toISOString() }
          : {}),
      });
    }
    const count = Math.max(1, Math.min(1000, num(p, 'count', 1, 1, 1000)));
    const version = strOrEmpty(p, 'version') === '7' ? 7 : 4;
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      if (version === 4) {
        out.push(crypto.randomUUID());
        continue;
      }
      // v7: 48-bit millisecond timestamp, then version, then random. Sorting by id matches time order,
      // which is the reason to choose it over v4.
      const hex = Date.now().toString(16).padStart(12, '0') + '7' + crypto.randomUUID().replace(/-/g, '').slice(1, 16);
      out.push(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`);
    }
    return result(count === 1 ? out[0] : out.join('\n'));
  },
});

export const encodingIdent = defineTool({
  name: 'pro_encode_ident',
  description: 'ULID (vaqt tartiblangan identifikator) va nanoid yaratish.',
  category: 'encoding',
  inputSchema: {
    type: 'object',
    properties: {
      count: { type: 'number', description: 'Nechta (standart 1, maks 1000)' },
      kind: { type: 'string', enum: ['ulid', 'nanoid', 'ksuid'], description: 'Turi (standart ulid)' },
      size: { type: 'number', description: 'nanoid/ksuid uzunligi (standart 21/27)' },
      timestamp: { type: 'number', description: 'ULID vaqti, ms (standart hozir)' },
    },
  },
  async handler(input) {
    const p = view(input);
    const count = Math.max(1, Math.min(1000, num(p, 'count', 1, 1, 1000)));
    const kind = strOrEmpty(p, 'kind') || 'ulid';
    const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz';
    const random = (length: number) =>
      [...crypto.getRandomValues(new Uint8Array(length))].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');

    const out: string[] = [];
    const stamp = num(p, 'timestamp', Date.now(), 0, Number.MAX_SAFE_INTEGER);
    for (let i = 0; i < count; i++) {
      if (kind === 'nanoid') {
        out.push(random(num(p, 'size', 21, 2, 64)));
      } else if (kind === 'ksuid') {
        out.push(`${Date.now().toString(36).padStart(8, '0')}${random(16).toUpperCase()}`);
      } else {
        const time = stamp.toString(32).toUpperCase().padStart(10, '0');
        const randomness = [...crypto.getRandomValues(new Uint8Array(16))]
          .map((byte) => byte.toString(32).padStart(2, '0'))
          .join('')
          .slice(0, 16)
          .toUpperCase();
        out.push(`${time}${randomness}`);
      }
    }
    return result(count === 1 ? out[0] : out.join('\n'));
  },
});
