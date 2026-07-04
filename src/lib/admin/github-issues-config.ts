import 'server-only';

/** Shared GitHub Issues API config — no fetch, safe to import from create + tracker paths. */

export function githubIssuesToken(): string | null {
  return process.env.GITHUB_ISSUES_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || null;
}

export function githubIssuesRepo(): { owner: string; repo: string; label: string } {
  const raw =
    process.env.GITHUB_ISSUES_REPO?.trim() ||
    process.env.GITHUB_REPOSITORY?.trim() ||
    'njrini99-code/helmv3';
  const [owner, repo] = raw.split('/');
  if (!owner || !repo) return { owner: 'njrini99-code', repo: 'helmv3', label: raw };
  return { owner, repo, label: `${owner}/${repo}` };
}

export function githubIssuesHeaders(token: string): HeadersInit {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
  };
}
