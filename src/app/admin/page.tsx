import type { ComponentProps } from 'react';
import Link from 'next/link';
import { CheckCircle2, Activity, GitBranch, RadioTower, ShieldCheck, Users, AlertTriangle, Gauge, SearchCheck } from 'lucide-react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import {
  fetchOverviewSnapshot,
  classifyKpiTone,
  ERRORS_24H_RED_AT,
  SECURITY_EVENTS_24H_RED_AT,
  type OverviewKpis,
  type WatcherSignal,
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
import { SkeletonStat, SkeletonList, Surface, Eyebrow, StatusPill, StatStrip } from '@/components/fairway';
import { ADMIN_COMMAND_SHORTCUTS } from './_components/admin-nav';

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
  // Built as a list (not 6 hand-written <KpiTile> literals) so `StatStrip`'s
  // `count` — which drives its phone grid-vs-rail breakpoint — is always
  // derived from what's actually rendered, never a hand-maintained literal
  // that can silently drift out of sync the next time a tile is added/removed.
  const kpiTiles: Array<{ key: string } & ComponentProps<typeof KpiTile>> = [
    {
      key: 'sentry-unresolved',
      label: 'Sentry unresolved',
      value: kpis.sentryUnresolved,
      href: '/admin/errors',
      tone: kpis.sentryUnresolved ? 'danger' : 'neutral',
      goodDirection: 'down',
    },
    {
      key: 'incident-groups-24h',
      label: 'Incident groups 24h',
      value: kpis.incidentGroups24h,
      href: '/admin/errors',
      goodDirection: 'down',
      tone: classifyKpiTone(kpis.incidentGroups24h, ERRORS_24H_RED_AT),
    },
    {
      key: 'security-events-24h',
      label: 'Security events 24h',
      value: kpis.securityEvents24h,
      href: '/admin/auth',
      goodDirection: 'down',
      tone: classifyKpiTone(kpis.securityEvents24h, SECURITY_EVENTS_24H_RED_AT),
    },
    { key: 'active-users-today', label: 'Active users today', value: kpis.activeUsersToday, href: '/admin/users' },
    {
      key: 'activity-today',
      label: 'Activity today',
      value: kpis.activityToday.golf + kpis.activityToday.baseball + kpis.activityToday.lifting,
      href: '/admin/golf',
    },
    {
      key: 'last-deploy',
      label: 'Last deploy (min ago)',
      value: kpis.lastDeploy?.ageMinutes ?? null,
      href: '/admin/deploys',
      tone: kpis.lastDeploy?.state === 'ERROR' ? 'danger' : 'neutral',
      goodDirection: 'down',
    },
  ];
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
      <StatStrip
        count={kpiTiles.length}
        columns={6}
        mdColumns={3}
        xlColumns={6}
        edgeBleedClassName="-mx-4 px-4"
        ariaLabel="Platform KPIs"
        className="mt-4"
      >
        {kpiTiles.map(({ key, ...tile }) => (
          <KpiTile key={key} {...tile} />
        ))}
      </StatStrip>
      <SignalBoard kpis={kpis} watcher={watcher} />
      <MetricTruthPanel kpis={kpis} watcher={watcher} />
      <SavedCommandViews kpis={kpis} />
    </>
  );
}

