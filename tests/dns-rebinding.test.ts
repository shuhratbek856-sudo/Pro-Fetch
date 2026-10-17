// DNS rebinding, tested without a DNS server.
//
// The rule under test is about an answer that *changes between two lookups*, so a test that needed a
// live resolver would either not run or would be flaky - which is how a security rule ends up
// unverified. `resolveSafeUrl` and `assertStableSafeUrl` take a resolver, and these pass one in.
//
// What is asserted here is the narrowing, not a claim that the window is closed. `assertStableSafeUrl`
// requires two lookups to agree; a resolver that answers public, public, private is not caught by that,
// and the comment on the function says so. A test that implied otherwise would be the same failure as
// `tls_audit` claiming to be a TLS audit.

import { describe, it, expect } from 'vitest';
import {
  assertStableSafeUrl,
  isPrivateIp,
  resolveSafeUrl,
  UrlSecurityError,
  type DnsLookup,
} from '../src/core/ssrf-guard.js';

const PUBLIC = '93.184.216.34';
const METADATA = '169.254.169.254';

/** A resolver that answers from a script, so each lookup can differ. */
function scripted(answers: string[][]): DnsLookup {
  let call = 0;
  return async () => {
    const chosen = answers[Math.min(call, answers.length - 1)] as string[];
    call += 1;
    return chosen.map((address) => ({ address, family: 4 }));
  };
}

describe('a private address is refused', () => {
  it('recognises the ranges that matter', () => {
    expect(isPrivateIp(METADATA)).toBe(true);
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp(PUBLIC)).toBe(false);
  });

  it('refuses a host that resolves to the metadata address', async () => {
    await expect(resolveSafeUrl('http://rebind.example/', { lookup: scripted([[METADATA]]) })).rejects.toBeInstanceOf(
      UrlSecurityError,
    );
  });

  it('allows a host that resolves publicly', async () => {
    const resolved = await resolveSafeUrl('https://ok.example/path', { lookup: scripted([[PUBLIC]]) });
    expect(resolved.url.hostname).toBe('ok.example');
    expect(resolved.addresses.map((entry) => entry.address)).toEqual([PUBLIC]);
  });
});

describe('two lookups that disagree', () => {
  it('is refused, which is the rebinding shape', async () => {
    // Public for the check, link-local for the connection. This is the whole attack.
    await expect(
      assertStableSafeUrl('http://rebind.example/', {
        lookup: scripted([[PUBLIC], [METADATA]]),
        gapMs: 0,
      }),
    ).rejects.toThrow(/rebinding/i);
  });

  it('is refused when the second lookup blocks the host outright', async () => {
    // The dangerous direction is the first saying "reachable" and the second refusing. Reported as an
    // instability rather than as a plain SSRF block, because the cause is different.
    //
    // The first version of this test threw from the resolver on *every* call, so it failed in the first
    // lookup and produced DNS_ERROR, which is a different thing from what it claimed to measure.
    let calls = 0;
    const error = await assertStableSafeUrl('http://rebind.example/', {
      lookup: async () => {
        calls += 1;
        if (calls === 1) return [{ address: PUBLIC, family: 4 }];
        throw new Error('SERVFAIL');
      },
      gapMs: 0,
    }).catch((caught: unknown) => caught as UrlSecurityError);
    expect(error).toBeInstanceOf(UrlSecurityError);
    expect((error as UrlSecurityError).code).toBe('DNS_UNSTABLE');
    expect(calls).toBe(2);
  });

  it('is refused when the address set differs without either being private', async () => {
    await expect(
      assertStableSafeUrl('http://shifting.example/', {
        lookup: scripted([[PUBLIC], ['93.184.216.35']]),
        gapMs: 0,
      }),
    ).rejects.toThrow(/o‘zgardi/);
  });

  it('allows a host whose two answers agree', async () => {
    const resolved = await assertStableSafeUrl('https://stable.example/', {
      lookup: scripted([[PUBLIC], [PUBLIC]]),
      gapMs: 0,
    });
    expect(resolved.addresses.map((entry) => entry.address)).toEqual([PUBLIC]);
  });

  it('consults exactly two lookups, which is the limit of what this guards', async () => {
    // The window is not closed and this asserts the reason rather than restating it: the guard performs
    // two lookups and no more. A resolver answering public, public, private passes it, because the third
    // answer - the one Chromium would use - is never requested.
    //
    // An earlier version of this test tried to demonstrate that by resolving a third time itself, which
    // asserted nothing about the guard and failed, because the third lookup is the guard's absence made
    // visible. Counting the calls is the precise version of the same claim.
    let calls = 0;
    const resolver: DnsLookup = async () => {
      calls += 1;
      return [{ address: calls < 3 ? PUBLIC : METADATA, family: 4 }];
    };
    // The first two agree, so the guard accepts - even though a third lookup would return a link-local
    // address that the guard never asks for.
    await expect(assertStableSafeUrl('https://late.example/', { lookup: resolver, gapMs: 0 })).resolves.toBeDefined();
    expect(calls).toBe(2);
  });
});
