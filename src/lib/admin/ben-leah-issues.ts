import 'server-only';
import {
  failed,
  ok,
  unconfigured,
  type AdminFetchResult,
} from '@/lib/admin/fetch-result';
import {
  countBenLeahByStatus,
  withBenLeahTrackStatus,
  latestProductionReadyAt,
  type BenLeahGitHubIssue,
  type BenLeahTrackedIssue,
  type BenLeahTrackStatus,
} from '@/lib/admin/ben-leah-issue-tracker';
import { githubIssuesHeaders, githubIssuesRepo, githubIssuesToken } from '@/lib/admin/github-issues-config';
import { ensureBenLeahGitHubLabels } from '@/lib/admin/github-issues-workflow';
import { fetchVercelDeployments } from '@/lib/admin/vercel-api';

export type {
  BenLeahGitHubIssue,
  BenLeahTrackedIssue,
  BenLeahTrackStatus,
} from '@/lib/admin/ben-leah-issue-tracker';
export {
  deriveBenLeahTrackStatus,
  latestProductionReadyAt,
} from '@/lib/admin/ben-leah-issue-tracker';

export interface BenLeahIssueBoardSnapshot {
  issues: BenLeahTrackedIssue[];
  repoLabel: string;
  repoIssuesUrl: string;
  productionReadyAt: number | null;
  productionCommitSha: string | null;
  counts: Record<BenLeahTrackStatus, number>;
}

function issueToken(): string | null {
  return githubIssuesToken();
}

function issueRepo(): { owner: string; repo: string; label: string } {
  return githubIssuesRepo();
}

function githubHeaders(token: string): HeadersInit {
  return githubIssuesHeaders(token);
}

interface RawGitHubIssue {
  number: number;
  html_url: string;
  title: string;
  state: 'open' | 'closed';
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  labels: Array<{ name: string }>;
  pull_request?: unknown;
}

function parseLabelValue(labels: string[], prefix: string): string | null {
  const hit = labels.find((label) => label.startsWith(`${prefix}:`));
  return hit ? hit.slice(prefix.length + 1) : null;
}

function displayTitle(raw: string): string {
  return raw.replace(/^\[Ben \+ Leah\]\s*(Bug|Change|Addition):\s*/i, '').trim() || raw;
}

function normalizeIssue(raw: RawGitHubIssue): BenLeahGitHubIssue {
  const labels = raw.labels.map((label) => label.name);
  const kindRaw = parseLabelValue(labels, 'kind');
  const priorityRaw = parseLabelValue(labels, 'priority');
  return {
    number: raw.number,
    html_url: raw.html_url,
    title: raw.title,
    displayTitle: displayTitle(raw.title),
    state: raw.state,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    closed_at: raw.closed_at,
    labels,
    kind: kindRaw === 'bug' || kindRaw === 'change' || kindRaw === 'addition' ? kindRaw : null,
    priority: priorityRaw === 'high' || priorityRaw === 'urgent' ? priorityRaw : priorityRaw === 'normal' ? 'normal' : null,
    category: parseLabelValue(labels, 'category'),
  };
}

async function fetchRawIssues(token: string, owner: string, repo: string): Promise<RawGitHubIssue[]> {
  const params = new URLSearchParams({
    labels: 'ben-leah',
    state: 'all',
    sort: 'updated',
    direction: 'desc',
    per_page: '50',
  });

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues?${params}`, {
    headers: githubHeaders(token),
    next: { revalidate: 60 },
  });

  if (res.ok) {
    const body = (await res.json()) as RawGitHubIssue[];
    return body.filter((issue) => !issue.pull_request);
  }

  if (res.status !== 404 && res.status !== 422) {
    const text = await res.text();
    throw new Error(`GitHub issues list failed (${res.status}): ${text.slice(0, 300)}`);
  }

  // Label may not exist yet — fall back to title prefix (label-less retry path).
  const searchParams = new URLSearchParams({
    q: `repo:${owner}/${repo} is:issue "[Ben + Leah]" in:title`,
    sort: 'updated',
    order: 'desc',
    per_page: '50',
  });
  const searchRes = await fetch(`https://api.github.com/search/issues?${searchParams}`, {
    headers: githubHeaders(token),
    next: { revalidate: 60 },
  });
  if (!searchRes.ok) {
    const text = await searchRes.text();
    throw new Error(`GitHub issue search failed (${searchRes.status}): ${text.slice(0, 300)}`);
  }
  const searchBody = (await searchRes.json()) as { items?: RawGitHubIssue[] };
  return (searchBody.items ?? []).filter((issue) => !issue.pull_request);
}

export async function fetchBenLeahIssueBoard(): Promise<AdminFetchResult<BenLeahIssueBoardSnapshot>> {
  const token = issueToken();
  if (!token) return unconfigured('GitHub issues API');

  const { owner, repo, label } = issueRepo();

  try {
    await ensureBenLeahGitHubLabels();

    const [rawIssues, deploys] = await Promise.all([
      fetchRawIssues(token, owner, repo),
      fetchVercelDeployments(30),
    ]);

    const production =
      deploys.status === 'ok' && deploys.data
        ? latestProductionReadyAt(deploys.data)
        : { readyAt: null, commitSha: null };

    const normalized = rawIssues.map(normalizeIssue);
    const tracked = withBenLeahTrackStatus(normalized, production.readyAt);

    return ok({
      issues: tracked,
      repoLabel: label,
      repoIssuesUrl: `https://github.com/${owner}/${repo}/issues?q=label%3Aben-leah`,
      productionReadyAt: production.readyAt,
      productionCommitSha: production.commitSha,
      counts: countBenLeahByStatus(tracked),
    });
  } catch (err) {
    return failed(err instanceof Error ? err.message : String(err));
  }
}