function formatWatcherAge(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'no signal';
  const ageMinutes = Math.max(0, Math.round((Date.now() - new Date(lastSeenAt).getTime()) / 60_000));
  if (ageMinutes < 60) return `${ageMinutes}m ago`;
  const hours = Math.round(ageMinutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function SignalBoard({
  kpis,
  watcher,
}: {
  kpis: OverviewKpis;
  watcher: Array<WatcherSignal & { stale: boolean }>;
}) {
  const activity = [
    ['Golf', kpis.activityToday.golf],
    ['Baseball', kpis.activityToday.baseball],
    ['Lifting', kpis.activityToday.lifting],
  ] as const;
  const totalActivity = activity.reduce((sum, [, value]) => sum + value, 0);

  return (
    <Surface as="section" padding="sm" className="mt-4">
      <div className="grid divide-y divide-warm-200 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,0.8fr)] md:divide-x md:divide-y-0">
        <div className="pb-3 md:pb-0 md:pr-4">
          <h2 className="text-eyebrow uppercase text-warm-500">Feed visibility</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {watcher.map((signal) => (
              <div key={signal.label} className="min-w-0">
                <StatusPill tone={signal.stale ? 'warning' : 'success'} dot size="sm">
                  {signal.stale ? 'stale' : 'flowing'}
                </StatusPill>
                <p className="mt-1 truncate text-body-sm font-medium text-warm-900">{signal.label}</p>
                <p className="font-fw-mono text-caption tabular-nums text-warm-500">
                  {formatWatcherAge(signal.lastSeenAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="py-3 md:px-4 md:py-0">
          <h2 className="text-eyebrow uppercase text-warm-500">Product activity</h2>
          <div className="mt-3 space-y-2">
            {activity.map(([label, value]) => {
              const pct = totalActivity > 0 ? Math.round((value / totalActivity) * 100) : 0;
              return (
                <div key={label} className="grid grid-cols-[72px_1fr_44px] items-center gap-2">
                  <span className="text-caption text-warm-600">{label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-warm-100">
                    <span
                      className="block h-full rounded-full bg-accent-500"
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                  </span>
                  <span className="text-right font-fw-mono text-caption tabular-nums text-warm-900">{value}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="pt-3 md:pl-4 md:pt-0">
          <h2 className="text-eyebrow uppercase text-warm-500">Deploy clock</h2>
          <p className="mt-3 font-fw-mono text-2xl tabular-nums text-warm-900">
            {kpis.lastDeploy?.ageMinutes ?? 'n/a'}
          </p>
          <p className="text-caption text-warm-500">
            {kpis.lastDeploy ? `${kpis.lastDeploy.state.toLowerCase()} deployment age, minutes` : 'No Vercel deployment feed'}
          </p>
        </div>
      </div>
    </Surface>
  );
}

function MetricTruthPanel({
  kpis,
  watcher,
}: {
  kpis: OverviewKpis;
  watcher: Array<WatcherSignal & { stale: boolean }>;
}) {
  const sources = [
    {
      label: 'Incident groups',
      value: kpis.incidentGroups24h,
      source: '24h feed — admin_events + Sentry (lastSeen), grouped',
      freshness: watcher.find((w) => w.label === 'Error pipeline'),
      href: '/admin/errors',
    },
    {
      label: 'Sentry unresolved',
      value: kpis.sentryUnresolved ?? 'n/a',
      source: 'Sentry issues API, unresolved only',
      freshness: null,
      href: '/admin/errors',
    },
    {
      label: 'Roster posture',
      value: kpis.activeUsersToday,
      source: 'users.last_seen since UTC midnight',
      freshness: watcher.find((w) => w.label === 'Login events'),
      href: '/admin/users',
    },
    {
      label: 'Deploy state',
      value: kpis.lastDeploy?.state ?? 'n/a',
      source: 'Vercel deployments API',
      freshness: null,
      href: '/admin/deploys',
    },
  ];

  return (
    <Surface as="section" padding="sm" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-200 pb-2">
        <h2 className="text-eyebrow uppercase text-warm-500">Metric truth layer</h2>
        <StatusPill tone="accent" size="sm" dot={false}>
          source mapped
        </StatusPill>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-4">
        {sources.map((source) => (
          <Link
            key={source.label}
            href={source.href}
            className="rounded-fw-md border border-warm-200 bg-surface-sunken p-3 transition-colors hover:bg-surface"
          >
            <p className="text-caption uppercase tracking-widest text-warm-500">{source.label}</p>
            <p className="mt-1 font-fw-mono text-xl font-semibold tabular-nums text-warm-900">{source.value}</p>
            <p className="mt-1 min-h-8 text-caption leading-4 text-warm-600">{source.source}</p>
            <p className="mt-2 font-fw-mono text-caption tabular-nums text-warm-500">
              {source.freshness ? `${source.freshness.stale ? 'stale' : 'fresh'} · ${formatWatcherAge(source.freshness.lastSeenAt)}` : 'API freshness via detail'}
            </p>
          </Link>
        ))}
      </div>
    </Surface>
  );
}

function SavedCommandViews({ kpis }: { kpis: OverviewKpis }) {
  const views = [
    {
      href: '/admin/errors?window=24&severity=error',
      label: 'Production Health',
      icon: Gauge,
      metric: `${kpis.incidentGroups24h} groups`,
      detail: 'Real incidents, source mapped, grouped like Errors tab',
    },
    {
      href: '/admin/users?sport=baseball&attention=watch',
      label: 'Baseball Launch',
      icon: SearchCheck,
      metric: `${kpis.activityToday.baseball} today`,
      detail: 'Team and player watchlist, quiet players, profile gaps',
    },
    {
      href: '/admin/users?attention=demo',
      label: 'Demo Readiness',
      icon: Users,
      metric: `${kpis.activeUsersToday} active`,
      detail: 'Accounts, team filters, roster status for walkthroughs',
    },
    {
      href: '/admin/errors?source=rls_denial&window=168',
      label: 'Error Forensics',
      icon: AlertTriangle,
      metric: 'trace',
      detail: 'RLS, route/action, feature tags, deploy correlation',
    },
  ];

  return (
    <Surface as="section" padding="sm" className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warm-200 pb-2">
        <h2 className="text-eyebrow uppercase text-warm-500">Saved command views</h2>
        <span className="font-fw-mono text-caption text-warm-500">operator presets</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {views.map((view) => {
          const Icon = view.icon;
          return (
            <Link
              key={view.label}
              href={view.href}
              className="group rounded-fw-md border border-warm-200 bg-surface-sunken p-3 transition-colors hover:bg-surface"
            >
              <div className="flex items-start justify-between gap-3">
                <Icon size={18} className="mt-0.5 text-accent-600" aria-hidden />
                <span className="rounded-full bg-warm-100 px-2 py-0.5 font-fw-mono text-caption text-warm-700">
                  {view.metric}
                </span>
              </div>
              <p className="mt-3 font-semibold text-warm-900 group-hover:underline">{view.label}</p>
              <p className="mt-1 text-caption leading-4 text-warm-600">{view.detail}</p>
            </Link>
          );
        })}
      </div>
    </Surface>
  );
}

async function TriagePanel() {
  const { items, sentry, counts } = await fetchTriageQueue();
  const regressed = items.filter((i) => i.substatus === 'regressed');
  const sportCounts = [
    ['Golf', items.filter((i) => i.sport === 'golf').length, 'golf'],
    ['Baseball', items.filter((i) => i.sport === 'baseball').length, 'baseball'],
    // Strict `=== 'shared'` — matches the drill-down link's `?sport=shared`
    // and fetchIncidentFeed's `.eq('sport', filters.sport)` exactly (both
    // treat `shared` as a strict tag, never `null`). Folding untagged rows
    // in here made the badge count exceed what the drill-down actually
    // shows; legacy untagged rows are already their own distinct category
    // elsewhere (see `widerWindowUntagged` in errors/page.tsx).
    ['Shared', items.filter((i) => i.sport === 'shared').length, 'shared'],
  ] as const;
  const topSources = Array.from(
    items.reduce((map, item) => {
      const key = item.source ?? item.origin;
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]).slice(0, 4);

  return (
    <div className="space-y-4">
      <Surface as="section" padding="sm" className="min-w-0">
        <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
          Action lanes
        </h2>
        <p className="mt-1 text-caption text-warm-500">
          Last 24h · same incident feed as the Errors tab (unresolved app events + Sentry with activity in window)
        </p>
        <div className="mt-3 grid divide-y divide-warm-200 overflow-hidden rounded-lg border border-warm-200 md:grid-cols-4 md:divide-x md:divide-y-0">
          {[
            ['Total groups', counts.totalGroups, 'coalesced incidents'],
            ['High severity', counts.highSeverityGroups, 'critical and error'],
            ['App groups', counts.appGroups, 'Supabase admin_events'],
            ['Sentry groups', counts.sentryGroups, sentry.status === 'ok' ? 'active in 24h' : sentry.status],
          ].map(([label, value, caption]) => (
            <div key={label} className="bg-surface-sunken px-3 py-2">
              <p className="text-eyebrow uppercase text-warm-500">{label}</p>
              <p className="font-fw-mono text-2xl tabular-nums text-warm-900">{value}</p>
              <p className="truncate text-caption text-warm-500">{caption}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {sportCounts.map(([label, count, sport]) => (
            <Link
              key={label}
              href={`/admin/errors?sport=${sport}`}
              className="inline-flex items-center gap-2 rounded-full border border-warm-200 px-2.5 py-1 text-caption text-warm-600 transition-colors hover:bg-warm-100"
            >
              {label}<span className="font-fw-mono tabular-nums text-warm-900">{count}</span>
            </Link>
          ))}
          {topSources.map(([source, count]) => (
            <Link
              key={source}
              href={`/admin/errors?source=${encodeURIComponent(source)}`}
              className="inline-flex items-center gap-2 rounded-full bg-warm-100 px-2.5 py-1 font-fw-mono text-caption text-warm-600 transition-colors hover:bg-warm-200"
            >
              {source}<span className="tabular-nums text-warm-900">{count}</span>
            </Link>
          ))}
        </div>
      </Surface>

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

/**
 * M1 (bridge-chrome, docs/MOBILE_DOCTRINE.md rule 2/7): on phone this used to
 * be the FIRST thing rendered — an eyebrow + big title + paragraph + four
 * shortcut pills spending the entire first viewport on decoration before the
 * posture banner (the actual answer to "is anything on fire") ever appears.
 * Below `md` it condenses to one title line: the paragraph and the shortcut
 * pills are desktop-only chrome (rule 7), and `AdminOverviewPage` now renders
 * the "Live posture" section BEFORE this masthead so the banner is always
 * the first thing above the fold, on every breakpoint.
 */
function CommandHeader() {
  const iconByHref = {
    '/admin/errors': Activity,
    '/admin/health': RadioTower,
    '/admin/deploys': GitBranch,
    '/admin/auth': ShieldCheck,
  } as const;

  return (
    <section className="rounded-2xl border border-warm-200 bg-[var(--fw-color-nav-bg)] px-5 py-4 text-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/55">Helm Bridge</p>
          <h1 className="mt-1 text-h3 font-semibold tracking-normal text-white md:text-2xl lg:text-3xl">
            Command Center
          </h1>
          <p className="mt-1 hidden max-w-3xl text-sm text-white/65 md:block">
            Production posture across GolfHelm, CoachHelm, BaseballHelm, Sentry, and Vercel.
          </p>
        </div>
        <nav aria-label="Command center shortcuts" className="hidden flex-wrap gap-2 md:flex">
          {ADMIN_COMMAND_SHORTCUTS.map((item) => {
            const Icon = iconByHref[item.href];
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

      {/* M1 (bridge-chrome): posture BEFORE the masthead on every breakpoint
          — the operator's headline question ("is anything on fire") answers
          above the fold instead of sitting under a decorative hero. */}
      <section aria-label="Live posture" className="space-y-4">
        <div>
          <Eyebrow as="h2" tone="secondary">Live posture</Eyebrow>
          <p className="mt-1 text-sm text-warm-500">Signals refresh server-side and degrade per panel.</p>
        </div>
        <PanelBoundary title="Live posture" skeleton={<SkeletonStat />}>
          <BannerAndKpis />
        </PanelBoundary>
      </section>

      <CommandHeader />

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
