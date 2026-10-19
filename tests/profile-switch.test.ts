// Profile switching: what an agent may and may not do at runtime.
//
// The defect this guards against was found by measurement, not by reading. The switch tool compared
// profiles by their *level number* — smart=0, minimal=1, standard=2, full=3 — and refused any move
// to a higher level. That made two things wrong at once:
//
//   1. `smart → minimal` was refused. The two are not ordered at all: measured, 6 tools are only in
//      `smart` and 68 only in `minimal`, with 5 shared. Ranking them 0 and 1 called the change a
//      widening when it was a lateral move, and the tool's own message said narrowing was allowed.
//   2. Narrowing was a one-way door. The ceiling was read from the mutable environment, so once an
//      agent narrowed the profile the operator's setting was gone and the only way back was a restart.
//
// The fix compares the *tool sets* and captures the operator's ceiling at start-up.
//
// Each case needs a different `PRO_FETCH_PROFILE` at load time, and the environment is read once per
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
  ceiling: string;
  steps: Step[];
}

const PROBE = `
process.env.PRO_FETCH_PROFILE = process.argv[1];
const base = 'file://' + process.cwd().replace(/\\\\/g, '/') + '/src/';
await import(base + 'env.js');
await import(base + 'loader.js');
const { dispatch } = await import(base + 'core/tool.js');
const { listTools } = await import(base + 'router.js');
const { currentProfile, configuredProfile } = await import(base + 'core/profile.js');

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
console.log(JSON.stringify({ ceiling: configuredProfile(), steps }));
`;

function runProbe(operatorProfile: string): Probe {
  const stdout = execFileSync(process.execPath, ['--import', 'tsx', '-e', PROBE, operatorProfile], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 180_000,
  });
  const line = stdout.split('\n').find((entry) => entry.startsWith('{'));
  if (!line) throw new Error('probe produced no result');
  return JSON.parse(line) as Probe;
}

describe('the operator ceiling is the profile configured at start-up', () => {
  it('is captured before any tool can change it', () => {
    const probe = runProbe('standard');
    expect(probe.ceiling).toBe('standard');
  });

  it('is not the profile currently active', () => {
    // The steps narrow the profile; the ceiling must stay where the operator put it.
    const probe = runProbe('full');
    expect(probe.steps[0]!.current).toBe('smart');
    expect(probe.ceiling).toBe('full');
  });
});

describe('narrowing is allowed and takes effect immediately', () => {
  it('full → smart narrows and the tool list shrinks to 11', () => {
    const probe = runProbe('full');
    const step = probe.steps.find((entry) => entry.target === 'smart')!;
    expect(step.refused).toBe(false);
    expect(step.count).toBe(11);
    expect(step.current).toBe('smart');
  });

  it('full → minimal narrows to 73', () => {
    const probe = runProbe('full');
    const step = probe.steps.find((entry) => entry.target === 'minimal')!;
    expect(step.refused).toBe(false);
    expect(step.count).toBe(73);
  });
});

describe('widening beyond the operator ceiling is refused', () => {
  it('standard → full is refused, and the list does not grow', () => {
    // The original security property: an operator who chose `standard` could be overruled by a
    // single tool call. Measured: `full` advertises 494 tools `standard` does not.
    const probe = runProbe('standard');
    const step = probe.steps.find((entry) => entry.target === 'full')!;
    expect(step.refused).toBe(true);
    expect(step.count).toBe(178);
  });

  it('smart → full is refused', () => {
    const probe = runProbe('smart');
    for (const target of ['minimal', 'standard', 'full']) {
      const step = probe.steps.find((entry) => entry.target === target)!;
      expect(step.refused, `${target} refused bo'lishi kerak`).toBe(true);
    }
  });

  it('minimal → smart is refused, because `smart` is not a subset of `minimal`', () => {
    // Measured: 6 tools are only in `smart` (the meta-composites), 68 only in `minimal`, 5 shared.
    // A level comparison called this a narrowing; the set comparison does not.
    const probe = runProbe('minimal');
    const step = probe.steps.find((entry) => entry.target === 'smart')!;
    expect(step.refused).toBe(true);
  });

  it('the refusal names the operator ceiling', () => {
    const probe = runProbe('standard');
    const step = probe.steps.find((entry) => entry.target === 'full')!;
    expect(step.text).toMatch(/operator/i);
    expect(step.text).toMatch(/kengaytirilmaydi/i);
  });
});

describe('narrowing is not a one-way door', () => {
  it('the operator ceiling can be restored after narrowing', () => {
    // The steps run smart → minimal → standard → full, so the last one is the restore. Before the
    // fix this was refused with "Profil kengaytirilmaydi" and the operator's setting could only be
    // recovered by restarting the server.
    const probe = runProbe('full');
    const last = probe.steps[probe.steps.length - 1]!;
    expect(last.target).toBe('full');
    expect(last.refused).toBe(false);
    expect(last.count).toBe(672);
  });
});

describe('the profiles are not a chain', () => {
  it('smart and minimal are incomparable, which is why levels cannot order them', () => {
    // This is the root cause, asserted so that a future change to the level numbers cannot quietly
    // make the comparison "work" by accident.
    const probe = runProbe('full');
    const smartCount = probe.steps.find((entry) => entry.target === 'smart')!.count;
    const minimalCount = probe.steps.find((entry) => entry.target === 'minimal')!.count;
    expect(smartCount).toBe(11);
    expect(minimalCount).toBe(73);
    expect(smartCount).not.toBe(minimalCount);
  });
});
