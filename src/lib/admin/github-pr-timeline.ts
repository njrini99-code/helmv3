import 'server-only';
import {
  failed,
  ok,
  unconfigured,
  type AdminFetchResult,
} from '@/lib/admin/fetch-result';
import { githubIssuesHeaders, githubIssuesRepo, githubIssuesToken } from '@/lib/admin/github-issues-config';
import {
  inferWorkAreaFromTitle,
  parsePullRequestBody,
  type ParsedPrBody,
  type WorkArea,
} from '@/lib/admin/pr-body-parser';

export type PrLifecycleState = 'open' | 'merged' | 'closed';

export interface WorkLogEntry {
  number: number;
  html_url: string;
  title: string;
  state: PrLifecycleState;
  authorLogin: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  parsed: ParsedPrBody;
}

export interface WorkLogSnapshot {
  entries: WorkLogEntry[];
  repoLabel: string;
  authorLogins: string[];
  counts: {
    total: number;
    merged: number;
    open: number;
    byArea: Record<WorkArea, number>;
  };
}

function prAuthorLogins(): string[] {
  const raw = process.env.GITHUB_PR_AUTHOR_LOGINS?.trim();
  if (raw) {
    return raw.split(',').map((login) => login.trim()).filter(Boolean);
  }
  const single = process.env.GITHUB_PR_AUTHOR_LOGIN?.trim();
  if (single) return [single];
  return [];
}

function prFetchLimit(): number {
  const raw = Number.parseInt(process.env.GITHUB_PR_FETCH_LIMIT ?? '60', 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 100) : 60;
}

interface RawPullRequest {
  number: number;
  html_url: string;
  title: string;
  state: 'open' | 'closed';
  body: string | null;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  user: { login: string } | null;
  draft?: boolean;
}

function lifecycleState(pr: RawPullRequest): PrLifecycleState {
  if (pr.merged_at) return 'merged';
  if (pr.state === 'open') return 'open';
  return 'closed';
}

function matchesAuthor(pr: RawPullRequest, authors: string[]): boolean {
  if (authors.length === 0) return true;
  const login = pr.user?.login?.toLowerCase();
  if (!login) return false;
  return authors.some((author) => author.toLowerCase() === login);
}

/**
 * Shape of an item returned by GitHub's Search Issues API
 * (`/search/issues?q=...+is:pr`). Unlike the `/repos/{owner}/{repo}/pulls`
 * list endpoint, this endpoint nests merge state under `pull_request`
 * instead of exposing a top-level `merged_at` — normalize to
 * `RawPullRequest` immediately after fetch so `lifecycleState()` and every
 * downstream consumer only ever deal with one shape.
 */
interface SearchIssueItem {
  number: number;
  html_url: string;
  title: string;
  state: 'open' | 'closed';
  body: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  user: { login: string } | null;
  draft?: boolean;
  pull_request?: { merged_at: string | null } | null;
}

function normalizeSearchIssueItem(item: SearchIssueItem): RawPullRequest {
  return {
    number: item.number,
    html_url: item.html_url,
    title: item.title,
    state: item.state,
    body: item.body,
    created_at: item.created_at,
    updated_at: item.updated_at,
    merged_at: item.pull_request?.merged_at ?? null,
    closed_at: item.closed_at,
    user: item.user,
    draft: item.draft,
  };
}

async function fetchPullRequests(
  token: string,
  owner: string,
  repo: string,
  authors: string[],
  limit: number,
): Promise<RawPullRequest[]> {
  const authorQuery =
    authors.length > 0
      ? `+${authors.map((login) => `author:${login}`).join('+')}`
      : '';
  const searchParams = new URLSearchParams({
    q: `repo:${owner}/${repo} is:pr${authorQuery}`,
    sort: 'updated',
    order: 'desc',
    per_page: String(Math.min(limit, 100)),
  });

  const searchRes = await fetch(`https://api.github.com/search/issues?${searchParams}`, {
    headers: githubIssuesHeaders(token),
    next: { revalidate: 120 },
  });

  if (searchRes.ok) {
    const body = (await searchRes.json()) as { items?: SearchIssueItem[] };
    return (body.items ?? []).map(normalizeSearchIssueItem);
  }

  // Fallback when search is unavailable — list pulls and filter locally.
  const listParams = new URLSearchParams({
    state: 'all',
    sort: 'updated',
    direction: 'desc',
    per_page: '100',
  });
  const listRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?${listParams}`, {
    headers: githubIssuesHeaders(token),
    next: { revalidate: 120 },
  });
  if (!listRes.ok) {
    const text = await listRes.text();
    throw new Error(`GitHub pull request fetch failed (${listRes.status}): ${text.slice(0, 300)}`);
  }
  const pulls = (await listRes.json()) as RawPullRequest[];
  return pulls.filter((pr) => matchesAuthor(pr, authors)).slice(0, limit);
}

function countByArea(entries: WorkLogEntry[]): Record<WorkArea, number> {
  const counts: Record<WorkArea, number> = {
    golf: 0,
    baseball: 0,
    coachhelm: 0,
    bridge: 0,
    platform: 0,
    mobile: 0,
    shared: 0,
    unknown: 0,
  };
  for (const entry of entries) counts[entry.parsed.area] += 1;
  return counts;
}

export async function fetchWorkLog(): Promise<AdminFetchResult<WorkLogSnapshot>> {
  const token = githubIssuesToken();
  if (!token) return unconfigured('GitHub API');

  const { owner, repo, label } = githubIssuesRepo();
  const authors = prAuthorLogins();
  const limit = prFetchLimit();

  try {
    const pulls = await fetchPullRequests(token, owner, repo, authors, limit);
    const entries: WorkLogEntry[] = pulls.map((pr) => {
      const base = parsePullRequestBody(pr.body, pr.title);
      const parsed =
        base.area === 'unknown'
          ? { ...base, area: inferWorkAreaFromTitle(pr.title) }
          : base;
      return {
        number: pr.number,
        html_url: pr.html_url,
        title: pr.title,
        state: lifecycleState(pr),
        authorLogin: pr.user?.login ?? 'unknown',
        created_at: pr.created_at,
        updated_at: pr.updated_at,
        merged_at: pr.merged_at,
        closed_at: pr.closed_at,
        parsed,
      };
    });

    entries.sort((a, b) => {
      const aTime = Date.parse(a.merged_at ?? a.closed_at ?? a.created_at);
      const bTime = Date.parse(b.merged_at ?? b.closed_at ?? b.created_at);
      return bTime - aTime;
    });

    return ok({
      entries,
      repoLabel: label,
      authorLogins: authors,
      counts: {
        total: entries.length,
        merged: entries.filter((entry) => entry.state === 'merged').length,
        open: entries.filter((entry) => entry.state === 'open').length,
        byArea: countByArea(entries),
      },
    });
  } catch (err) {
    return failed(err instanceof Error ? err.message : String(err));
  }
}
