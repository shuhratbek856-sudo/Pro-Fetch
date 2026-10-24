// Locks the OTHER num() hazard: min=1 silently turning an explicit 0 into 1.
//
// num(p, key, fallback) defaults min to 1, and floors values. For count parameters that is fine,
// but for two call sites it was a real defect:
//
//   pro_chess_analyse({ perft_depth: 0 })  -> num returned 1, ran a perft the caller said to skip
//   pro_repo_audit   ({ pr_number:  0 })   -> num returned 1, `prNumber <= 0` guard never fired,
//                                             the tool proceeded as if the caller had typed "1"
//
// Fix: pass an explicit min of 0 so an explicit 0 is preserved and any downstream guard sees it.

import { describe, it, expect } from 'vitest';
import '../src/loader.js';
import { callTool } from '../src/router.js';

const text = (r: any): string => (r?.content?.[0]?.text ?? '').toString();

describe('num() with an explicit min=0 preserves zero at count-parameter call sites', () => {
  it('pro_chess_analyse: perft_depth 0 skips perft, perft_depth 3 runs it', async () => {
    const skip = await callTool('pro_chess_analyse', { moves: ['e2e4'], perft_depth: 0 });
    expect(skip.isError).toBeFalsy();
    // The `depth > 0` guard at analyse.ts:109 must actually be 0, otherwise the perft key is present.
    expect(text(skip)).not.toMatch(/"perft":/);
    expect(text(skip)).not.toMatch(/"perft_note":/);

    const run = await callTool('pro_chess_analyse', { moves: ['e2e4'], perft_depth: 3 });
    expect(run.isError).toBeFalsy();
    expect(text(run)).toMatch(/"perft":/);
  });

  it('pro_repo_audit: pr_number 0 is rejected by the guard, not silently read as 1', async () => {
    // The pre-network guard fires before any token or GitHub request, so this is offline-safe.
    const result = await callTool('pro_repo_audit', { repository: 'some/repo', pr_number: 0 });
    expect(result.isError).toBeTruthy();
    expect(text(result)).toMatch(/pr_number/);
  });
});
