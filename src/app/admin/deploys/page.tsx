import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import {
  fetchVercelDeployments,
  fetchVercelWebInsights,
  formatDeployAge,
  type VercelDeployment,
  type VercelDeployState,
} from '@/lib/admin/vercel-api';
import { fetchSentryReleaseHealth } from '@/lib/admin/sentry-api';
import { githubIssuesRepo } from '@/lib/admin/github-issues-config';
import { PanelBoundary } from '../_components/PanelBoundary';
import { PanelNoData, PanelStale } from '../_components/PanelStates';
import { AutoRefresh } from '../_components/AutoRefresh';
import { Surface, Inset, StatTile, StatusPill, type FwStatusTone } from '@/components/fairway';
import { ShowMoreList } from './_components/ShowMoreList';
import { ReleaseLedger } from './_components/ReleaseLedger';

/** Phone card list (below `md`) shows this many deploys before "Show more" —
 *  keeps the default view inside the ~3-screen-height scroll budget (Mobile
 *  Doctrine rule 3) even though the desktop table renders all 20. */
const MOBILE_VISIBLE_DEPLOYS = 5;

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
  return (
    <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
      {children}
    </h2>
  );
}

/** Deep-links each row to its Sentry issue stream, filtered to that
 *  release's commit sha. SENTRY_ORG is a non-secret org slug — safe to
 *  render into a server-component link, unlike the read token. */
function sentryReleaseHref(sha: string | null): string | null {
  const org = process.env.SENTRY_ORG;
  if (!org || !sha) return null;
  return `https://sentry.io/organizations/${org}/issues/?query=${encodeURIComponent(`release:${sha}`)}`;
}

/** Deep-links a deployment's short sha to its GitHub commit. Reuses
 *  githubIssuesRepo() (already resolves owner/repo for the GitHub Issues
 *  links elsewhere) so this needs no new config or secret. */
function githubCommitHref(sha: string | null): string | null {
  if (!sha) return null;
  const { owner, repo } = githubIssuesRepo();
  return `https://github.com/${owner}/${repo}/commit/${sha}`;
}

/** The one place `VERCEL_GIT_COMMIT_SHA` is read for "what's live" — shared
 *  by CurrentBuildCard's identity line and DeploymentsTable/DeploymentCard's
 *  LIVE badge, so the two surfaces can never disagree on which row is the
 *  one actually serving traffic right now (bridge-tab-audit-p0p1, deploys
 *  P1: previously the operator had to eyeball-match them manually). */
function currentBuildSha(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? null;
}

/**
 * Currently-deployed build — Vercel system env, present on every deployment
 * with ZERO new secrets. Works even before VERCEL_API_TOKEN is provisioned.
 *
 * HONESTY FIX (bridge-tab-audit-p0p1, deploys P1): if Vercel Project Settings
 * > Environment Variables > "Automatically expose System Environment
 * Variables" is off, these vars are undefined at request time even in
 * PRODUCTION — and the old fallback text ("local · working tree ·
 * development") is byte-identical to what a real local dev server prints.
 * `sha` undefined now renders an explicit unconfigured state instead of
 * silently lying about being local.
 */
