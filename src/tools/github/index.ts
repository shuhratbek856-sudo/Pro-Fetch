import repo_info from './repo_info.js';
import repo_readme from './repo_readme.js';
import repo_tree from './repo_tree.js';
import repo_file_read from './repo_file_read.js';
import repo_directory_read from './repo_directory_read.js';
import repo_full_clone from './repo_full_clone.js';
import repo_structure_summary from './repo_structure_summary.js';
import repo_search from './repo_search.js';
import code_search from './code_search.js';
import repo_topics from './repo_topics.js';
import repo_stats from './repo_stats.js';
import repo_docs_extract from './repo_docs_extract.js';
import repo_wiki_read from './repo_wiki_read.js';
import repo_license from './repo_license.js';
import repo_languages from './repo_languages.js';
import repo_compare from './repo_compare.js';
import repo_file_history from './repo_file_history.js';
import repo_file_blame from './repo_file_blame.js';
import repo_raw_file from './repo_raw_file.js';
import repo_submodules from './repo_submodules.js';
import repo_fork_network from './repo_fork_network.js';
import repo_dependents from './repo_dependents.js';
import repo_commit_activity from './repo_commit_activity.js';
import issues_list from './issues_list.js';
import issue_read from './issue_read.js';
import issue_comments from './issue_comments.js';
import issues_search from './issues_search.js';
import issue_timeline from './issue_timeline.js';
import prs_list from './prs_list.js';
import pr_read from './pr_read.js';
import pr_diff from './pr_diff.js';
import pr_files from './pr_files.js';
import pr_reviews from './pr_reviews.js';
import pr_review_comments from './pr_review_comments.js';
import pr_checks from './pr_checks.js';
import commits_list from './commits_list.js';
import commit_read from './commit_read.js';
import branches_list from './branches_list.js';
import tags_list from './tags_list.js';
import releases_list from './releases_list.js';
import release_diff from './release_diff.js';
import gist_read from './gist_read.js';
import org_repos from './org_repos.js';
import user_profile from './user_profile.js';
import actions_runs from './actions_runs.js';
import repo_contributors from './repo_contributors.js';
import release_read from './release_read.js';
import repo_audit from './repo_audit_tool.js';
import pr_review from './pr_review_tool.js';

export default [
  // Smart System composite
  pr_review,
  // Smart System composite
  repo_audit,
  repo_info,
  repo_readme,
  repo_tree,
  repo_file_read,
  repo_directory_read,
  repo_full_clone,
  repo_structure_summary,
  repo_search,
  code_search,
  repo_topics,
  repo_stats,
  repo_docs_extract,
  repo_wiki_read,
  repo_license,
  repo_languages,
  repo_compare,
  repo_file_history,
  repo_file_blame,
  repo_raw_file,
  repo_submodules,
  repo_fork_network,
  repo_dependents,
  repo_commit_activity,
  issues_list,
  issue_read,
  issue_comments,
  issues_search,
  issue_timeline,
  prs_list,
  pr_read,
  pr_diff,
  pr_files,
  pr_reviews,
  pr_review_comments,
  pr_checks,
  commits_list,
  commit_read,
  branches_list,
  tags_list,
  releases_list,
  release_diff,
  gist_read,
  org_repos,
  user_profile,
  actions_runs,
  repo_contributors,
  release_read,
];
