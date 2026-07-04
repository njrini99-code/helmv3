import Link from 'next/link';
import { CheckCircle2, Activity, GitBranch, RadioTower, ShieldCheck } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import {
  fetchOverviewSnapshot,
  classifyKpiTone,
  ERRORS_24H_RED_AT,
  AUTH_FAILURES_24H_RED_AT,
} from '@/lib/admin/data/overview';
import { fetchTriageQueue } from '@/lib/admin/data/triage';
import { fetchVercelDeployments } from '@/lib/admin/vercel-api';
import { fetchFeatureHealth, summarizeFeatureHealth } from '@/lib/admin/data/feature-health';
import { fetchBriefing } from '@/lib/admin/data/briefing';
import { AdminStatusBanner } from './_components/AdminStatusBanner';
import { KpiTile } from './_components/KpiTile';
import { TriageQueue } from './_components/TriageQueue';
import { AutoRefresh } from './_components/AutoRefresh';
import { PanelBoundary } from './_components/PanelBoundary';
import { PanelAllClear, PanelNoData, PanelStale } from './_components/PanelStates';
import { FeatureHealthRollup } from './_components/FeatureHealthRollup';
import { SkeletonStat, SkeletonList, Surface, Eyebrow, StatusPill } from '@/components/fairway';

export const dynamic = 'force-dynamic';

/**
 * "Needs your eyes" — up to 6 severity-ordered signals from fetchBriefing()
 * (src/lib/admin/data/briefing.ts). Sits below the status banner, above the
 * KPI grid, in its OWN PanelBoundary so a briefing-query hiccup degrades to
 * a scoped STALE card, never the whole Status panel. Signal discipline:
 * attention is the ONLY red pill on this page outside genuine error counts;
 * the all-clear case is one quiet green line, never an empty box.
 */
