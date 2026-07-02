import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchOverviewSnapshot } from '@/lib/admin/data/overview';
import { fetchTriageQueue } from '@/lib/admin/data/triage';
import { fetchVercelDeployments } from '@/lib/admin/vercel-api';
import { fetchFeatureHealth, summarizeFeatureHealth } from '@/lib/admin/data/feature-health';
import { AdminStatusBanner } from './_components/AdminStatusBanner';
import { KpiTile } from './_components/KpiTile';
import { TriageQueue } from './_components/TriageQueue';
import { AutoRefresh } from './_components/AutoRefresh';
import { PanelBoundary } from './_components/PanelBoundary';
import { PanelAllClear, PanelNoData, PanelStale } from './_components/PanelStates';
import { FeatureHealthRollup } from './_components/FeatureHealthRollup';
import { SkeletonStat, SkeletonList, Surface, Eyebrow } from '@/components/fairway';

export const dynamic = 'force-dynamic';

async function BannerAndKpis() {
  const { kpis, banner, watcher } = await fetchOverviewSnapshot();
  return (
    <>
      <AdminStatusBanner
        state={banner.state}
        attentionCount={banner.attentionCount}
        checkedAt={banner.checkedAt}
      />
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Sentry unresolved" value={kpis.sentryUnresolved} href="/admin/errors" tone={kpis.sentryUnresolved ? 'danger' : 'neutral'} goodDirection="down" />
        <KpiTile label="Errors 24h" value={kpis.eventErrors24h} href="/admin/errors" goodDirection="down" />
        <KpiTile label="Auth failures 24h" value={kpis.authFailures24h} href="/admin/auth" goodDirection="down" />
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
      <section className="xl:col-span-2 rounded-2xl border border-warm-200 bg-white/70 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
          Triage queue
        </h2>
        {sentry.status === 'error' ? (
          <div className="mt-2"><PanelStale label="Sentry feed" error={sentry.error} /></div>
        ) : null}
        {sentry.status === 'unconfigured' ? (
          <p className="mt-2 text-xs text-warm-500">
            Sentry live pull not configured (SENTRY_READ_TOKEN) — showing in-app incidents only.
          </p>
        ) : null}
        <TriageQueue items={items.slice(0, 25)} />
      </section>
      <section className="rounded-2xl border border-warm-200 bg-white/70 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">
          Regressed — a fix failed
        </h2>
        {regressed.length === 0 ? (
          <PanelAllClear label="No regressed issues" checkedAt={new Date().toISOString()} />
        ) : (
          <TriageQueue items={regressed} />
        )}
      </section>
    </div>
  );
}

async function FeatureHealthPanel() {
  const raw = await fetchFeatureHealth();
  const summary = summarizeFeatureHealth(raw, new Date());
  return (
    <Surface elevation="border" padding="sm">
      <Eyebrow as="h2" tone="tertiary" className="mb-2">
        Feature health
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
        <li key={d.uid} className="rounded-xl border border-warm-200 bg-white/70 px-3 py-2">
          <p className="font-fw-mono text-xs tabular-nums text-warm-900">
            {d.commitSha?.slice(0, 7) ?? d.uid.slice(0, 7)} · {d.state}
          </p>
          <p className="max-w-[220px] truncate text-xs text-warm-500">{d.commitMessage ?? d.url}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminOverviewPage() {
  await requireSuperAdmin();

  return (
    <main className="space-y-6 p-6">
      <AutoRefresh />
      <PanelBoundary title="Status" skeleton={<SkeletonStat />}>
        <BannerAndKpis />
      </PanelBoundary>
      <PanelBoundary title="Triage" skeleton={<SkeletonList />}>
        <TriagePanel />
      </PanelBoundary>
      <PanelBoundary title="Feature health" skeleton={<SkeletonStat />}>
        <FeatureHealthPanel />
      </PanelBoundary>
      <PanelBoundary title="Deploys" skeleton={<SkeletonStat />}>
        <DeployRail />
      </PanelBoundary>
    </main>
  );
}
