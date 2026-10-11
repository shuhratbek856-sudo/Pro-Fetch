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
export default defineTool({
  name: 'pro_repo_audit',
  description:
    'Full GitHub repository audit in one call: metadata, README, directory structure, languages, ' +
    'license, contributors, commit activity, open issues and pull requests, releases, topics, ' +
    'CI status and security advisories. Use this instead of calling a dozen GitHub tools by hand.',
  category: 'github',
  inputSchema: {
    type: 'object',
    properties: {
      detail: { type: 'string', enum: ['summary', 'full'], description: 'Natija hajmi: summary yoki full' },
      repository: { type: 'string', description: 'owner/reko nomi (masalan: facebook/react)' },
      include_ci: { type: 'boolean', description: 'CI run va workflow holatini ham tekshirish' },
      include_security: { type: 'boolean', description: 'Dependency zaifliklari va repolardagi secret skani' },
    },
    required: ['repository'],
  },
  async handler(input) {
    const p = view(input);
    const repository = strOrEmpty(p, 'repository').trim();
    if (!repository) return fail('repository talab qilinadi (owner/reko).');
    const [owner, repo] = repository.includes('/') ? repository.split('/') : ['', repository];
    if (!owner || !repo) return fail('repository "owner/reko" shaklida bo‘lishi kerak.');
    const base = { owner, repo };

    const steps: Array<[string, string, Record<string, unknown>]> = [
      ['Repository info', 'pro_gh_repo_info', base],
      ['README', 'pro_gh_repo_readme', base],
      ['Structure summary', 'pro_gh_repo_structure_summary', { ...base, max_depth: 3 }],
      ['Languages', 'pro_gh_repo_languages', base],
      ['License', 'pro_gh_repo_license', base],
      ['Topics', 'pro_gh_repo_topics', base],
      ['Contributors', 'pro_gh_repo_contributors', { ...base, limit: 20 }],
      ['Commit activity', 'pro_gh_repo_commit_activity', base],
      ['Open issues', 'pro_gh_issues_list', { ...base, state: 'open', limit: 20 }],
      ['Open pull requests', 'pro_gh_prs_list', { ...base, state: 'open', limit: 20 }],
      ['Releases', 'pro_gh_releases_list', { ...base, limit: 10 }],
      ['Branches', 'pro_gh_branches_list', { ...base, limit: 20 }],
      ['Tags', 'pro_gh_tags_list', { ...base, limit: 20 }],
      ['Community activity', 'pro_gh_repo_stats', base],
      ['Fork network', 'pro_gh_repo_fork_network', base],
    ];

    if (p.include_ci === true) {
      steps.push(['Recent CI runs', 'pro_gh_actions_runs', base]);
    }
    if (p.include_security === true) {
      steps.push(
        ['Dependency advisories', 'pro_sec_ossv_query', { package: `${owner}/${repo}` }],
        ['Secret scan', 'pro_sec_secret_scan', { path: '.', limit: 20 }],
      );
    }

    const outcomes = await runParallel(steps);
    return result(renderBudgeted(`Repository audit: ${repository}`, outcomes, detailMode(p.detail)));
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