async function BriefingStrip() {
  const items = await fetchBriefing();

  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-accent-700">
        <CheckCircle2 size={14} className="shrink-0" aria-hidden />
        All clear — nothing needs your attention right now.
      </p>
    );
  }

  return (
    <Surface as="section" padding="sm">
      <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
        Needs your eyes
      </h2>
      <ul className="mt-1 divide-y divide-warm-200/60">
        {items.map((item) => {
          const row = (
            <>
              <StatusPill tone={item.severity === 'attention' ? 'danger' : 'warning'} dot size="sm" className="shrink-0">
                {item.severity}
              </StatusPill>
              <span className="min-w-0 flex-1 basis-full break-words text-sm text-warm-900 [overflow-wrap:anywhere] sm:basis-auto">
                {item.headline}
              </span>
            </>
          );
          return (
            <li key={`${item.severity}:${item.headline}`}>
              {item.href ? (
                <Link
                  href={item.href}
                  className="-mx-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-fw-sm px-1 py-2.5 transition-colors hover:bg-surface-sunken"
                >
                  {row}
                </Link>
              ) : (
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-2.5">{row}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}

async function BannerAndKpis() {
  const { kpis, banner, watcher } = await fetchOverviewSnapshot();
  return (
    <>
      <AdminStatusBanner
        state={banner.state}
        attentionCount={banner.attentionCount}
        checkedAt={banner.checkedAt}
      />
      <div className="mt-4">
        <PanelBoundary title="Needs your eyes" skeleton={<SkeletonStat />}>
          <BriefingStrip />
        </PanelBoundary>
      </div>
      <div className="mt-4 grid grid-cols-2 items-stretch gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Sentry unresolved" value={kpis.sentryUnresolved} href="/admin/errors" tone={kpis.sentryUnresolved ? 'danger' : 'neutral'} goodDirection="down" />
        <KpiTile
          label="Error groups 24h"
          value={kpis.eventErrors24h}
          href="/admin/errors"
          goodDirection="down"
          tone={classifyKpiTone(kpis.eventErrors24h, ERRORS_24H_RED_AT)}
        />
        <KpiTile
          label="Auth failures 24h"
          value={kpis.authFailures24h}
          href="/admin/auth"
          goodDirection="down"
          tone={classifyKpiTone(kpis.authFailures24h, AUTH_FAILURES_24H_RED_AT)}
        />
        <KpiTile label="Active users today" value={kpis.activeUsersToday} href="/admin/users" />
        <KpiTile
          label="Activity today"
          value={kpis.activityToday.golf + kpis.activityToday.baseball + kpis.activityToday.lifting}
          href="/admin/golf"
        />
        <KpiTile
          label="Last deploy (min ago)"
          value={kpis.lastDeploy?.ageMinutes ?? null}
          href="/admin/deploys"
          tone={kpis.lastDeploy?.state === 'ERROR' ? 'danger' : 'neutral'}
          goodDirection="down"
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {watcher.map((w) => (
          <span
            key={w.label}
            className={
              w.stale
                ? 'rounded-full bg-fw-warning-bg px-2.5 py-1 text-xs text-warm-800'
                : 'rounded-full bg-fw-success-bg px-2.5 py-1 text-xs text-accent-700'
            }
          >
            {w.label}: {w.stale ? 'STALE' : 'flowing'}
          </span>
        ))}
      </div>
    </>
  );
}

async function TriagePanel() {
  const { items, sentry } = await fetchTriageQueue();
  const regressed = items.filter((i) => i.substatus === 'regressed');
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Surface as="section" padding="sm" className="min-w-0 xl:col-span-2">
        <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
          Triage queue
        </h2>
        {sentry.status === 'error' ? (
          <div className="mt-2"><PanelStale label="Sentry feed" error={sentry.error} /></div>
        ) : null}
        {sentry.status === 'unconfigured' ? (
          <p className="mt-2 break-words text-xs text-warm-500 [overflow-wrap:anywhere]">
            Sentry live pull not configured (SENTRY_READ_TOKEN) — showing in-app incidents only.
          </p>
        ) : null}
        <TriageQueue items={items.slice(0, 25)} />
      </Surface>
      <Surface as="section" padding="sm" className="min-w-0">
        <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
          Regressed — a fix failed
        </h2>
        {regressed.length === 0 ? (
          <PanelAllClear label="No regressed issues" checkedAt={new Date().toISOString()} />
        ) : (
          <TriageQueue items={regressed} />
        )}
      </Surface>
    </div>
  );
}

async function FeatureHealthPanel() {
  const raw = await fetchFeatureHealth();
  const summary = summarizeFeatureHealth(raw, new Date());
  return (
    <Surface elevation="border" padding="sm">
      <Eyebrow as="h2" tone="tertiary" className="mb-2">
        Feature command map
      </Eyebrow>
      <FeatureHealthRollup summary={summary} />
    </Surface>
  );
}

async function DeployRail() {
  const deploys = await fetchVercelDeployments(5);
  if (deploys.status === 'unconfigured') {
    return <PanelNoData label="Deploy rail not configured" description="Set VERCEL_API_TOKEN / VERCEL_PROJECT_ID / VERCEL_TEAM_ID to light this up." />;
  }
  if (deploys.status === 'error' || !deploys.data) {
    return <PanelStale label="Deploys" error={deploys.error} />;
  }
  return (
    <ul className="flex flex-wrap gap-3">
      {deploys.data.map((d) => (
        <li key={d.uid} className="rounded-xl border border-warm-200 bg-surface px-3 py-2">
          <p className="font-fw-mono text-xs tabular-nums text-warm-900">
            {d.commitSha?.slice(0, 7) ?? d.uid.slice(0, 7)} · {d.state}
          </p>
          <p className="max-w-[220px] truncate text-xs text-warm-500">{d.commitMessage ?? d.url}</p>
        </li>
      ))}
    </ul>
  );
}

function CommandHeader() {
  const nav = [
    { href: '/admin/errors', label: 'Errors', icon: Activity },
    { href: '/admin/health', label: 'Feature Map', icon: RadioTower },
    { href: '/admin/deploys', label: 'Deploys', icon: GitBranch },
    { href: '/admin/audit', label: 'Audit', icon: ShieldCheck },
  ];

  return (
    <section className="rounded-2xl border border-warm-200 bg-[var(--fw-color-nav-bg)] px-5 py-4 text-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/55">Helm Bridge</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-white sm:text-3xl">
            Command Center
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-white/65">
            Production posture across GolfHelm, CoachHelm, BaseballHelm, Sentry, and Vercel.
          </p>
        </div>
        <nav aria-label="Command center shortcuts" className="flex flex-wrap gap-2">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="glass-subtle inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-white transition-colors hover:border-white/30"
              >
                <Icon size={14} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </section>
  );
}

export default async function AdminOverviewPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-5">
      <AutoRefresh />
      <CommandHeader />

      <section aria-label="Live posture" className="space-y-4">
        <div>
          <Eyebrow as="h2" tone="secondary">Live posture</Eyebrow>
          <p className="mt-1 text-sm text-warm-500">Signals refresh server-side and degrade per panel.</p>
        </div>
        <PanelBoundary title="Live posture" skeleton={<SkeletonStat />}>
          <BannerAndKpis />
        </PanelBoundary>
      </section>

      <section aria-label="Incident operations" className="space-y-4">
        <div>
          <Eyebrow as="h2" tone="secondary">Incident operations</Eyebrow>
          <p className="mt-1 text-sm text-warm-500">Sentry and in-app events are coalesced into one triage lane.</p>
        </div>
        <PanelBoundary title="Incident operations" skeleton={<SkeletonList />}>
          <TriagePanel />
        </PanelBoundary>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
        <section aria-label="Feature command map">
          <PanelBoundary title="Feature command map" skeleton={<SkeletonStat />}>
            <FeatureHealthPanel />
          </PanelBoundary>
        </section>
        <section aria-label="Deploy control">
          <Surface elevation="border" padding="sm" className="min-h-full">
            <Eyebrow as="h2" tone="tertiary" className="mb-2">
              Deploy control
            </Eyebrow>
            <PanelBoundary title="Deploy control" skeleton={<SkeletonStat />}>
              <DeployRail />
            </PanelBoundary>
          </Surface>
        </section>
      </div>
    </div>
  );
}
