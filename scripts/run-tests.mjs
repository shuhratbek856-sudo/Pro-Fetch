// Test runner that refuses to report a truncated run as a pass.
//
// Why this exists: on Node 24.21.0 with vitest 2.1.9's `forks` pool, a native N-API module that
// registers an environment cleanup hook can abort inside `node::MultiIsolatePlatform::DisposeIsolate`
// (`RemoveEnvironmentCleanupHook`, `Assertion failed: (env) != nullptr`). When that happens the fork
// dies mid-run and vitest prints a summary for only the files that had already finished — often
// "Tests 29 passed (78)". The process then exits 0, so a build that stopped after 22% of its
// assertions looks identical to a clean build.
//
// `dangerouslyIgnoreUnhandledErrors` in vitest.config.ts used to hide that: it suppressed the
// non-zero exit and left a truncated run standing as a green result. It was removed for that reason,
// and this runner now enforces the property the flag used to assert without checking.
//
// The contract here is deliberately strict: a run passes only when every expected test file
// completed and no test failed. Anything else — a real assertion failure, a crashed fork, or a
// silently dropped file — exits non-zero with a message naming the actual numbers.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const root = process.cwd();

// Single source of truth for the expectation, so this cannot drift from the suite it guards.
const manifest = require(path.join(root, 'scripts', 'tool-counts.json'));
const expectedTestFiles = manifest.testFiles;
const expectedTests = manifest.testCount;

if (typeof expectedTestFiles !== 'number' || typeof expectedTests !== 'number') {
  console.error('TEST_RUN_FAIL');
  console.error('- scripts/tool-counts.json is missing the testFiles/testCount expectations');
  console.error('  This runner cannot prove a run was complete without a stated expected total.');
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
const vitestArgs = ['vitest', 'run', ...extraArgs];

// The abort is an environment fault, not a property of the code under test, and it is
// intermittent. Retrying is only safe when nothing actually failed: if an assertion failed, that
// verdict is real and must be reported, so no retry happens. This keeps the retry from becoming a
// way to turn a red suite green by trying until it feels like passing.
const MAX_ATTEMPTS = 3;
const NATIVE_ABORT = 'Assertion failed: (env) != nullptr';

function runVitest(attempt) {
  return new Promise((resolve) => {
    const child = spawn('npx', vitestArgs, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let output = '';
    const collect = (chunk) => {
      output += chunk.toString();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('close', (code) => resolve({ code, output }));
  });
}

function evaluate(output) {
  // ANSI escapes otherwise split the summary tokens this parses.
  const plain = output.replace(/\x1b\[[0-9;]*m/g, '');

  const fileMatch = plain.match(/Test Files\s+(?:(\d+)\s+failed\s*\|?\s*)?(?:(\d+)\s+passed\s*)?\((\d+)\)/);
  const testMatch = plain.match(/Tests\s+(?:(\d+)\s+failed\s*\|?\s*)?(?:(\d+)\s+passed\s*\|?\s*)?\((\d+)\)/);

  const failures = [];
  const reportedFiles = fileMatch ? Number(fileMatch[3]) : null;
  const reportedTests = testMatch ? Number(testMatch[3]) : null;
  const failedFiles = fileMatch && fileMatch[1] ? Number(fileMatch[1]) : 0;
  const failedTests = testMatch && testMatch[1] ? Number(testMatch[1]) : 0;

  if (reportedFiles === null || reportedTests === null) {
    failures.push('vitest printed no completion summary, so the run never reached the end');
  } else {
    if (failedTests > 0) failures.push(`${failedTests} test(s) failed`);
    if (failedFiles > 0) failures.push(`${failedFiles} test file(s) failed`);
    if (reportedFiles !== expectedTestFiles) {
      failures.push(`only ${reportedFiles} of ${expectedTestFiles} test files completed`);
    }
    if (reportedTests !== expectedTests) {
      failures.push(`only ${reportedTests} of ${expectedTests} tests completed`);
    }
  }

  return {
    failures,
    reportedFiles,
    reportedTests,
    failedTests,
    failedFiles,
    nativeAbort: plain.includes(NATIVE_ABORT),
  };
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const { code, output } = await runVitest(attempt);
  process.stdout.write(output);

  const result = evaluate(output);

  if (!result.failures.length) {
    if (result.nativeAbort) {
      console.warn('note: a native teardown abort occurred after every test had already passed.');
    }
    console.log(`TEST_RUN_PASS files=${result.reportedFiles} tests=${result.reportedTests}`);
    process.exit(code === 0 ? 0 : 1);
  }

  // Retry only the environment fault: a crashed run with nothing asserted as failing.
  const onlyEnvironmentFault = result.nativeAbort && result.failedTests === 0 && result.failedFiles === 0;

  if (onlyEnvironmentFault && attempt < MAX_ATTEMPTS) {
    console.warn(
      `note: attempt ${attempt}/${MAX_ATTEMPTS} was cut short by the native teardown abort ` +
        `(no assertion failed); retrying.`,
    );
    continue;
  }

  console.error('TEST_RUN_FAIL');
  for (const failure of result.failures) console.error('- ' + failure);
  if (result.nativeAbort) {
    console.error(
      '- a native abort during worker teardown cut the run short; this is the Node 24 ' +
        '`MultiIsolatePlatform::DisposeIsolate` fault, not an assertion failure',
    );
  }
  console.error(`  vitest exit code: ${code}; attempts: ${attempt}`);
  process.exit(1);
}
