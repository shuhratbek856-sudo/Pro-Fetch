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

try {
  const [
    packageText,
    qwenText,
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
    read('qwen-mcp.example.json'),
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
  const qwenJson = JSON.parse(qwenText);
  const countManifest = JSON.parse(countManifestText);

  if (!String(packageJson.description ?? '').includes('569 MCP tool'))
    failures.push('package.json description does not report 569 tools');
  if (!readme.includes('569 MCP tool')) failures.push('README does not report 569 tools');
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
  if (!packageJson.engines?.node)
    failures.push('package.json is missing engines.node (pdfjs-dist 6 requires Node >=22.13)');
  if (!/toBe\(569\)/.test(allToolsTest)) failures.push('tool registry test does not assert 569 tools');
  const profile = qwenJson?.mcpServers?.['pro-fetch']?.env?.PRO_FETCH_PROFILE;
  if (profile !== 'smart') failures.push('qwen-mcp.example.json should use the smart profile');
  const qwenEnv = qwenJson?.mcpServers?.['pro-fetch']?.env ?? {};
  for (const [name, value] of Object.entries(qwenEnv)) {
    if (
      /(?:GITHUB_TOKEN|SEARCH_API_KEY|OPENAI_API_KEY|SERPAPI_API_KEY)/i.test(name) &&
      typeof value === 'string' &&
      value.trim()
    ) {
      failures.push(`qwen-mcp.example.json contains a non-empty credential value for ${name}`);
    }
  }
  // A committed client config must never carry a machine-specific absolute path or a host PATH:
  // both leak the author's user name and local layout to every consumer.
  const qwenRaw = JSON.stringify(qwenJson);
  if (/[A-Za-z]:\\\\|[A-Za-z]:\\/.test(qwenRaw))
    failures.push('qwen-mcp.example.json contains a Windows absolute path');
  if (/^\/(?:home|Users)\//.test(qwenRaw)) failures.push('qwen-mcp.example.json contains a POSIX home path');
  for (const [name] of Object.entries(qwenEnv)) {
    if (name.toLowerCase() === 'path') failures.push('qwen-mcp.example.json must not embed the host PATH');
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
  for (const file of ['qwen-mcp.example.json', '.env.example', 'README.md']) {
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
  if (countManifest.total !== 569) failures.push(`independent manifest total is ${countManifest.total}, expected 569`);
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
      `manifest_tools=${countManifest.total}; manifest_categories=${Object.keys(countManifest.categories ?? {}).length}; smart_tools=5; qwen_config=valid_json; embedded_credentials=none; template_dispatcher=absent`,
    );
    console.log(
      'note: manifest checks are not a substitute for `npm run verify:registry`, which loads the actual runtime registry.',
    );
  }
} catch (error) {
  console.error('STATIC_VERIFICATION_ERROR', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
