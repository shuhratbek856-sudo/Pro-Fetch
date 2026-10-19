// Profile switching: what an agent may and may not do at runtime.
//
// The rule is that the operator's instruction governs. When someone says "switch to full mode" and
// the model calls `pro_fetch_profile_switch`, that is the operator's decision being carried out, and
// it is allowed. An operator who wants the opposite sets `PRO_FETCH_PROFILE_CEILING`.
//
// The defect this guards against was found by measurement, not by reading. The tool compared
// profiles by their *level number* — smart=0, minimal=1, standard=2, full=3 — and refused any move
// to a higher level. That made two things wrong at once:
//
//   1. `smart → minimal` was refused. The two are not ordered at all: measured, 6 tools are only in
//      `smart` and 68 only in `minimal`, with 5 shared. Ranking them 0 and 1 called the change a
//      widening when it was a lateral move, and the tool's own message said narrowing was allowed.
//   2. Narrowing was a one-way door. The ceiling was read from `PRO_FETCH_PROFILE`, which the tool
//      itself writes, so once an agent narrowed the profile the operator's setting was gone: widening
//      back was refused, and the only way back was a restart.
//
// Each case needs a different environment at load time, and the environment is read once per
// process, so each case runs in its own child process.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface Step {
  target: string;
  refused: boolean;
  count: number;
  current: string;
  text: string;
}
interface Probe {
  ceiling: string | null;
  steps: Step[];
}

const PROBE = `
process.env.PRO_FETCH_PROFILE = process.argv[1];
if (process.argv[2]) process.env.PRO_FETCH_PROFILE_CEILING = process.argv[2];
const base = 'file://' + process.cwd().replace(/\\\\/g, '/') + '/src/';
await import(base + 'env.js');
await import(base + 'loader.js');
const { dispatch } = await import(base + 'core/tool.js');
const { listTools } = await import(base + 'router.js');
const { currentProfile, profileCeiling } = await import(base + 'core/profile.js');

const textOf = (r) => (r.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('\\n');

const steps = [];
for (const target of ['smart', 'minimal', 'standard', 'full']) {
  const r = await dispatch('pro_fetch_profile_switch', { profile: target });
  steps.push({
    target,
    refused: r.isError === true,
    count: listTools().length,
    current: currentProfile(),
    text: textOf(r).slice(0, 300),
  });
}
console.log(JSON.stringify({ ceiling: profileCeiling() ?? null, steps }));
`;

function runProbe(operatorProfile: string, ceiling?: string): Probe {
  const args = ['--import', 'tsx', '-e', PROBE, operatorProfile];
  if (ceiling) args.push(ceiling);
  const stdout = execFileSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 180_000,
  });
  const line = stdout.split('\n').find((entry) => entry.startsWith('{'));
  if (!line) throw new Error('probe produced no result');
  return JSON.parse(line) as Probe;
}

describe('the operator’s instruction governs, so any profile can be reached', () => {
  it.each(['smart', 'minimal', 'standard', 'full'])('from %s, switching to full is allowed', (operator) => {
    // The case the operator asked for: "switch to full mode" must switch.
    const probe = runProbe(operator);
    const step = probe.steps.find((entry) => entry.target === 'full')!;
    expect(step.refused, `${operator} → full refused bo‘lishi kerak emas`).toBe(false);
    expect(step.count).toBe(672);
    expect(step.current).toBe('full');
  });

  it.each(['smart', 'minimal', 'standard', 'full'])('from %s, every profile is reachable', (operator) => {
    const probe = runProbe(operator);
    for (const step of probe.steps) {
      expect(step.refused, `${operator} → ${step.target} refused bo‘ldi`).toBe(false);
    }
  });

  it('there is no ceiling unless one is configured', () => {
    expect(runProbe('standard').ceiling).toBeNull();
  });
});

describe('a pinned ceiling is still honoured', () => {
  it('refuses widening past the ceiling and names it', () => {
    const probe = runProbe('standard', 'standard');
    const step = probe.steps.find((entry) => entry.target === 'full')!;
    expect(step.refused).toBe(true);
    expect(step.count).toBe(178);
    expect(step.text).toMatch(/PRO_FETCH_PROFILE_CEILING/);
  });

  it('allows narrowing below the ceiling', () => {
    const probe = runProbe('standard', 'standard');
    const step = probe.steps.find((entry) => entry.target === 'minimal')!;
    expect(step.refused).toBe(false);
    expect(step.count).toBe(73);
  });

  it('the ceiling is reported on a successful switch too', () => {
    const probe = runProbe('full', 'standard');
    const step = probe.steps.find((entry) => entry.target === 'minimal')!;
    expect(step.refused).toBe(false);
    expect(step.text).toMatch(/chegara/i);
  });
});

describe('the switch takes effect immediately', () => {
  it('the advertised tool count follows the new profile', () => {
    const probe = runProbe('full');
    const byTarget = new Map(probe.steps.map((entry) => [entry.target, entry.count]));
    expect(byTarget.get('smart')).toBe(11);
    expect(byTarget.get('minimal')).toBe(73);
    expect(byTarget.get('standard')).toBe(178);
    expect(byTarget.get('full')).toBe(672);
  });
});

describe('the profiles are not a chain', () => {
  it('smart and minimal are incomparable, which is why levels cannot order them', () => {
    // The root cause, asserted so that a future change to the level numbers cannot quietly make the
    // comparison "work" by accident.
    const probe = runProbe('full');
    const smartCount = probe.steps.find((entry) => entry.target === 'smart')!.count;
    const minimalCount = probe.steps.find((entry) => entry.target === 'minimal')!.count;
    expect(smartCount).toBe(11);
    expect(minimalCount).toBe(73);
    expect(smartCount).not.toBe(minimalCount);
  });
});