function CurrentBuildCard() {
  const sha = currentBuildSha();
  const ref = process.env.VERCEL_GIT_COMMIT_REF;
  const message = process.env.VERCEL_GIT_COMMIT_MESSAGE;
  const author = process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME;
  const env = process.env.VERCEL_ENV;

  if (!sha) {
    return (
      <section className="rounded-2xl bg-[var(--fw-color-nav-bg)] p-4 text-white">
        <p className="text-xs uppercase tracking-widest text-white/60">This running build</p>
        <p className="mt-1 text-sm text-white/70">
          Build identity not exposed{env ? ` (env: ${env})` : ''} — enable &quot;Automatically expose System
          Environment Variables&quot; in Vercel project settings, or this is a local dev server.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-[var(--fw-color-nav-bg)] p-4 text-white">
      <p className="text-xs uppercase tracking-widest text-white/60">This running build</p>
      {/* break-words: VERCEL_GIT_COMMIT_REF is an unbounded branch name with no
          spaces (only hyphens/slashes) — without this, a long branch forces
          the line past the card edge and, since nothing here scopes overflow,
          drags the whole page into a horizontal pan (doctrine rule 1/3). */}
      <p className="mt-1 break-words font-fw-mono text-lg tabular-nums">
        {sha.slice(0, 7)} · {ref ?? 'unknown ref'} · {env ?? 'unknown env'}
      </p>
      {message ? <p className="mt-1 truncate text-sm text-white/70">{message}</p> : null}
      {author ? <p className="text-xs text-white/50">by {author}</p> : null}
    </section>
  );
}

/**
 * Below `md`: doctrine-8 cards — identity (sha + branch) up top, state pill
 * trailing, the message/URL "tap-through" underneath, then target/age + a
 * Sentry deep-link. `md` and up: the original dense table, sticky first
 * column, `overflow-x-auto` scoped to the table only. A `min-w-[…] table
 * inside overflow-x-auto is the RIGHT call on md+ (a mouse/trackpad surface
 * with room to spare) but is explicitly NOT the doctrine treatment on a
 * phone-primary reading surface (rule 8) — hence the fork below rather than
 * relying on horizontal scroll for phones.
 */
async function DeploymentsTable() {
  const liveSha = currentBuildSha();
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

  const rows = deploys.data;
  const visibleRows = rows.slice(0, MOBILE_VISIBLE_DEPLOYS);
  const restRows = rows.slice(MOBILE_VISIBLE_DEPLOYS);

  return (
    <>
      {/* Phone cards (below md) */}
      <div className="md:hidden">
        <ShowMoreList
          listClassName="space-y-2"
          moreCount={restRows.length}
          itemLabel="deployment"
          initial={visibleRows.map((d) => (
            <DeploymentCard key={d.uid} d={d} liveSha={liveSha} />
          ))}
          more={restRows.map((d) => (
            <DeploymentCard key={d.uid} d={d} liveSha={liveSha} />
          ))}
        />
      </div>

      {/* Desktop table (md and up) */}
      <div className="hidden overflow-x-auto md:block">
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
            {rows.map((d) => {
              const sentryHref = sentryReleaseHref(d.commitSha);
              const commitSha = d.commitSha;
              const deployHref = d.url ? `https://${d.url}` : null;
              const isLive = liveSha !== null && commitSha !== null && commitSha === liveSha;
              return (
                <tr key={d.uid}>
                  <td className="sticky left-0 z-10 bg-surface py-2 pr-3">
                    <div className="flex items-center gap-1.5">
                      {commitSha ? (
                        <a
                          href={githubCommitHref(commitSha) ?? undefined}
                          target="_blank"
                          rel="noreferrer"
                          className="font-fw-mono text-xs text-accent-700 underline"
                        >
                          {commitSha.slice(0, 7)}
                        </a>
                      ) : (
                        <p className="font-fw-mono text-xs text-warm-900">{d.uid.slice(0, 7)}</p>
                      )}
                      {isLive ? (
                        <StatusPill tone="success" dot size="sm">
                          live
                        </StatusPill>
                      ) : null}
                    </div>
                    {deployHref ? (
                      <a
                        href={deployHref}
                        target="_blank"
                        rel="noreferrer"
                        className="block max-w-[260px] truncate text-xs text-warm-500 underline decoration-dotted hover:text-accent-700"
                      >
                        {d.commitMessage ?? d.url}
                      </a>
                    ) : (
                      <p className="max-w-[260px] truncate text-xs text-warm-500">
                        {d.commitMessage ?? d.url}
                      </p>
                    )}
                  </td>
                  <td className="px-3 font-fw-mono text-xs text-warm-600">{d.commitRef ?? '—'}</td>
                  <td className="px-3">
                    <StatusPill tone={STATE_TONE[d.state] ?? 'neutral'} dot size="sm">
                      {d.state}
                    </StatusPill>
                  </td>
                  <td className="px-3 text-xs text-warm-600">{d.target ?? 'preview'}</td>
                  <td className="px-3 font-fw-mono text-xs tabular-nums text-warm-600">
                    {formatDeployAge(d.createdAt)}
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
    </>
  );
}

/**
 * One phone-card row: identity (commit sha + branch, tabular/truncated —
 * both are unbounded-length width-forcers) + 2–3 key stats (state, target,
 * age) + tap-through (the message/URL line, and the Sentry deep-link).
 */
function DeploymentCard({ d, liveSha }: { d: VercelDeployment; liveSha: string | null }) {
  const sentryHref = sentryReleaseHref(d.commitSha);
  const commitSha = d.commitSha;
  const deployHref = d.url ? `https://${d.url}` : null;
  const isLive = liveSha !== null && commitSha !== null && commitSha === liveSha;

  return (
    <li>
      <Inset padding="sm" className="flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              {commitSha ? (
                <a
                  href={githubCommitHref(commitSha) ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate font-fw-mono text-sm font-medium text-accent-700 underline"
                >
                  {commitSha.slice(0, 7)}
                </a>
              ) : (
                <p className="min-w-0 truncate font-fw-mono text-sm text-warm-900">{d.uid.slice(0, 7)}</p>
              )}
              {isLive ? (
                <StatusPill tone="success" dot size="sm" className="shrink-0">
                  live
                </StatusPill>
              ) : null}
            </div>
            <p className="mt-0.5 truncate font-fw-mono text-xs text-warm-600">{d.commitRef ?? '—'}</p>
          </div>
          <StatusPill tone={STATE_TONE[d.state] ?? 'neutral'} dot size="sm" className="shrink-0">
            {d.state}
          </StatusPill>
        </div>

        {deployHref ? (
          <a
            href={deployHref}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-xs text-warm-500 underline decoration-dotted"
          >
            {d.commitMessage ?? d.url}
          </a>
        ) : (
          <p className="truncate text-xs text-warm-500">{d.commitMessage ?? d.url}</p>
        )}

        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="font-fw-mono tabular-nums text-warm-600">
            {d.target ?? 'preview'} · {formatDeployAge(d.createdAt)}
          </span>
          {sentryHref ? (
            <a
              href={sentryHref}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 font-medium text-accent-700 underline"
            >
              issues →
            </a>
          ) : null}
        </div>
      </Inset>
    </li>
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
        tone="neutral"
        mono
      />
      <StatTile
        label="Crash-free users"
        value={health.data.crashFreeUsers ?? undefined}
        starved={health.data.crashFreeUsers === null}
        format={{ style: 'percent', maximumFractionDigits: 2 }}
        tone="neutral"
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
    // Below `sm`: doctrine "2 + 1-wide" rhythm for a 3-peer strip (2-col grid,
    // 3rd cell spans both) instead of 3 full-width stacked rows. `sm:` and up
    // is untouched — still the original flat 3-across row.
    <div className="grid grid-cols-2 gap-3 [&>*:last-child]:col-span-2 sm:grid-cols-3 sm:[&>*:last-child]:col-span-1">
      <StatTile label="Visitors 24h" value={insights.data.visitors24h} tone="neutral" mono />
      <StatTile label="Visitors 7d" value={insights.data.visitors7d} tone="neutral" mono />
      <StatTile label="Visitors 30d" value={insights.data.visitors30d} tone="neutral" mono />
    </div>
  );
}

export default async function DeploysPage() {
  await requireSuperAdmin();
  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={60_000} />
      <CurrentBuildCard />

      <Surface padding="sm">
        <SectionLabel>Release ledger</SectionLabel>
        <div className="mt-3">
          <PanelBoundary title="Release ledger">
            <ReleaseLedger />
          </PanelBoundary>
        </div>
      </Surface>

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
    </div>
  );
}
