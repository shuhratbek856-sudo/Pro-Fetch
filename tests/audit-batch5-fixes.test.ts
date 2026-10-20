/**
 * Regression pins for audit batch 5 — the A-family:
 * A-2 the child-environment report telling the truth about what the filter does,
 * A-3 the output root refusing a filesystem root,
 * A-4 the mutation scanner seeing every tool that has a body of its own.
 *
 * The child-environment report is checked against the filter itself rather than against a list of
 * expected names, because the defect was a drift between the two.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, globSync } from 'node:fs';
import path from 'node:path';
import { childEnv, describeChildEnv } from '../src/core/child-env.js';
import { outputRoot, writeBoundaryRoot } from '../src/core/output-dir.js';
import { ownHandlerBodies, toolsWithUnreadableBodies } from '../src/core/mutation-scan.js';

describe('the child-environment report matches the filter it describes', () => {
  it('names every forwarded and every dropped variable exactly as the filter does', () => {
    const source = {
      PATH: '/bin',
      HOME: '/home/u',
      PRO_FETCH_CACHE_DIR: '.cache',
      OPENAI_API_KEY: 'sk-x',
      SSH_AUTH_SOCK: '/tmp/agent.sock',
      MYSTERY: '1',
    };
    const built = childEnv({ source });
    const described = describeChildEnv({ source });
    expect(described.forwarded).toEqual(Object.keys(built.env).sort());
    expect(described.dropped).toEqual(
      Object.keys(source)
        .filter((name) => !(name in built.env))
        .sort(),
    );
    expect(described.dropped_as_credential).toContain('OPENAI_API_KEY');
    expect(described.dropped_as_unknown).toContain('MYSTERY');
  });

  it('reports a variable the operator opted in as forwarded, not as unknown', () => {
    // `PRO_FETCH_CHILD_EXTRA_ENV` is part of what reaches the child. The report used to omit the
    // lookup entirely, so an opted-in variable came back under `dropped_as_unknown` while the child
    // was about to receive it.
    const saved = process.env.PRO_FETCH_CHILD_EXTRA_ENV;
    process.env.PRO_FETCH_CHILD_EXTRA_ENV = 'MY_EXTRA_ONE';
    try {
      const source = { PATH: '/bin', MY_EXTRA_ONE: 'v' };
      const built = childEnv({ source });
      const described = describeChildEnv({ source });
      expect(built.env.MY_EXTRA_ONE).toBe('v');
      expect(described.forwarded).toContain('MY_EXTRA_ONE');
      expect(described.dropped_as_unknown).not.toContain('MY_EXTRA_ONE');
    } finally {
      if (saved === undefined) delete process.env.PRO_FETCH_CHILD_EXTRA_ENV;
      else process.env.PRO_FETCH_CHILD_EXTRA_ENV = saved;
    }
  });

  it('honours an allow entry whose case differs from the live variable name', () => {
    // On Windows the live name can be `Path` while the caller asks to forward `PATH`. The filter
    // matches the upper-case form; the report only matched the exact one and called the variable
    // dropped while the child received it.
    const source = { Path: 'C:\\Windows', MYSTERY: '1' };
    const built = childEnv({ source, allow: ['PATH'] });
    const described = describeChildEnv({ source, allow: ['PATH'] });
    expect(built.env.Path).toBe('C:\\Windows');
    expect(described.forwarded).toContain('Path');
  });

  it('never reports NODE_OPTIONS as forwarded, and files it as an injection', () => {
    const source = { NODE_OPTIONS: '--require C:/evil.js', PATH: '/bin' };
    const built = childEnv({ source, allow: ['NODE_OPTIONS'] });
    const described = describeChildEnv({ source, allow: ['NODE_OPTIONS'] });
    // The filter refuses it even when it is allowed - it is code, not configuration.
    expect(built.env.NODE_OPTIONS).toBeUndefined();
    expect(described.forwarded).not.toContain('NODE_OPTIONS');
    expect(described.dropped).toContain('NODE_OPTIONS');
    expect(described.dropped_as_injection).toContain('NODE_OPTIONS');
  });
});

describe('the output root refuses a filesystem root', () => {
  const saved = process.env.PRO_FETCH_OUTPUT_ROOT;
  afterEach(() => {
    if (saved === undefined) delete process.env.PRO_FETCH_OUTPUT_ROOT;
    else process.env.PRO_FETCH_OUTPUT_ROOT = saved;
  });

  it('rejects a root that would make every path check a no-op', () => {
    process.env.PRO_FETCH_OUTPUT_ROOT = process.platform === 'win32' ? 'C:\\' : '/';
    expect(() => outputRoot()).toThrow(/ildizi|root/i);
  });

  it('still resolves an ordinary configured root', () => {
    process.env.PRO_FETCH_OUTPUT_ROOT = './custom-out';
    expect(path.basename(outputRoot())).toBe('custom-out');
  });

  it('the write boundary keeps refusing the same thing', () => {
    process.env.PRO_FETCH_OUTPUT_ROOT = process.platform === 'win32' ? 'C:\\' : '/';
    expect(() => writeBoundaryRoot()).toThrow(/ildizi|root/i);
  });
});

describe('the mutation scanner sees every tool that has a body of its own', () => {
  it('finds a body for every tool name in the source tree', () => {
    const bodies = ownHandlerBodies();
    const names = new Set<string>();
    for (const file of globSync(path.join('src', '**', '*.ts'))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/name:\s*'(pro_[a-z0-9_]+)'/g)) names.add(match[1]);
    }
    const missing = [...names].filter((name) => !bodies.has(name));
    // The scan used to read the first tool in each file and stop: 40 of 474 tools were never
    // classified, quietly, because the file itself had been read.
    expect(missing).toEqual([]);
    expect(names.size).toBeGreaterThan(400);
  });

  it('reads a body whose handler contains a quote inside a regular expression', () => {
    // `/[\r\n"]/` used to open a string that never closed, which cost the tool its whole body and
    // with it its place in the mutation table.
    const bodies = ownHandlerBodies();
    expect(bodies.has('pro_fetch_post_multipart')).toBe(true);
    expect(bodies.has('pro_encode_html_entity')).toBe(true);
  });

  it('reports no tool whose body it could not read', () => {
    ownHandlerBodies();
    expect(toolsWithUnreadableBodies()).toEqual([]);
  });
});
