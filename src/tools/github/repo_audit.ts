import { ghSchema } from './_schema.js';
import { defineTool } from '../../core/tool.js';
import { fail } from '../../core/format.js';
import { bool, num, strOrEmpty, view } from '../../core/input.js';
import { runParallel } from '../../core/composite.js';
import { budgetedResult, detailMode } from '../../core/composite-budget.js';

/**
 * pro_repo_audit — Complete repository report in one call
 * Pack: smart-composite (pro-fetch)
 *
 * A repository audit normally means a dozen tool calls: info, readme, tree, languages, license,
 * contributors, activity, issues, pulls, releases, topics, CI runs and dependency health. Each is a
 * separate round trip with its own schema. This runs the whole set against one repository.
 */
export default defineTool({
  name: 'pro_repo_audit',
  description:
    'Full GitHub repository audit in one call: metadata, README, directory structure, languages, ' +
    'license, contributors, commit activity, open issues and pull requests, releases, topics and ' +
    'optionally CI status. Use this instead of calling a dozen GitHub tools by hand.',
  category: 'github',
  inputSchema: {
    ...ghSchema(['owner', 'repo', 'repository', 'detail', 'include_ci'], []),
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
    // `combined.split('/')` on `owner/a/b` silently produced owner/`a` and dropped `b`; take the first
    // segment as owner and the remainder as repo so a malformed specifier cannot point at a different
    // repository than the caller asked for.
    let owner = ownerInput;
    let repo = repoInput;
    if (combined) {
      const slash = combined.indexOf('/');
      owner = slash === -1 ? '' : combined.slice(0, slash);
      repo = slash === -1 ? '' : combined.slice(slash + 1);
    }
    if (!owner || !repo || repo.includes('/')) {
      return fail('repository talab qilinadi: "owner/reko" shaklida, yoki owner va repo alohida.');
    }
    const base = { owner, repo };

    // Argument names must match each target's own schema. These tools declare `per_page` (or nothing),
    // not `limit`/`max_depth`, and run with `additionalProperties: false`, so an unknown key is rejected
    // by `assertNoUnknownArguments` before the handler runs — measured at 8/15 steps failing every call.
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
      ['Branches', 'pro_gh_branches_list', base],
      ['Tags', 'pro_gh_tags_list', base],
      ['Community activity', 'pro_gh_repo_stats', base],
      ['Fork network', 'pro_gh_repo_fork_network', base],
    ];

    if (bool(p, 'include_ci')) {
      steps.push(['Recent CI runs', 'pro_gh_actions_runs', base]);
    }

    const outcomes = await runParallel(steps);
    return budgetedResult(`Repository audit: ${owner}/${repo}`, outcomes, detailMode(p.detail));
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
    const slash = repository.indexOf('/');
    const owner = slash === -1 ? '' : repository.slice(0, slash);
    const repo = slash === -1 ? '' : repository.slice(slash + 1);
    if (!owner || !repo || repo.includes('/')) {
      return fail('repository "owner/reko" ko‘rinishida bo‘lishi kerak.');
    }
    const base = { owner, repo, pr_number: prNumber };

    const steps: Array<[string, string, Record<string, unknown>]> = [
      ['PR details', 'pro_gh_pr_read', base],
      ['Checks', 'pro_gh_pr_checks', base],
      ['Reviews', 'pro_gh_pr_reviews', base],
      ['Inline comments', 'pro_gh_pr_review_comments', base],
      ['Changed files', 'pro_gh_pr_files', base],
      ['Related issue timeline', 'pro_gh_issue_timeline', { owner, repo, issue_number: prNumber }],
    ];
    if (bool(p, 'include_diff')) steps.push(['Diff', 'pro_gh_pr_diff', base]);

    const outcomes = await runParallel(steps);
    return budgetedResult(`PR #${prNumber} · ${repository}`, outcomes, detailMode(p.detail));
  },
});
