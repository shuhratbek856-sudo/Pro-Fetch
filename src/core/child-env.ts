/**
 * The environment a child process receives.
 *
 * ## The problem
 *
 * `execFileAsync` was called with `env: { ...process.env, ...env }`. Every tool that shells out handed
 * its child the server's entire environment, so a script run by `npm_run_script` could read any
 * credential the server had been started with - `OPENAI_API_KEY`, `GITHUB_TOKEN`, `DATABASE_URL` - and
 * print it. `npm test` and `npm build` require `PRO_FETCH_ALLOW_COMMANDS=true` and a per-command
 * confirmation, which shows the intent to make process spawning deliberate. Passing the whole
 * environment made that approval meaningless for anything the approved command went on to run.
 *
 * ## The rule
 *
 * A child gets the variables a command needs to work, plus whatever the caller names explicitly, and
 * nothing else. Concretely:
 *
 *   - An **allowlist** of the variables a CLI genuinely requires: `PATH`, the Windows equivalents,
 *     locale, and the temp directory. Without `PATH` git and npm do not run at all.
 *   - Every `PRO_FETCH_*` variable, because those configure this server and a child may legitimately
 *     need to know the same cache and output roots.
 *   - An explicit **credential filter** applied last, so a variable that is both allowlisted and named
 *     like a secret is still dropped. `SSH_AUTH_SOCK` is the usual collision.
 *
 * ## What this breaks, and how to see it
 *
 * A child that genuinely needs a variable no longer set can ask for it by name at the call site, which
 * makes the dependency visible in the source instead of implicit in the process. `describeChildEnv` is
 * exported so the drop list can be inspected: the point is that the set of variables reaching a child is
 * a decision someone can read, not an accident of how the server was launched.
 */

/**
 * Variables a command needs in order to run at all.
 */
const REQUIRED: readonly string[] = [
  // POSIX
  'PATH',
  'HOME',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TZ',
  'TERM',
  'SHELL',
  'TMPDIR',
  // Windows
  'SystemRoot',
  'SYSTEMROOT',
  'windir',
  'COMSPEC',
  'PATHEXT',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'TEMP',
  'TMP',
  'USERDOMAIN',
  'USERNAME',
  // Node and npm need these to locate their own installation and cache.
  'NODE_PATH',
  'NODE_EXTRA_CA_CERTS',
  'NODE_REPL_HISTORY',
  'npm_config_cache',
  'npm_config_prefix',
  'NPM_CONFIG_CACHE',
  'NPM_CONFIG_PREFIX',
  'NPM_TOKEN_USERCONFIG',
  // Git and other VCS clients
  'GIT_CONFIG_NOSYSTEM',
  'GIT_TERMINAL_PROMPT',
  'GIT_SSH_COMMAND',
  'GIT_ASKPASS',
  'SSH_AUTH_SOCK',
  'GIT_PAGER',
  'GIT_EDITOR',
  'EDITOR',
  'VISUAL',
];

/**
 * Names that indicate a credential, matched case-insensitively.
 *
 * Applied after the allowlist, so a name that is both needed and secret is dropped rather than passed
 * through: forwarding `SSH_AUTH_SOCK` would give the child the agent's socket, and forwarding
 * `NPM_TOKEN_*` would give it the registry token.
 */
const CREDENTIAL_NAME =
  /(?:^|_)(?:API_?KEY|ACCESS_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD|CREDENTIALS?|AUTH|SESSION|COOKIE|PRIVATE|CERT_?KEY|SIGNATURE|ACCESS_KEY_ID|SECRET_ACCESS_KEY)(?:_|$)/i;

/** Variable names that are credential-like but are safe, with the reason each is exempted. */
const CREDENTIAL_EXEMPT: readonly string[] = [
  // Selects a credential *helper*; without it git cannot ask for one at all.
  'GIT_ASKPASS',
  // Passphrase-free key path only - it names a file, not the secret in it.
  'SSH_AUTH_SOCK',
  // Names a token cache file, never the token.
  'NPM_TOKEN_USERCONFIG',
  'NODE_EXTRA_CA_CERTS',
];

/** Names matched exactly rather than by pattern, because `AUTH` alone would catch `GIT_AUTHOR_NAME`. */
const CREDENTIAL_EXACT: ReadonlySet<string> = new Set([
  'AUTH',
  'AUTHORIZATION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AZURE_CLIENT_SECRET',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'DATABASE_URL',
  'REDIS_URL',
  'NPM_TOKEN',
]);

