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

/**
 * Minutes elapsed since a Vercel deployment's `createdAt` (epoch ms). Single
 * source of truth for "how old" — shared by the Overview "Last deploy" KPI
 * (raw number, fed through StatTile's own formatter) and the Deploys table's
 * "Age" column (compact string via `formatDeployAge`) so the two surfaces
 * never drift on what "age" means.
 */
export function deployAgeMinutes(createdAt: number, now: number = Date.now()): number {
  return Math.round((now - createdAt) / 60_000);
}

/** Compact age string ("7m" / "3h" / "2d") for the deployments table. */
export function formatDeployAge(createdAt: number, now: number = Date.now()): string {
  const minutes = deployAgeMinutes(createdAt, now);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
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

export interface VercelWebInsights {
  visitors24h: number;
  visitors7d: number;
  visitors30d: number;
}

/** Port of the legacy fetchVercelAnalytics (admin-data.ts:1562) with the
 *  bridge fail-soft contract instead of bare null. */
export async function fetchVercelWebInsights(): Promise<AdminFetchResult<VercelWebInsights>> {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return unconfigured('Vercel API');

  try {
    const teamId = process.env.VERCEL_TEAM_ID;
    const baseUrl = 'https://api.vercel.com/v1/web/insights/stats';
    const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();
    const now = new Date().toISOString();

    // `res.ok === false` (401/403/5xx) is a fetch FAILURE, not "zero
    // visitors" — collapsing the two used to make an expired/misscoped
    // token look identical to genuinely quiet traffic. Surface the first
    // non-ok status via `failed()` (fail-soft: caller renders a stale/
    // config-warning panel) instead of silently returning 0.
    let httpFailureStatus: number | null = null;
    const fetchPeriod = async (from: string): Promise<number> => {
      const params = new URLSearchParams({ projectId, from, to: now });
      if (teamId) params.set('teamId', teamId);
      const res = await fetch(`${baseUrl}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 900 },
      });
      if (!res.ok) {
        httpFailureStatus ??= res.status;
        return 0;
      }
      const data = await res.json();
      return data?.data?.visitors ?? data?.visitors ?? 0;
    };

    const [v24h, v7d, v30d] = await Promise.all([
      fetchPeriod(daysAgo(1)),
      fetchPeriod(daysAgo(7)),
      fetchPeriod(daysAgo(30)),
    ]);
    if (httpFailureStatus !== null) {
      return failed(`Vercel web insights fetch failed: ${httpFailureStatus}`);
    }
    return ok({ visitors24h: v24h, visitors7d: v7d, visitors30d: v30d });
  } catch (err) {
    return failed(`Vercel web insights threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}
