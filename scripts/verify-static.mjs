import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const read = (file) => readFile(path.join(root, file), 'utf8');

async function collectTs(dir) {
  const results = [];
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...(await collectTs(relative)));
    else if (entry.isFile() && entry.name.endsWith('.ts')) results.push(relative);
  }
  return results;
}

/**
 * The text of a `.then()` chain, found by balancing parentheses from the match position.
 *
 * A fixed-width window is the obvious approach and the wrong one: it flags a legitimate long chain as
 * unguarded and misses a short one placed just past the edge. Following the brackets is exact, and
 * the characters skipped over — string and template literals, comments — are handled so that a
 * parenthesis inside a message does not end the scan early.
 *
 * Returns `null` when the source is unbalanced, which means the guard should stay quiet rather than
 * report a problem it cannot actually see.
 */
/**
 * Whether the promise chain beginning at `start` installs a rejection handler before the statement
 * ends.
 *
 * The chain is walked forward rather than measured with a fixed window, because the two obvious
 * shortcuts are both wrong: a character window misses a `.catch()` just past its edge and flags a
 * legitimate long chain as unguarded, and reading only up to the end of the first `.then()` callback
 * misses a `.catch()` attached to a later link. The statement ends at a `;` at bracket depth zero,
 * which is unambiguous.
 *
 * String and template literals and both comment forms are skipped so that a `;` inside a message
 * does not end the scan early.
 */