/** Server configuration a child may legitimately need. */
function isServerConfig(name: string): boolean {
  return name.startsWith('PRO_FETCH_');
}

function looksLikeCredential(name: string): boolean {
  const upper = name.toUpperCase();
  if (CREDENTIAL_EXEMPT.includes(upper)) return false;
  if (CREDENTIAL_EXACT.has(upper)) return true;
  // Word-boundary match, plus the vendor prefixes that carry their secrets in the same style:
  // `ANTHROPIC_*`, `OPENAI_*`, `GITHUB_*`, `AWS_*`, `AZURE_*`, `GOOGLE_*`.
  if (/^(?:AWS|AZURE|GOOGLE|GCP|OPENAI|ANTHROPIC|GITHUB|GH|NPM|DOCKER)_/.test(upper)) return true;
  return CREDENTIAL_NAME.test(upper);
}

export interface ChildEnvOptions {
  /** The server's environment. Defaults to `process.env`; injectable so the rules can be tested. */
  source?: NodeJS.ProcessEnv;
  /** Variables the call site names explicitly. These are the caller's decision and are honoured. */
  allow?: readonly string[];
}

/**
 * Build the environment for a child process.
 *
 * `allow` names a variable to forward, and it is honoured even when the name looks like a credential:
 * sometimes the approved command genuinely needs one, and the whole point is that the request is then
 * visible in the source. It is never honoured for `NODE_OPTIONS`, because that is not configuration - it
 * is code the child will execute before its own entry point runs.
 */
export function childEnv(options: ChildEnvOptions = {}): { env: Record<string, string>; dropped: string[] } {
  const source = options.source ?? process.env;
  const env: Record<string, string> = {};
  const dropped: string[] = [];

  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const upper = name.toUpperCase();

    // Executable injection: `NODE_OPTIONS=--require /tmp/x.js` runs code in the child regardless of what
    // the child is. Never forwarded, not even by an explicit `allow`.
    if (upper === 'NODE_OPTIONS') {
      dropped.push(name);
      continue;
    }

    if (options.allow?.includes(name) || options.allow?.includes(upper)) {
      env[name] = value;
      continue;
    }

    if (!REQUIRED.includes(name) && !isServerConfig(name)) {
      dropped.push(name);
      continue;
    }

    if (looksLikeCredential(name)) {
      dropped.push(name);
      continue;
    }

    env[name] = value;
  }

  return { env, dropped: dropped.sort() };
}

/** A description of what a child would and would not see, for a diagnostics tool. */
export function describeChildEnv(options: ChildEnvOptions = {}): {
  forwarded: string[];
  dropped: string[];
  dropped_as_credential: string[];
  dropped_as_unknown: string[];
} {
  const source = options.source ?? process.env;
  const forwarded: string[] = [];
  const dropped: string[] = [];
  const droppedAsCredential: string[] = [];
  const droppedAsUnknown: string[] = [];

  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (options.allow?.includes(name)) {
      forwarded.push(name);
      continue;
    }
    // The two reasons are computed independently rather than in an `else if` chain. Chained, a variable
    // that is both unknown and credential-shaped was reported only as "unknown", so
    // `dropped_as_credential` came back empty for a source full of secrets - the environment was still
    // filtered correctly, but the diagnostic that exists to explain the filtering was the thing that
    // was wrong.
    const known = REQUIRED.includes(name) || isServerConfig(name);
    const secret = looksLikeCredential(name) || name.toUpperCase() === 'NODE_OPTIONS';
    if (secret) {
      droppedAsCredential.push(name);
      dropped.push(name);
    } else if (!known) {
      droppedAsUnknown.push(name);
      dropped.push(name);
    } else {
      forwarded.push(name);
    }
  }

  return {
    forwarded: forwarded.sort(),
    dropped: dropped.sort(),
    dropped_as_credential: [...new Set(droppedAsCredential)].sort(),
    dropped_as_unknown: droppedAsUnknown.sort(),
  };
}

/** Convenience wrapper for callers that only need the environment. */
export function childEnvOnly(
  overrides: Record<string, string | undefined> = {},
  allow: readonly string[] = [],
): Record<string, string> {
  const built = childEnv({ allow });
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete built.env[name];
    else built.env[name] = value;
  }
  return built.env;
}
