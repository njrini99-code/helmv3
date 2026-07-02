import 'server-only';
import {
  type AdminFetchResult,
  unconfigured,
  failed,
  ok,
} from '@/lib/admin/fetch-result';

/**
 * Helm Bridge — server-only Vercel deployments client. Reuses the exact
 * token trio admin-data.ts:1563 already consumes for web analytics; fails
 * soft to 'unconfigured' (never throws) when absent. 1-day Vercel runtime
 * log retention means Vercel is ONLY "what deployed when" — the durable
 * error store is Sentry + admin_events.
 */

const REVALIDATE_SECONDS = 60;

export type VercelDeployState =
  | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED' | 'QUEUED' | 'INITIALIZING';

export interface VercelDeployment {
  uid: string;
  state: VercelDeployState;
  createdAt: number;
  ready: number | null;
  target: string | null;
  url: string;
  commitSha: string | null;
  commitMessage: string | null;
  commitRef: string | null;
  commitAuthor: string | null;
}

interface RawDeployment {
  uid: string; state: VercelDeployState; createdAt: number; ready?: number | null;
  target?: string | null; url: string;
  meta?: {
    githubCommitSha?: string; githubCommitMessage?: string;
    githubCommitRef?: string; githubCommitAuthorName?: string;
  };
}

export async function fetchVercelDeployments(
  limit = 20,
): Promise<AdminFetchResult<VercelDeployment[]>> {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return unconfigured('Vercel API');

  try {
    const params = new URLSearchParams({ projectId, limit: String(limit) });
    const teamId = process.env.VERCEL_TEAM_ID;
    if (teamId) params.set('teamId', teamId);

    const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return failed(`Vercel deployments fetch failed: ${res.status}`);

    const body = (await res.json()) as { deployments?: RawDeployment[] };
    const deployments = (body.deployments ?? []).map((d): VercelDeployment => ({
      uid: d.uid,
      state: d.state,
      createdAt: d.createdAt,
      ready: d.ready ?? null,
      target: d.target ?? null,
      url: d.url,
      commitSha: d.meta?.githubCommitSha ?? null,
      commitMessage: d.meta?.githubCommitMessage ?? null,
      commitRef: d.meta?.githubCommitRef ?? null,
      commitAuthor: d.meta?.githubCommitAuthorName ?? null,
    }));
    return ok(deployments);
  } catch (err) {
    return failed(`Vercel deployments fetch threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}