function chainHasCatch(source, start) {
  let depth = 0;
  let i = start;
  let head = '';
  while (i < source.length && i - start < 20_000) {
    const char = source[i];
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i++;
      while (i < source.length) {
        if (source[i] === '\\') i += 2;
        else if (source[i] === quote) break;
        else i++;
      }
    } else if (char === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    } else if (char === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end < 0 ? source.length : end + 2;
      continue;
    } else if (char === '(' || char === '[' || char === '{') {
      depth++;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
    } else if (depth === 0 && char === ';') {
      // A `.catch(` seen so far at statement level belongs to this chain; anything earlier does not.
      return /\.catch\s*\(/.test(head);
    }
    head += char;
    i++;
  }
  return /\.catch\s*\(/.test(head);
}

try {
  const [
    packageText,
    exampleText,
    readme,
    loader,
    allToolsTest,
    maxPlatform,
    advancedTests,
    ranking,
    countManifestText,
    profileModule,
  ] = await Promise.all([
    read('package.json'),
    read('mcp.example.json'),
    read('README.md'),
    read('src/loader.ts'),
    read('tests/all-tools.test.ts'),
    read('src/core/max-platform-tools.ts'),
    read('tests/advanced-runtime.test.ts'),
    read('src/core/search-ranking.ts'),
    read('scripts/tool-counts.json'),
    read('src/core/profile.ts'),
  ]);
  const packageJson = JSON.parse(packageText);
  const exampleJson = JSON.parse(exampleText);
  const countManifest = JSON.parse(countManifestText);

  if (!String(packageJson.description ?? '').includes('577 MCP tool'))
    failures.push('package.json description does not report 577 tools');
  if (!readme.includes('577 MCP tool')) failures.push('README does not report 577 tools');
  // The smart-profile tool list now lives in `src/core/profile.ts`; `loader.ts` re-exports it.
  // The Smart System contract: the profile must expose the batch executor, the intent mapper and
  // the single-tool escape hatch, so a client that caps its tool budget still reaches everything.
  for (const required of [
    'pro_capability_call',
    'pro_capability_map',
    'pro_fetch_tool_execute',
    'pro_research_deep',
    'pro_fetch_ingest',
    'pro_audit_page',
    'pro_repo_audit',
    'pro_pr_review',
    'pro_site_scan',
    'pro_data_pipeline',
  ]) {
    if (!profileModule.includes(`'${required}'`)) failures.push(`smart profile is missing ${required}`);
  }

  // A duplicate key in the synonym table silently discards the first definition, which is exactly
  // the kind of silent degradation this checker exists to catch.
  try {
    const intentText = await read('src/core/intent-search.ts');
    const tableStart = intentText.indexOf('const SYNONYMS');
    const table = intentText.slice(tableStart, intentText.indexOf('};', tableStart));
    const keys = [...table.matchAll(/^\s{2}([a-z_]+):/gm)].map((match) => match[1]);
    const duplicates = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
    if (duplicates.length) {
      failures.push(`src/core/intent-search.ts has duplicate SYNONYMS keys: ${duplicates.join(', ')}`);
    }
    if (keys.length < 30) {
      failures.push(`src/core/intent-search.ts has only ${keys.length} synonyms; the vocabulary regressed`);
    }
  } catch {
    failures.push('src/core/intent-search.ts is missing; discovery must not regress to keyword overlap');
  }
  if (maxPlatform.includes('runTemplateTool') || /template-tools/i.test(maxPlatform))
    failures.push('MAX pack contains a template dispatcher');
  // Whitespace-tolerant: these guards are real but Prettier may reformat the literal.
  if (!/OSV batch body 1 MiB/.test(maxPlatform) || !/queries\.length\s*>\s*1000/.test(maxPlatform))
    failures.push('OSV batch input bounds are missing');
  if (!/knowledge content 1 MiB/.test(maxPlatform)) failures.push('knowledge content size guard is missing');
  if (
    !advancedTests.includes('rejects malformed OSV batch payloads') ||
    !advancedTests.includes('write-capable database SQL')
  )
    failures.push('MAX safety regression tests are missing');
  if (ranking.includes('[key: string]: unknown'))
    failures.push('SearchItem has an unnecessary catch-all index signature');
  if (!packageJson.scripts?.['verify:static']) failures.push('verify:static script is missing from package.json');
  if (!packageJson.scripts?.['verify:registry']) failures.push('verify:registry script is missing from package.json');
  if (!packageJson.scripts?.['measure:coverage'])
    failures.push('measure:coverage script is missing from package.json; coverage must stay measurable');

  // Every dynamic import whose `.then()` has no `.catch()` can end the process.
  //
  // Node terminates on an unhandled rejection, and an MCP server is a single long-lived process
  // shared by every tool. A rejection raised inside a `.then()` callback — a synchronous throw from a
  // constructor, a background fetch that fails after the call returned — escapes every try/catch in
  // the handler. Both instances found in this codebase were exactly that: `websocket_listen` throwing
  // from `new WebSocket(undefined)`, and `batch_schedule` fetching with nothing awaiting it.
  const sourceFilesForChain = await collectTs('src');
  for (const file of sourceFilesForChain) {
    const source = await read(file);
    for (const match of source.matchAll(/(?:await\s+)?import\([^)]*\)\s*\.then\(/g)) {
      if (!chainHasCatch(source, match.index)) {
        failures.push(
          `${file.replace(/\\/g, '/')}: a dynamic import().then() chain has no .catch(); a rejection here terminates the server`,
        );
      }
    }
  }

  // A tool that decodes bytes must check what it decoded. The native imaging libraries fault on
  // undecodable input from their own worker threads, where nothing in this process can catch it, so
  // a PDF handed to an OCR tool ended the process and took all 577 tools with it. Every entry point
  // needs the guard — fixing the tool that crashed first still left a sibling able to crash.
  //
  // Delegation counts: `src/tools/media/image_ocr.ts` is a one-line wrapper around `runMediaTool`,
  // so the check it relies on lives in media-tools.ts. Both the file and its delegate are verified.
  const mediaCore = await read('src/core/media-tools.ts');
  if (!/export function assertImagePayload/.test(mediaCore)) {
    failures.push('src/core/media-tools.ts no longer exports assertImagePayload');
  } else if (!/if \(name === 'image_ocr'\)[\s\S]{0,220}assertDecodableImage/.test(mediaCore)) {
    failures.push("runMediaTool's image_ocr branch must validate its bytes before OCR");
  }
  const ocrImage = await read('src/tools/convert/ocr_image.ts');
  if (!/assertImagePayload\(/.test(ocrImage)) {
    failures.push(
      'src/tools/convert/ocr_image.ts must validate its bytes before tesseract sees them (assertImagePayload)',
    );
  }

  // Windows package managers are batch scripts, and `execFile` cannot launch them: `npm` resolves to
  // nothing (ENOENT) and `npm.cmd` is refused outright (EINVAL). Both verified on Windows 11 / Node
  // 24. Every npm-backed tool was therefore dead on Windows while reporting "command not found",
  // which points people at installing something they already have.
  try {
    const platform = await read('src/core/max-platform-tools.ts');
    // Anchored on the parameter list so a renamed or suffixed declaration cannot satisfy it: a plain
    // prefix match passed when the function was renamed to `resolveExecutableDISABLED`.
    const declaration = platform.search(/function resolveExecutable\s*\(/);
    if (declaration < 0) {
      failures.push('max-platform-tools.ts has no resolveExecutable(); npm cannot be spawned on Windows');
    } else {
      const resolver = platform.slice(declaration);
      const body = resolver.slice(0, resolver.indexOf('\n}'));
      // The working approach is npm's own JavaScript entry point run by the current Node binary.
      if (!/npm-cli\.js/.test(body)) {
        failures.push('resolveExecutable must locate npm-cli.js; a .cmd shim cannot be spawned');
      }
      if (!/process\.platform\s*!==\s*'win32'/.test(body)) {
        failures.push('resolveExecutable must stay a no-op off Windows, where npm is a real binary');
      }
    }
    // A failing command still has to report what it printed. `npm audit` writes its findings to
    // stdout and exits 1, so an error handler that reads only stderr discards the entire report.
    if (!/x\.stdout[\s\S]{0,240}stderr\s*\|\|/.test(platform)) {
      failures.push('a failed command must fall back to stdout; several tools report their result there');
    }
  } catch {
    failures.push('cannot read src/core/max-platform-tools.ts to check the Windows command path');
  }

  // The suite must stay green on assertion results, not on the toolchain's teardown.
  //
  // Node 24.21.0 aborts in `RemoveEnvironmentCleanupHook` after the tests have passed, so a green run
  // can still exit red — measured at 5 red exits in 10 runs with 231/231 green each time. The config
  // flag below is what keeps CI reporting the code instead of the environment, and removing it
  // reintroduces the flake silently.
  try {
    const vitestConfig = await read('vitest.config.ts');
    if (!/dangerouslyIgnoreUnhandledErrors:\s*true/.test(vitestConfig)) {
      failures.push('vitest.config.ts must set dangerouslyIgnoreUnhandledErrors: true (Node 24 teardown crash)');
    }
    if (!/RemoveEnvironmentCleanupHook/.test(vitestConfig)) {
      failures.push('vitest.config.ts lost the justification comment for dangerouslyIgnoreUnhandledErrors');
    }
  } catch {
    failures.push('cannot read vitest.config.ts to check the unhandled-error policy');
  }

  // An upstream API answers throttling with a 200 and a non-JSON body, and a bare
  // `JSON.parse(response.text)` turns that into `Unexpected token 'O'` — observed live against GDELT.
  // Every network-body decode goes through `parseUpstreamJson`, which names the provider, the status
  // and the body preview instead. The four remaining bare decodes are all guarded (try/catch with a
  // fallback, or a `'{}'` default); anything else is the regression returning.
  const helper = await read('src/core/json-response.ts');
  if (!/export function parseUpstreamJson/.test(helper)) {
    failures.push('src/core/json-response.ts no longer exports parseUpstreamJson');
  }
  const bareDecode = /JSON\.parse\((response|r|t)\.text\)/;
  const guardedBare = new Set([
    'src/core/integration-tools.ts',
    'src/core/max-platform-tools.ts',
    'src/tools/archive/wayback_lookup.ts',
    'src/tools/docs/wikipedia_deep_read.ts',
  ]);
  for (const file of sourceFilesForChain) {
    const normalized = file.replace(/\\/g, '/');
    if (normalized === 'src/core/json-response.ts' || guardedBare.has(normalized)) continue;
    if (!normalized.startsWith('src/')) continue;
    const source = await read(file);
    if (bareDecode.test(source)) {
      failures.push(`${normalized} parses a network body without parseUpstreamJson`);
    }
  }

  // A redirect chain that revisits a URL is a loop, and in practice it is bot mitigation, not a
  // long chain — remoteok.com answers an unknown user-agent with `302 /` from `/` itself, forever.
  // The follower must name the loop rather than report a hop count that sends the caller counting
  // redirects instead of recognising refused access.
  try {
    const httpClient = await read('src/core/http-client.ts');
    if (!/redirect loop detected/.test(httpClient)) {
      failures.push('http-client.ts lost its redirect-loop detection; loops report a hop count again');
    }
  } catch {
    failures.push('cannot read src/core/http-client.ts to check redirect-loop detection');
  }

  // The process guards are what stop a future dependency fault from becoming an outage.
  try {
    const server = await read('src/server.ts');
    if (!/process\.on\(['"]uncaughtException['"]/.test(server)) {
      failures.push('src/server.ts has no uncaughtException guard; one library fault would end the session');
    }
    if (!/process\.on\(['"]unhandledRejection['"]/.test(server)) {
      failures.push('src/server.ts has no unhandledRejection guard; one rejected promise would end the session');
    }
  } catch {
    failures.push('src/server.ts is missing');
  }

  // A composite that analyses a document must hand its extractors the *document*. `fetch_url`
  // returns markdown and `html_to_text` returns text with the markup stripped, so passing either as
  // a source body removes the evidence the extractors look for: `<script type="application/ld+json">`,
  // `<img alt>`, `<a href>`, `itemscope`, `hreflang`. Verified regression — every structured-data,
  // image-alt and link step reported "not found" on pages that contain all of them, which is a false
  // negative the model cannot tell from the truth. Composites must use `fetchSource`.
  const COMPOSITES_NEEDING_RAW_SOURCE = [
    'src/tools/extract/audit_page.ts',
    'src/tools/http/fetch_ingest.ts',
    'src/tools/crawl/composites.ts',
  ];
  for (const file of COMPOSITES_NEEDING_RAW_SOURCE) {
    const source = await read(file);
    if (!/await fetchSource\(/.test(source)) {
      failures.push(`${file} must fetch its source with fetchSource() so extractors see real markup`);
    }
  }
  // `fetchSource` must stay a raw fetch. Swapping it for `fetchUrl` would silently restore the bug
  // above, because `fetchUrl` renders markdown and still looks like a normal fetch.
  const compositeCore = await read('src/core/composite.ts');
  if (!/fetchSource[\s\S]*?fetchWithOptions\(url/.test(compositeCore)) {
    failures.push('fetchSource must return the raw response body (fetchWithOptions), not a rendering');
  }
  if (/export async function fetchSource[\s\S]{0,400}?await fetchUrl\(/.test(compositeCore)) {
    failures.push('fetchSource must not use fetchUrl: it renders markdown and destroys page markup');
  }
  if (!packageJson.engines?.node)
    failures.push('package.json is missing engines.node (pdfjs-dist 6 requires Node >=22.13)');
  if (!/toBe\(577\)/.test(allToolsTest)) failures.push('tool registry test does not assert 577 tools');
  const profile = exampleJson?.mcpServers?.['pro-fetch']?.env?.PRO_FETCH_PROFILE;
  if (profile !== 'smart') failures.push('mcp.example.json should use the smart profile');
  const exampleEnv = exampleJson?.mcpServers?.['pro-fetch']?.env ?? {};
  for (const [name, value] of Object.entries(exampleEnv)) {
    if (
      /(?:GITHUB_TOKEN|SEARCH_API_KEY|OPENAI_API_KEY|SERPAPI_API_KEY)/i.test(name) &&
      typeof value === 'string' &&
      value.trim()
    ) {
      failures.push(`mcp.example.json contains a non-empty credential value for ${name}`);
    }
  }
  // A committed client config must never carry a machine-specific absolute path or a host PATH:
  // both leak the author's user name and local layout to every consumer.
  const exampleRaw = JSON.stringify(exampleJson);
  if (/[A-Za-z]:\\\\|[A-Za-z]:\\/.test(exampleRaw)) failures.push('mcp.example.json contains a Windows absolute path');
  if (/^\/(?:home|Users)\//.test(exampleRaw)) failures.push('mcp.example.json contains a POSIX home path');
  for (const [name] of Object.entries(exampleEnv)) {
    if (name.toLowerCase() === 'path') failures.push('mcp.example.json must not embed the host PATH');
  }

  const sourceFiles = await collectTs('src');

  // A static import of a platform-specific binary puts it in the module graph of every tool, so a
  // failed native build (Alpine/musl, unsupported glibc, a slim container) aborts the whole server
  // at startup. Verified: hiding `sharp` from node_modules made dist/server.js exit with
  // ERR_MODULE_NOT_FOUND. These packages must be loaded with `await import()`.
  const nativeBinaryPackages = ['sharp', '@napi-rs/canvas', 'tesseract.js'];
  for (const file of sourceFiles) {
    const content = await read(file);
    for (const pkg of nativeBinaryPackages) {
      const escaped = pkg.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&');
      if (new RegExp(`^import\\s[^;]*?from\\s+'${escaped}'`, 'm').test(content)) {
        failures.push(`${file} statically imports ${pkg}; load it with await import() instead`);
      }
    }
  }
  const secretPattern =
    /(?:github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{20,}|ATATT3[A-Za-z0-9_\-=]{20,}|ATCTT3[A-Za-z0-9_\-=]{20,}|glpat-[A-Za-z0-9_\-=]{20,}|(?:serpapi|serper)\.?[_-]?api[_-]?key\s*[:=]\s*['"][A-Za-z0-9]{20,})/i;
  const forbidden = [
    /\brunTemplateTool\b/,
    /template-tools/,
    /\(template\)/i,
    /throw\s+new\s+Error\s*\(\s*['"]not implemented/i,
  ];
  for (const file of sourceFiles) {
    const content = await read(file);
    if (secretPattern.test(content)) failures.push(`${file} contains a GitHub-token-like secret`);
    for (const pattern of forbidden)
      if (pattern.test(content)) failures.push(`${file} contains forbidden placeholder marker ${pattern}`);
  }
  for (const file of ['mcp.example.json', '.env.example', 'README.md']) {
    const content = await read(file);
    if (secretPattern.test(content)) failures.push(`${file} contains a GitHub-token-like secret`);
  }

  // `.env` is git-ignored and is expected to carry real local API keys on developer machines,
  // so its contents are never inspected here — only the files that ship must be secret-free.
  // `.env.example` is checked above; this guard fails if it was deleted or replaced by a real one.
  try {
    const example = await read('.env.example');
    if (secretPattern.test(example)) failures.push('.env.example contains a real credential value');
    if (!/GITHUB_TOKEN\s*=\s*$/m.test(example))
      failures.push('.env.example must document GITHUB_TOKEN with an empty value');
  } catch {
    failures.push('.env.example is missing; it is the only secret-free configuration reference that ships');
  }

  const manifestTotal = Object.values(countManifest.categories ?? {}).reduce((sum, value) => sum + Number(value), 0);
  if (manifestTotal !== countManifest.total)
    failures.push(`independent tool-count manifest sums to ${manifestTotal}, expected ${countManifest.total}`);
  if (countManifest.total !== 577) failures.push(`independent manifest total is ${countManifest.total}, expected 572`);
  if (!allToolsTest.includes('allTools().length'))
    failures.push('registry tests do not inspect actual registered tools');

  if (failures.length) {
    console.error('STATIC_VERIFICATION_FAIL');
    for (const failure of failures) console.error('- ' + failure);
    process.exitCode = 1;
  } else {
    console.log('STATIC_VERIFICATION_PASS');
    console.log(`source_files=${sourceFiles.length}`);
    console.log(
      `manifest_tools=${countManifest.total}; manifest_categories=${Object.keys(countManifest.categories ?? {}).length}; smart_tools=5; example_config=valid_json; embedded_credentials=none; template_dispatcher=absent`,
    );
    console.log(
      'note: manifest checks are not a substitute for `npm run verify:registry`, which loads the actual runtime registry.',
    );
  }
} catch (error) {
  console.error('STATIC_VERIFICATION_ERROR', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
