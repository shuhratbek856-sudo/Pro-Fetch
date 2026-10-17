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
import { readFileSync, writeFileSync } from 'node:fs';

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

    // Fewer than expected is the signal this check exists for: a worker that dies mid-run prints a
    // summary covering only the files that finished.
    //
    // *More* than expected is not that. It means the manifest is stale, which happened three times
    // while categories were being added - each time with every single test passing, and each time
    // reported as "only 30 of 29 test files completed", a sentence that describes a crash and reads
    // as one. The two directions are therefore separated, and the stale case rewrites the manifest
    // from the number the runner just measured instead of failing a green suite.
    if (reportedFiles < expectedTestFiles) {
      failures.push(`only ${reportedFiles} of ${expectedTestFiles} test files completed`);
    }
    if (reportedTests < expectedTests) {
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

/**
 * Record the counts the runner just measured.
 *
 * Writing them here is what makes the manifest stop being a hand-maintained number. The README still
 * has to be updated by hand after this - `verify:registry` compares its prose against the manifest and
 * will say so - but two exact-string edits is a different cost from a red build that looks like a
 * crash, three times over.
 */
function syncManifestCounts(reportedFiles, reportedTests) {
  const file = path.join(root, 'scripts', 'tool-counts.json');
  const current = JSON.parse(readFileSync(file, 'utf8'));
  if (current.testFiles === reportedFiles && current.testCount === reportedTests) return false;
  current.testFiles = reportedFiles;
  current.testCount = reportedTests;
  writeFileSync(file, JSON.stringify(current, null, 2) + '\n', 'utf8');
  console.warn(
    `note: scripts/tool-counts.json testFiles ${expectedTestFiles} -> ${reportedFiles}, ` +
      `testCount ${expectedTests} -> ${reportedTests}. README dagi test badge'larini yangilang.`,
  );
  return true;
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  const { code, output } = await runVitest(attempt);
  process.stdout.write(output);

  const result = evaluate(output);

  if (!result.failures.length) {
    // The suite is green and complete, so this is the one moment the manifest can be trusted to
    // describe it. Doing it here rather than by hand means the number cannot lag the code.
    if (result.reportedFiles !== null && result.reportedTests !== null) {
      syncManifestCounts(result.reportedFiles, result.reportedTests);
    }
    if (result.nativeAbort) {
      console.warn('note: a native teardown abort occurred after every test had already passed.');
    }
    // The verdict must match the exit code. This used to print `TEST_RUN_PASS` and then exit 1
    // whenever vitest reported a non-zero status, so a transcript read "every check passed" while the
    // shell said failure - the same disagreement this project keeps fixing in the tools, and worse here
    // because the person reading the log is the person who has to decide what to do next.
    //
    // A worker that dies during teardown after every test has passed is an environment fault, not a
    // failing test, and vitest signals it with a non-zero code. It is retried rather than reported,
    // because it reproduces intermittently and the retry is known to clear it.
    if (code === 0) {
      console.log(`TEST_RUN_PASS files=${result.reportedFiles} tests=${result.reportedTests}`);
      process.exit(0);
    }
    if (attempt < MAX_ATTEMPTS) {
      console.warn(
        `note: attempt ${attempt}/${MAX_ATTEMPTS} passed every test but vitest exited ${code} ` +
          '(worker teardown fault); retrying.',
      );
      continue;
    }
    console.error(
      `TEST_RUN_INCONCLUSIVE files=${result.reportedFiles} tests=${result.reportedTests} — ` +
        'barcha test o‘tdi, lekin vitest har urinishda noaniq kod berdi (worker teardown).',
    );
    process.exit(1);
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
