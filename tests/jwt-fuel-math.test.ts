// Fix 5 — JWT signature verification with the correct per-algorithm hash, ECDSA raw→DER and
// Ed25519 (no-hash); and reciprocal fuel-economy conversion.
//
// Before the fix, every non-RS algorithm (HS384/HS512/ES384 and EdDSA) was verified against
// SHA-256 (and Ed25519 got an illegal hash parameter), so legitimately-signed tokens were reported
// "noto'g'ri"; ES signatures were also passed to WebCrypto as raw r||s instead of DER, so every
// ES256/ES384 token failed to verify regardless of hash. Fuel (mpg ↔ L/100km) was multiplied by a
// linear factor, returning 33.7 for 30 mpg (true: 7.84) and inverting the direction.

import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, createHmac, createSign, sign as oneShotSign } from 'node:crypto';
import '../src/loader.js';
import { callTool } from '../src/router.js';

const b64url = (input: Uint8Array | string): string =>
  Buffer.from(input as never)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function makeToken(header: Record<string, string>, sign: (signingInput: string) => Uint8Array): string {
  const h = b64url(JSON.stringify(header));
  const p = b64url(JSON.stringify({ sub: '1', name: 'shuhrat' }));
  const signingInput = `${h}.${p}`;
  return `${signingInput}.${b64url(sign(signingInput))}`;
}

function hsToken(alg: string, hash: 'sha256' | 'sha384' | 'sha512', secret: string): string {
  return makeToken({ alg, typ: 'JWT' }, (input) => createHmac(hash, secret).update(input).digest());
}

function ecToken(alg: string, hash: 'sha256' | 'sha384', curve: 'prime256v1' | 'secp384r1') {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: curve });
  const token = makeToken({ alg, typ: 'JWT' }, (input) =>
    createSign(hash).update(input).sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }),
  );
  return { token, key: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}

function edToken() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const token = makeToken({ alg: 'EdDSA', typ: 'JWT' }, (input) => oneShotSign(null, Buffer.from(input), privateKey));
  return { token, key: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}

const jsonOf = (result: any): any => {
  const text = result?.content?.[0]?.text ?? '';
  const m = text.match(/```json\n([\s\S]*?)\n```/);
  return m ? JSON.parse(m[1]) : {};
};

describe('pro_encode_jwt_verify — per-algorithm hash, ECDSA DER, Ed25519', () => {
  const secret = 'super-secret-key-value';

  it('verifies HS256/HS384/HS512 (HS384/512 were pinned to SHA-256 before)', async () => {
    for (const [alg, hash] of [
      ['HS256', 'sha256'],
      ['HS384', 'sha384'],
      ['HS512', 'sha512'],
    ] as const) {
      const token = hsToken(alg, hash, secret);
      const data = jsonOf(await callTool('pro_encode_jwt_verify', { token, key: secret, algorithm: alg }));
      expect(data.valid, alg).toBe(true);
      expect(data.checks.signature, alg).toBe('to‘g‘ri');
    }
  });

  it('verifies ES256 and ES384 (raw r||s now converted to DER)', async () => {
    for (const [alg, hash, curve] of [
      ['ES256', 'sha256', 'prime256v1'],
      ['ES384', 'sha384', 'secp384r1'],
    ] as const) {
      const { token, key } = ecToken(alg, hash, curve);
      const data = jsonOf(await callTool('pro_encode_jwt_verify', { token, key, algorithm: alg }));
      expect(data.valid, `${alg} :: ${JSON.stringify(data)}`).toBe(true);
      expect(data.checks.signature, alg).toBe('to‘g‘ri');
    }
  });

  it('verifies EdDSA / Ed25519 without an illegal hash parameter', async () => {
    const { token, key } = edToken();
    const data = jsonOf(await callTool('pro_encode_jwt_verify', { token, key, algorithm: 'EdDSA' }));
    expect(data.valid).toBe(true);
    expect(data.checks.signature).toBe('to‘g‘ri');
  });

  it('rejects a tampered ES384 payload', async () => {
    const { token, key } = ecToken('ES384', 'sha384', 'secp384r1');
    const [h, , s] = token.split('.');
    const forged = `${h}.${b64url(JSON.stringify({ sub: '2' }))}.${s}`;
    const data = jsonOf(await callTool('pro_encode_jwt_verify', { token: forged, key, algorithm: 'ES384' }));
    expect(data.valid).toBe(false);
    expect(data.checks.signature).toBe('noto‘g‘ri');
  });
});

describe('pro_units_convert — reciprocal fuel economy', () => {
  const value = async (input: Record<string, unknown>): Promise<number> => {
    const data = jsonOf(await callTool('pro_units_convert', input));
    return Number(data.value ?? data.converted ?? data.result);
  };

  it('30 mpg_us → ~7.84 L/100km (was 33.7 under linear multiply)', async () => {
    expect(await value({ value: 30, from: 'mpg', to: 'l/100km' })).toBeCloseTo(7.8405, 2);
  });

  it('5 L/100km → ~47.04 mpg_us', async () => {
    expect(await value({ value: 5, from: 'l/100km', to: 'mpg' })).toBeCloseTo(47.043, 2);
  });

  it('30 mpg_us → ~36.03 mpg_imp (same-kind ratio, still reciprocal-consistent)', async () => {
    expect(await value({ value: 30, from: 'mpg_us', to: 'mpg_imp' })).toBeCloseTo(36.028, 2);
  });
});
