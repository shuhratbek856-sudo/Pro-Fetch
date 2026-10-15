// Independent registry contract check. Expected counts live in tool-counts.json,
// not in the test file or README, so editing tests cannot silently bless a wrong count.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

process.env.PRO_FETCH_PROFILE ??= 'full';
await import('../src/loader.js');
const { allTools } = await import('../src/core/tool.js');
const { listTools } = await import('../src/router.js');

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'scripts/tool-counts.json'), 'utf8')) as {
  total: number;
  categories: Record<string, number>;
  profiles: Record<string, number | null>;
  testCount: number;
};
const failures: string[] = [];

/**
 * The published counts in both READMEs must match the manifest.
 *
 * The manifest is already checked against the running registry below, so it cannot be wrong. What
 * could be wrong is the README: both files stated 242 tests, a `smart` profile of 10, `minimal` 72
 * and `standard` 177 after every one of those had changed, because nothing compared the prose to the
 * numbers. A reader is the one who pays for that.
 */
for (const readme of ['README.md', 'README.uz.md']) {
  const text = await readFile(path.join(root, readme), 'utf8');
  const claims: Array<[string, RegExp, number]> = [
    ['test count', /\*\*(\d+) tests?\*\*/i, manifest.testCount],
    ['test count (uz)', /\*\*(\d+) ta test\*\*/i, manifest.testCount],
    ['smart profile', /`smart`\s*\|\s*(\d+)/, manifest.profiles.smart],
    ['minimal profile', /`minimal`\s*\|\s*(\d+)/, manifest.profiles.minimal],
    ['standard profile', /`standard`[^|]*\|\s*(\d+)/, manifest.profiles.standard],
    ['total tools', /(\d+) MCP tool/, manifest.total],
  ];
  for (const [label, pattern, expected] of claims) {
    if (expected == null) continue;
    const found = pattern.exec(text);
    if (found && Number(found[1]) !== expected) {
      failures.push(`${readme} ${label}: states ${found[1]}, manifest says ${expected}`);
    }
  }
}
const tools = allTools();
const actual: Record<string, number> = {};
const names = new Set<string>();
for (const tool of tools) {
  actual[tool.category] = (actual[tool.category] ?? 0) + 1;
  if (names.has(tool.name)) failures.push(`duplicate tool name: ${tool.name}`);
  names.add(tool.name);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name)) failures.push(`invalid MCP tool name: ${tool.name}`);
  if (typeof tool.description !== 'string' || tool.description.trim().length < 10)
    failures.push(`missing/short description: ${tool.name}`);
  if (typeof tool.handler !== 'function') failures.push(`missing handler: ${tool.name}`);
  const schema = tool.inputSchema;
  if (!schema || schema.type !== 'object' || !schema.properties || typeof schema.properties !== 'object') {
    failures.push(`invalid object input schema: ${tool.name}`);
    continue;
  }
  for (const key of schema.required ?? []) {
    if (!Object.prototype.hasOwnProperty.call(schema.properties, key))
      failures.push(`required property '${key}' is absent from schema properties: ${tool.name}`);
  }
  if (schema.additionalProperties === true) failures.push(`input schema allows unspecified properties: ${tool.name}`);
}
for (const category of new Set([...Object.keys(manifest.categories), ...Object.keys(actual)])) {
  if ((manifest.categories[category] ?? 0) !== (actual[category] ?? 0)) {
    failures.push(
      `category '${category}': registered ${actual[category] ?? 0}, expected ${manifest.categories[category] ?? 0}`,
    );
  }
}
if (tools.length !== manifest.total)
  failures.push(`total tools: registered ${tools.length}, expected ${manifest.total}`);
if (Object.values(manifest.categories).reduce((sum, value) => sum + value, 0) !== manifest.total)
  failures.push('tool-count manifest total does not equal category sum');
if (listTools('smart').length !== (manifest.profiles.smart ?? 5))
  failures.push(`smart profile has ${listTools('smart').length} tools, expected ${manifest.profiles.smart ?? 5}`);
// Every profile size is declared, so a profile that silently starts leaking or hiding tools fails
// here rather than in a consumer's `tools/list`.
for (const profile of ['minimal', 'standard', 'full'] as const) {
  const expected = manifest.profiles?.[profile];
  if (expected == null) {
    failures.push(`manifest is missing the expected size for the '${profile}' profile`);
    continue;
  }
  const actualSize = listTools(profile).length;
  if (actualSize !== expected) failures.push(`${profile} profile has ${actualSize} tools, expected ${expected}`);
}

if (failures.length) {
  console.error('REGISTRY_VERIFICATION_FAIL');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}
console.log('REGISTRY_VERIFICATION_PASS');
console.log(
  `registered=${tools.length}; categories=${Object.keys(actual).length}; smart=${listTools('smart').length}; unique_names=${names.size}; schema_handler_checks=passed`,
);
