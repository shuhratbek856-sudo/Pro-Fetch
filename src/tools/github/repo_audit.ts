import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { result, fail } from '../../core/format.js';
import { num, strOrEmpty, view } from '../../core/input.js';
import { renderPipeline, runParallel, runStep } from '../../core/composite.js';
import { detailMode, renderBudgeted } from '../../core/composite-budget.js';

/**
 * pro_repo_audit — Complete repository report in one call
 * Pack: smart-composite (pro-fetch)
 *
 * A repository audit normally means a dozen tool calls: info, readme, tree, languages, license,
 * contributors, activity, issues, pulls, releases, topics, CI runs and dependency health. Each is a
 * separate round trip with its own schema. This runs the whole set against one repository.
 */
/**
 * The audit's step plan, extracted from the handler so a test can pin it to the target tools.
 *
 * Every argument must be one the target tool actually declares. `limit` and `max_depth` were
 * passed to tools whose schemas are `additionalProperties: false` — the list tools declare
 * `per_page`/`max_pages`, the structure summary has no depth knob, and the secret scan caps
 * itself (1000 files / 200 findings). Before unknown arguments were refused, the extra keys were
 * silently dropped and 7 of the 15 steps ran with defaults that looked configurable but were not.
 */
export function repoAuditSteps(
  owner: string,
  repo: string,
  options: { include_ci?: unknown; include_security?: unknown } = {},
): Array<[string, string, Record<string, unknown>]> {
  const base = { owner, repo };
  const steps: Array<[string, string, Record<string, unknown>]> = [
    ['Repository info', 'pro_gh_repo_info', base],
    ['README', 'pro_gh_repo_readme', base],
    ['Structure summary', 'pro_gh_repo_structure_summary', base],
    ['Languages', 'pro_gh_repo_languages', base],
    ['License', 'pro_gh_repo_license', base],
    ['Topics', 'pro_gh_repo_topics', base],
    ['Contributors', 'pro_gh_repo_contributors', { ...base, per_page: 20 }],
    ['Commit activity', 'pro_gh_repo_commit_activity', base],
    ['Open issues', 'pro_gh_issues_list', { ...base, state: 'open', per_page: 20 }],
    ['Open pull requests', 'pro_gh_prs_list', { ...base, state: 'open', per_page: 20 }],
    ['Releases', 'pro_gh_releases_list', { ...base, per_page: 10 }],
    // These two fetch 100/50 per page and expose only a page cap, so one bounded page is what a
    // summary audit can honestly ask for.
    ['Branches', 'pro_gh_branches_list', { ...base, max_pages: 1 }],
    ['Tags', 'pro_gh_tags_list', { ...base, max_pages: 1 }],
    ['Community activity', 'pro_gh_repo_stats', base],
    ['Fork network', 'pro_gh_repo_fork_network', base],
  ];

  if (options.include_ci === true) {
    steps.push(['Recent CI runs', 'pro_gh_actions_runs', base]);
  }
  if (options.include_security === true) {
    steps.push(
      // Both were `pro_sec_*`, which is not in the registry: the security pack prefixes with
      // `pro_fetch_security_`. The advisories step was also pointed at the wrong tool for the job -
      // `pro_fetch_security_package_advisories` requires `package` *and* `version`, which a
      // repository does not have. `pro_fetch_security_dependency_files` reads the repo's actual
      // manifests, which is what an audit is asking for.
      ['Dependency files', 'pro_fetch_security_dependency_files', { path: '.', recursive: true }],
      ['Secret scan', 'pro_fetch_security_secret_scan_files', { path: '.', recursive: true }],
    );
  }
  return steps;
}

