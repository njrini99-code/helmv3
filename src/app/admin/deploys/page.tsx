import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import {
  fetchVercelDeployments,
  fetchVercelWebInsights,
  type VercelDeployState,
} from '@/lib/admin/vercel-api';
import { fetchSentryReleaseHealth } from '@/lib/admin/sentry-api';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelNoData, PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { Surface, StatTile, StatusPill, type FwStatusTone } from '@/components/fairway';

export const dynamic = 'force-dynamic';

const STATE_TONE: Record<VercelDeployState, FwStatusTone> = {
  READY: 'success',
  BUILDING: 'info',
  QUEUED: 'neutral',
  INITIALIZING: 'neutral',
  ERROR: 'danger',
  CANCELED: 'warning',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">{children}</h2>;
}

/** Deep-links each row to its Sentry issue stream, filtered to that
 *  release's commit sha. SENTRY_ORG is a non-secret org slug — safe to
 *  render into a server-component link, unlike the read token. */
function sentryReleaseHref(sha: string | null): string | null {
  const org = process.env.SENTRY_ORG;
  if (!org || !sha) return null;
  return `https://sentry.io/organizations/${org}/issues/?query=${encodeURIComponent(`release:${sha}`)}`;
}

function formatAge(createdAt: number): string {
  const minutes = Math.round((Date.now() - createdAt) / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * Currently-deployed build — Vercel system env, present on every deployment
 * with ZERO new secrets. Works even before VERCEL_API_TOKEN is provisioned.
 */
function CurrentBuildCard() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  const ref = process.env.VERCEL_GIT_COMMIT_REF;
  const message = process.env.VERCEL_GIT_COMMIT_MESSAGE;
  const author = process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME;
  const env = process.env.VERCEL_ENV ?? 'development';

  return (
    <section className="rounded-2xl bg-[var(--fw-color-nav-bg)] p-4 text-white">
      <p className="text-xs uppercase tracking-widest text-white/60">This running build</p>
      <p className="mt-1 font-fw-mono text-lg tabular-nums">
        {sha ? sha.slice(0, 7) : 'local'} · {ref ?? 'working tree'} · {env}
      </p>
      {message ? <p className="mt-1 truncate text-sm text-white/70">{message}</p> : null}
      {author ? <p className="text-xs text-white/50">by {author}</p> : null}
    </section>
  );
}

/**
 * PHONE-FORMAT RESPONSIVE (owner directive 2026-07-02): `overflow-x-auto`
 * scopes the horizontal scroll to the table itself (never the page), and the
 * first column stays `sticky` so the deploy's identity is never scrolled out
 * of view on a 375px viewport. Mirrors the cron-board table pattern in
 * `/admin/jobs`.
 */
async function DeploymentsTable() {
  const deploys = await fetchVercelDeployments(20);
  if (deploys.status === 'unconfigured') {
    return (
      <PanelNoData
        label="Deployments API not configured"
        description="Set VERCEL_API_TOKEN / VERCEL_PROJECT_ID / VERCEL_TEAM_ID (verify in the Vercel dashboard — team-scoped vars are invisible to vercel env pull)."
      />
    );
  }
  if (deploys.status === 'error' || !deploys.data) {
    return <PanelStale label="Deployments" error={deploys.error} />;
  }
  if (deploys.data.length === 0) {
    return (
      <PanelNoData
        label="No deployments yet"
        description="Deployments will appear here once Vercel reports them for this project."
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-widest text-warm-500">
            <th className="sticky left-0 z-10 bg-surface py-2 pr-3">Commit</th>
            <th className="px-3">Branch</th>
            <th className="px-3">State</th>
            <th className="px-3">Target</th>
            <th className="px-3">Age</th>
            <th className="px-3">Sentry</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-warm-200/60">
          {deploys.data.map((d) => {
            const sentryHref = sentryReleaseHref(d.commitSha);
            return (
              <tr key={d.uid}>
                <td className="sticky left-0 z-10 bg-surface py-2 pr-3">
                  <p className="font-fw-mono text-xs text-warm-900">
                    {d.commitSha ? d.commitSha.slice(0, 7) : d.uid.slice(0, 7)}
                  </p>
                  <p className="max-w-[260px] truncate text-xs text-warm-500">
                    {d.commitMessage ?? d.url}
                  </p>
                </td>
                <td className="px-3 font-fw-mono text-xs text-warm-600">{d.commitRef ?? '—'}</td>
                <td className="px-3">
                  <StatusPill tone={STATE_TONE[d.state] ?? 'neutral'} dot size="sm">
                    {d.state}
                  </StatusPill>
                </td>
                <td className="px-3 text-xs text-warm-600">{d.target ?? 'preview'}</td>
                <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">
                  {formatAge(d.createdAt)}
                </td>
                <td className="px-3 text-xs">
                  {sentryHref ? (
                    <a
                      href={sentryHref}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent-700 underline"
                    >
                      issues →
                    </a>
                  ) : (
                    <span className="text-warm-400">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** OQ3: conditional widget — neutral "not configured" until session
 *  tracking is confirmed sending sessions for helm-xs. */
async function ReleaseHealth() {
  const health = await fetchSentryReleaseHealth();
  if (health.status !== 'ok' || !health.data || health.data.crashFreeSessions === null) {
    return (
      <PanelNoData
        label="Release health not configured"
        description="Requires SENTRY_READ_TOKEN and confirmed session tracking (autoSessionTracking) for helm-xs."
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatTile
        label="Crash-free sessions"
        value={health.data.crashFreeSessions}
        format={{ style: 'percent', maximumFractionDigits: 2 }}
        mono
      />
      <StatTile
        label="Crash-free users"
        value={health.data.crashFreeUsers ?? undefined}
        starved={health.data.crashFreeUsers === null}
        format={{ style: 'percent', maximumFractionDigits: 2 }}
        mono
      />
    </div>
  );
}

async function WebVitals() {
  const insights = await fetchVercelWebInsights();
  if (insights.status !== 'ok' || !insights.data) {
    return (
      <PanelNoData
        label="Web insights unavailable"
        description="Same Vercel token trio as the deployments table."
      />
    );
  }
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatTile label="Visitors 24h" value={insights.data.visitors24h} mono />
      <StatTile label="Visitors 7d" value={insights.data.visitors7d} mono />
      <StatTile label="Visitors 30d" value={insights.data.visitors30d} mono />
    </div>
  );
}

export default async function DeploysPage() {
  await requireSuperAdmin();
  return (
    <main className="space-y-6 p-6">
      <AutoRefresh intervalMs={60_000} />
      <CurrentBuildCard />

      <Surface padding="sm">
        <SectionLabel>Deployments</SectionLabel>
        <div className="mt-3">
          <PanelBoundary title="Deployments">
            <DeploymentsTable />
          </PanelBoundary>
        </div>
      </Surface>

      <div className="grid gap-4 md:grid-cols-2">
        <Surface padding="sm">
          <SectionLabel>Release health</SectionLabel>
          <div className="mt-3">
            <PanelBoundary title="Release health">
              <ReleaseHealth />
            </PanelBoundary>
          </div>
        </Surface>
        <Surface padding="sm">
          <SectionLabel>Traffic</SectionLabel>
          <div className="mt-3">
            <PanelBoundary title="Traffic">
              <WebVitals />
            </PanelBoundary>
          </div>
        </Surface>
      </div>
    </main>
  );
}
