import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // The registry must load before any profile-dependent assertion, and several suites mutate
    // process.env, so files run in a single process to keep the shared registry consistent.
    pool: 'forks',
    // One process per file rather than a single shared fork. A shared fork means every native module
    // any suite loads is resident when the process is torn down, which is what trips the abort
    // below; measured 4 aborts in 10 runs with `singleFork: true` against 1 in 10 with it off, and
    // the files that do run pass identically either way. Suites that mutate `process.env` are
    // unaffected because each file already imports the loader itself.
    poolOptions: { forks: { singleFork: false } },
    // No `dangerouslyIgnoreUnhandledErrors` here, deliberately.
    //
    // Node 24.21.0 with vitest 2.1.9's `forks` pool can abort inside
    // `node::MultiIsolatePlatform::DisposeIsolate` (`RemoveEnvironmentCleanupHook`,
    // `Assertion failed: (env) != nullptr`) when a native N-API module is loaded into the shared
    // fork. Measured on this suite: 3 aborts in 10 runs, and `isolate: true` did not change that.
    //
    // The abort kills the fork mid-run, so vitest prints a summary covering only the files that had
    // already finished — often `Tests 29 passed (78)` out of 267 — and still exits 0. A previous
    // setup suppressed the non-zero exit with `dangerouslyIgnoreUnhandledErrors: true`, which meant
    // a build that had verified 11% of its assertions reported success. That is a false pass, and a
    // false pass is worse than a red build: it makes every later claim of verification untrue.
    //
    // The flag is gone. `scripts/run-tests.mjs` now enforces what the flag merely asserted: a run
    // passes only when all 16 files and all 267 tests actually completed and none failed. A crashed
    // fork therefore fails loudly, naming the real numbers, instead of passing quietly. That runner
    // also retries, but only on this exact signature and only when no assertion failed, so a genuine
    // test failure is never retried into a pass.
    //
    // `pool: 'forks'` stays because `tests/product-readiness.test.ts` calls `process.chdir()`, which
    // is unavailable in worker threads; the threads pool runs all 16 files with no abort but fails
    // that one test.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      thresholds: {
        // Measured baseline on the current suite. Function coverage is the weakest area because
        // most handlers are thin wrappers needing live provider credentials to exercise; these
        // floors exist so a regression fails the build rather than quietly lowering coverage.
        statements: 65,
        branches: 55,
        functions: 44,
        lines: 65,
      },
    },
  },
});