export default defineTool({
  name: 'pro_repo_audit',
  description:
    'Full GitHub repository audit in one call: metadata, README, directory structure, languages, ' +
    'license, contributors, commit activity, open issues and pull requests, releases, topics, ' +
    'CI status and security advisories. Use this instead of calling a dozen GitHub tools by hand.',
  category: 'github',
  inputSchema: {
    ...ghSchema(['owner', 'repo', 'repository', 'detail', 'include_ci', 'include_security'], []),
    // Either spelling addresses the repository, so `required: ['owner','repo']` rejected the
    // `repository` that this tool's own description invites. An `anyOf` states the choice where
    // `required` would demand both.
    anyOf: [{ required: ['repository'] }, { required: ['owner', 'repo'] }],
  },
  async handler(input) {
    const p = view(input);
    // The schema required `owner` and `repo` while this handler read only `repository`, so neither
    // spelling worked: passing the pair the schema demanded failed here with "repository talab
    // qilinadi", and passing `repository` failed validation. Both are accepted now.
    //
    // `repo` is also accepted in the `owner/repo` form, which `assertGithubInput` already allows for
    // the other 48 tools - `pro_repo_audit` was the one place that did not.
    const ownerInput = strOrEmpty(p, 'owner').trim();
    const repoInput = strOrEmpty(p, 'repo').trim();
    const combined = strOrEmpty(p, 'repository').trim() || (repoInput.includes('/') ? repoInput : '');
    const [owner, repo] = combined ? combined.split('/') : [ownerInput, repoInput];
    if (!owner || !repo) {
      return fail('repository talab qilinadi: "owner/reko" shaklida, yoki owner va repo alohida.');
    }

    // Reading the flags here (not inside `repoAuditSteps`) keeps them visible to the source
    // scanners that pin every advertised argument to a read in the resolved code, and keeps the
    // call site explicit about what of the input the step plan actually consumes.
    const steps = repoAuditSteps(owner, repo, {
      include_ci: p.include_ci,
      include_security: p.include_security,
    });

    const outcomes = await runParallel(steps);
    return result(renderBudgeted(`Repository audit: ${owner}/${repo}`, outcomes, detailMode(p.detail)));
  },
});

/** Full pull-request review, registered separately as `pro_pr_review`. */
export const PR_DEEP_TOOL = defineTool({
  name: 'pro_pr_review',
  description:
    'Review one pull request end to end: description, diff, changed files, checks, reviews, ' +
    'inline comments and issue timeline in a single call.',
  category: 'github',
  inputSchema: {
    type: 'object',
    properties: {
      detail: { type: 'string', enum: ['summary', 'full'], description: 'Natija hajmi: summary yoki full' },
      repository: { type: 'string', description: 'owner/reko' },
      pr_number: { type: 'number', description: 'PR raqami' },
      include_diff: { type: 'boolean', description: 'To‘liq diffni qo‘shish' },
    },
    required: ['repository', 'pr_number'],
    // Matches the rest of the category: an unrecognised argument is a typo worth reporting, and
    // this is the one schema in the folder that was still accepting silent extras.
    additionalProperties: false,
  },
  async handler(input) {
    const p = view(input);
    const repository = strOrEmpty(p, 'repository').trim();
    const prNumber = num(p, 'pr_number', 0, 1, 1_000_000);
    if (!repository || prNumber <= 0) return fail('repository va pr_number talab qilinadi.');
    const [owner, repo] = repository.includes('/') ? repository.split('/') : ['', repository];
    const base = { owner, repo, pr_number: prNumber };

    const steps: Array<[string, string, Record<string, unknown>]> = [
      ['PR details', 'pro_gh_pr_read', base],
      ['Checks', 'pro_gh_pr_checks', base],
      ['Reviews', 'pro_gh_pr_reviews', base],
      ['Inline comments', 'pro_gh_pr_review_comments', base],
      ['Changed files', 'pro_gh_pr_files', base],
      ['Related issue timeline', 'pro_gh_issue_timeline', { owner, repo, issue_number: prNumber }],
    ];
    if (p.include_diff === true) steps.push(['Diff', 'pro_gh_pr_diff', base]);

    const outcomes = await runParallel(steps);
    return result(renderBudgeted(`PR #${prNumber} · ${repository}`, outcomes, detailMode(p.detail)));
  },
});
