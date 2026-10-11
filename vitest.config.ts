import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // The registry must load before any profile-dependent assertion, and several suites mutate
    // process.env, so files run in a single process to keep the shared registry consistent.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
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