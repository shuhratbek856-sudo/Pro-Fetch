/**
 * Reads a Vitest run summary and judges it against the manifest.
 *
 * ## Why this is a module and not a function inside `run-tests.mjs`
 *
 * Because a unit test cannot import `run-tests.mjs` to reach it: that file *runs the suite*, so
 * importing it from a test spawns a nested run and, when that run fails, calls `process.exit(1)` inside
 * the test worker. Measured: `Error: process.exit unexpectedly called with "1"`, reported against a
 * test file that collected zero tests.
 *
 * So the decision lives here and the runner imports it. The test can now exercise the parsing directly,
 * including the summaries that motivated it, without starting anything.
 *
 * ## The parsing
 *
 * Each state is found on its own and the total is read from the trailing `(N)`, so neither the order
 * nor the presence of any state matters. The previous patterns matched a fixed `failed | passed` shape:
 *
 *     Tests  741 passed (741)                 -> matched
 *     Tests  1 failed | 740 passed (741)      -> matched
 *     Tests  3 skipped | 738 passed (741)     -> NO MATCH
 *     Test Files  1 skipped | 37 passed (38)  -> NO MATCH
 *
 * A run with a skipped test reported "vitest printed no completion summary, so the run never reached
 * the end" - a sentence describing a crash, produced by a run that finished cleanly.
 */

/** One `N state (total)` segment, with each state counted independently. */
function parseCounts(rest) {
  if (!rest) return null;
  const total = /\((\d+)\)\s*$/.exec(rest);
  if (!total) return null;
  const pick = (label) => {
    const found = new RegExp('\\b(\\d+)\\s+' + label + '\\b').exec(rest);
    return found ? Number(found[1]) : 0;
  };
  return {
    total: Number(total[1]),
    failed: pick('failed'),
    passed: pick('passed'),
    skipped: pick('skipped'),
    todo: pick('todo'),
  };
}

/** Parse raw Vitest output, with or without ANSI escapes. */
export function parseSummary(output) {
  const plain = String(output).replace(/\x1b\[[0-9;]*m/g, '');
  const files = parseCounts(/^\s*Test Files\s+(.*)$/m.exec(plain)?.[1]);
  const tests = parseCounts(/^\s*Tests\s+(.*)$/m.exec(plain)?.[1]);
  return { files, tests };
}

/**
 * Decide whether a run is acceptable.
 *
 * `expectedTestFiles` and `expectedTests` come from `scripts/tool-counts.json`, which the runner
 * rewrites when a run reports *more* than expected - see the stale-manifest note below.
 */
export function evaluateSummary(output, { expectedTestFiles, expectedTests }) {
  const { files, tests } = parseSummary(output);

  const failures = [];
  const reportedFiles = files ? files.total : null;
  const reportedTests = tests ? tests.total : null;
  const failedFiles = files ? files.failed : 0;
  const failedTests = tests ? tests.failed : 0;
  const skippedTests = tests ? tests.skipped : 0;

  // Compared against what actually *ran*, not against the total in the parentheses.
  //
  // The previous code compared the trailing `(N)`, which is the total the run *planned*: Vitest prints
  // `Test Files  20 passed (38)` when a worker dies after twenty files, and 38 is the total, so
  // 38 < 38 was false and the check never fired. The sentence it was reaching for - "only 20 of 38
  // test files completed" - describes a truncated run accurately, which is why the number in it has to
  // be the count that ran. A test that fails rather than crashes still ran.
  //
  // Declared out here rather than inside the branch because `manifestStale` below reads them too, and
  // that is the question a stale manifest actually turns on.
  const completedFiles = files ? files.passed + files.failed + files.skipped : null;
  const completedTests = tests ? tests.passed + tests.failed + tests.skipped : null;

  if (reportedFiles === null || reportedTests === null) {
    failures.push('vitest printed no completion summary, so the run never reached the end');
  } else {
    // A skipped test is neither a pass nor a failure, and this runner has to say which it saw.
    //
    // Before the parsing was widened a skip could not be read at all, so the run was reported as though
    // it had crashed. Now that it reads, treating it as a pass would be the other half of the same
    // mistake: a suite where a third of the assertions never ran would report a pass. The manifest
    // counts are compared against the number that actually ran, so a skip cannot quietly rewrite them
    // either - a skipped run always ends in `failures`, which is what stops the rewrite path.
    if (skippedTests > 0) {
      failures.push(`${skippedTests} test skipped - ular bajarilmadi, shuning uchun to‘liq o‘tgan hisoblanmaydi`);
    }
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
    if (completedFiles < expectedTestFiles) {
      failures.push(`only ${completedFiles} of ${expectedTestFiles} test files completed`);
    }
    if (completedTests < expectedTests) {
      failures.push(`only ${completedTests} of ${expectedTests} tests completed`);
    }
  }

  return {
    failures,
    reportedFiles,
    reportedTests,
    skippedTests,
    failedFiles,
    failedTests,
    /** Files and tests that actually ran, which is what the manifest is compared against. */
    completedFiles: files ? files.passed + files.failed + files.skipped : null,
    completedTests: tests ? tests.passed + tests.failed + tests.skipped : null,
    /** The manifest is stale when everything passed and the totals grew. */
    manifestStale:
      failures.length === 0 &&
      reportedFiles !== null &&
      reportedTests !== null &&
      (completedFiles > expectedTestFiles || completedTests > expectedTests),
  };
}
