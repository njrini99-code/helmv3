import type { ComponentProps } from 'react';
import Link from 'next/link';
import { Activity, RadioTower, GitBranch, ShieldCheck, Users, AlertTriangle, Gauge, SearchCheck } from 'lucide-react';
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
import { KpiSourceNote } from './_components/KpiSourceNote';
import { SeverityMixStrip, bucketSeverityMix } from './_components/SeverityMixStrip';
import { PostureDisclosure } from './_components/PostureDisclosure';
import { TriageQueue } from './_components/TriageQueue';
import { AutoRefresh } from './_components/AutoRefresh';
import { PanelBoundary } from './_components/PanelBoundary';
import { PanelAllClear, PanelNoData, PanelStale } from './_components/PanelStates';
import { FeatureHealthRollup } from './_components/FeatureHealthRollup';
import { Skeleton, SkeletonStat, SkeletonList, Surface, Eyebrow, StatusPill, StatStrip } from '@/components/fairway';
import { ADMIN_COMMAND_SHORTCUTS } from './_components/admin-nav';
import { cachedIncidentBoard } from '@/lib/admin/incidents/fetch';
import { buildTruthStrip } from '@/lib/admin/incidents/truth-strip';
import { canClaimAllClear } from '@/lib/admin/incidents/sources';
import { fetchDeployFreshness } from '@/lib/admin/deploy-freshness';
import { cachedSelfHealBoard } from '@/lib/admin/data/selfheal';
import { DEFAULT_INCIDENT_WINDOW_HOURS } from '@/lib/admin/data/incident-feed';
import { TruthStrip } from './_components/TruthStrip';
import { BlindnessBeacon } from './_components/BlindnessBeacon';
import { ProofDebtPanel, selectProofDebt } from './_components/ProofDebtPanel';
import { fetchChangeTimeline } from '@/lib/admin/data/change-timeline';
import { ChangeTimeline } from './_components/ChangeTimeline';
import { selectAttention } from '@/lib/admin/incidents/attention';
import { AttentionQueue } from './_components/AttentionQueue';
import { summarizeFlow } from '@/lib/admin/selfheal-flow';
import { SelfHealFlowStrip } from './_components/SelfHealFlow';

export const dynamic = 'force-dynamic';

/** The posture line, and nothing else. Awaits the SAME fetchOverviewSnapshot()
 *  `PostureBoards` does (cache()-memoised per request), so splitting this out
 *  costs zero extra queries. If that memoisation is ever dropped, this page
 *  silently pays for its whole fan-out twice. */
async function StatusBanner() {
  const { banner } = await fetchOverviewSnapshot();
  return (
    <AdminStatusBanner
      state={banner.state}
      attentionCount={banner.attentionCount}
      checkedAt={banner.checkedAt}
    />
  );
}

/**
 * The 24h incident feed's severity composition — critical/error/warning,
 * counts labelled, one segment per severity deep-linking to the Errors tab
 * filtered by that severity. `fetchTriageQueue()` is React `cache()`-memoised
 * per request (see its doc comment in src/lib/admin/data/triage.ts) and
 * `TriagePanel` below asks for the exact same default-window feed on the
 * same render — this is a second call site, not a second query.
 */
async function SeverityMixSection() {
  const { items, sentry } = await fetchTriageQueue();
  const counts = bucketSeverityMix(items);
  return <SeverityMixStrip counts={counts} sentryStatus={sentry.status} />;
}

/**
 * The KPI/board stack. `MetricTruthPanel` (a fourth full-width "here's where
 * every number came from" section) has DISSOLVED: each KPI tile below now
 * carries its own `<KpiSourceNote>` — a tap-to-expand line under the tile —
 * so the honesty stays without spending a whole extra section on it.
 * `SavedCommandViews`' curated deep links are folded in here too, inside the
 * collapsed Posture disclosure (see `PostureDisclosure` in
 * `AdminOverviewPage`) rather than dropped.
 */
async function PostureBoards() {
  const { kpis, watcher } = await fetchOverviewSnapshot();
  // A list (not 6 hand-written <KpiTile> literals) so `StatStrip`'s `count`
  // — which drives its phone grid-vs-rail breakpoint — is always derived
  // from what's actually rendered, never a hand-maintained literal that can
  // silently drift out of sync the next time a tile is added/removed.
  // `source`/`freshness` feed each tile's `<KpiSourceNote>` — the same
  // provenance text the old MetricTruthPanel showed, honest per tile.
  const kpiTiles: Array<
    { key: string; source: string; freshness?: (WatcherSignal & { stale: boolean }) | null } & ComponentProps<
      typeof KpiTile
    >
  > = [
    {
      key: 'sentry-unresolved',
      label: 'Sentry unresolved',
      value: kpis.sentryUnresolved,
      href: '/admin/errors',
      tone: kpis.sentryUnresolved ? 'danger' : 'neutral',
      goodDirection: 'down',
      source: 'Sentry issues API — unresolved, org-wide (not windowed).',
      // Honest starved copy (bridge-tab-audit-p0p1 overview Finding 1) —
      // without this the tile falls through to StatTile's generic "log a
      // few more data points" message even when Sentry is unconfigured or
      // its API call failed, telling the operator to wait for something
      // that will never fill in on its own.
      ...(kpis.sentryStatus === 'unconfigured'
        ? {
            starvedTitle: 'Sentry not configured',
            starvedDescription: 'Set SENTRY_READ_TOKEN to pull live unresolved-issue counts.',
          }
        : kpis.sentryStatus === 'error'
          ? {
              starvedTitle: 'Sentry fetch failed',
              starvedDescription: 'The last live pull errored — see the Errors tab for in-app incidents in the meantime.',
            }
          : {}),
    },
    {
      key: 'incident-groups-24h',
      label: 'Incident groups 24h',
      value: kpis.incidentGroups24h,
      href: '/admin/errors',
      goodDirection: 'down',
      tone: classifyKpiTone(kpis.incidentGroups24h, ERRORS_24H_RED_AT),
      source: '24h feed — admin_events + Sentry (lastSeen), grouped into incidents.',
      freshness: watcher.find((w) => w.label === 'Error pipeline'),
    },
    {
      key: 'security-events-24h',
      label: 'Security events 24h',
      value: kpis.securityEvents24h,
      href: '/admin/auth',
      goodDirection: 'down',
      tone: classifyKpiTone(kpis.securityEvents24h, SECURITY_EVENTS_24H_RED_AT),
      source: "admin_events where event_type = 'security', last 24h count.",
    },
    {
      key: 'active-users-today',
      label: 'Active users today',
      value: kpis.activeUsersToday,
      href: '/admin/users',
      source: 'users.last_seen since UTC midnight.',
      freshness: watcher.find((w) => w.label === 'Login events'),
    },
    {
      key: 'activity-today',
      label: 'Activity today',
      value: kpis.activityToday.golf + kpis.activityToday.baseball + kpis.activityToday.lifting,
      href: '/admin/golf',
      source: 'golf_rounds + baseball_games (completed) + helm_lifting_sessions, created today.',
    },
    {
      key: 'last-deploy',
      label: 'Last deploy (min ago)',
      value: kpis.lastDeploy?.ageMinutes ?? null,
      href: '/admin/deploys',
      tone: kpis.lastDeploy?.state === 'ERROR' ? 'danger' : 'neutral',
      goodDirection: 'down',
      source: 'Vercel deployments API — most recent deployment age.',
    },
  ];
  return (
    <>
      <StatStrip
        count={kpiTiles.length}
        columns={6}
        mdColumns={3}
        xlColumns={6}
        edgeBleedClassName="-mx-4 px-4"
        ariaLabel="Platform KPIs"
      >
        {kpiTiles.map(({ key, source, freshness, ...tile }) => (
          <div key={key} className="flex h-full flex-col gap-1">
            {/* `min-h-0 flex-1`, not the tile filling this wrapper directly:
                KpiTile's own Link sets `h-full`, which needs a DEFINITE
                height to resolve against. This inner cell gives it one (the
                flex column's leftover space after the note below claims its
                own natural height) instead of the two fighting over 100%
                of an otherwise auto-sized wrapper. */}
            <div className="min-h-0 flex-1">
              <KpiTile {...tile} />
            </div>
            <KpiSourceNote
              source={source}
              freshnessLabel={
                freshness
                  ? `${freshness.stale ? 'stale' : 'fresh'} · ${formatWatcherAge(freshness.lastSeenAt)}`
                  : undefined
              }
            />
          </div>
        ))}
      </StatStrip>
      <SignalBoard kpis={kpis} watcher={watcher} />
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
  // `href` on the Lifting row (bridge-tab-audit-p0p1 overview Finding 2) —
  // Overview already computed this count with nowhere to click through to;
  // /admin/lifting is that destination now. Golf/Baseball get the same
  // treatment for consistency (previously only decorative, no href).
  const activity = [
    ['Golf', kpis.activityToday.golf, '/admin/golf'],
    ['Baseball', kpis.activityToday.baseball, '/admin/baseball'],
    ['Lifting', kpis.activityToday.lifting, '/admin/lifting'],
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
            {activity.map(([label, value, href]) => {
              const pct = totalActivity > 0 ? Math.round((value / totalActivity) * 100) : 0;
              // `-mx-2 px-2 py-2`: this is a tap target on the Bridge's most
              // phone-primary surface, and at py-0 it was a ~20px strip whose
              // hover tint clipped hard against the text. Same negative-margin
              // bleed the briefing strip above uses, so the label stays aligned
              // with the section heading.
              return (
                <Link
                  key={label}
                  href={href}
                  className="-mx-2 grid grid-cols-[72px_1fr_44px] items-center gap-2 rounded-fw-md px-2 py-2 transition-colors hover:bg-surface-sunken"
                >
                  <span className="text-caption text-warm-600">{label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-warm-100">
                    <span
                      className="block h-full rounded-full bg-accent-500"
                      style={{ width: `${pct}%` }}
                      aria-hidden
                    />
                  </span>
                  <span className="text-right font-fw-mono text-caption tabular-nums text-warm-900">{value}</span>
                </Link>
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

/**
 * Action lanes + Triage queue + Regressed — the actual work surface. Now
 * above the fold on every breakpoint (see `AdminOverviewPage`): triage-first
 * ordering means an operator reaches "what do I do about it" right after
 * "is anything on fire", with the slower KPI/signal/deploy detail collapsed
 * below in the Posture disclosure rather than sitting in between.
 */
async function TriagePanel() {
  const { items, sentry, counts } = await fetchTriageQueue();
  // Match /admin/errors' default view exactly — see the panel header below.
  const actionableItems = items.filter((i) => i.actionable);
  const suppressedCount = items.length - actionableItems.length;
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
            ['Actionable', counts.actionableGroups, 'same number as the badge + Errors tab'],
            ['Total groups', counts.totalGroups, 'coalesced incidents'],
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
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-accent-600/25 pb-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-warm-500">Triage queue</h2>
            {/* SAME DEFAULT AS THE ERRORS TAB.
                This panel rendered the feed UNFILTERED while /admin/errors
                defaults to actionable-only (applyKindFilter's `undefined`
                branch). The two surfaces read the same feed through the same
                builder, so they were in sync by construction and then diverged
                on this one filter — an operator clicking through from here
                watched the list shrink with nothing saying why. Suppressed
                rows are never deleted, only defaulted out of view, so the
                count and the escape hatch are stated rather than implied. */}
            {suppressedCount > 0 ? (
              <Link href="/admin/errors?kind=all" className="text-caption text-accent-700 underline">
                {suppressedCount} routine hidden
              </Link>
            ) : null}
          </div>
          {sentry.status === 'error' ? (
            <div className="mt-2"><PanelStale label="Sentry feed" error={sentry.error} /></div>
          ) : null}
          {sentry.status === 'unconfigured' ? (
            <p className="mt-2 break-words text-xs text-warm-500 [overflow-wrap:anywhere]">
              Sentry live pull not configured (SENTRY_READ_TOKEN) — showing in-app incidents only.
            </p>
          ) : null}
          {/* The legacy feed's only external witness is Sentry, so an
              unconfigured or failed Sentry pull makes an empty queue a
              partial count, not an all-clear — the same rule
              UnifiedIncidentQueue takes from canClaimAllClear. */}
          <TriageQueue items={actionableItems.slice(0, 25)} canClaimAllClear={sentry.status === 'ok'} />
        </Surface>
        <Surface as="section" padding="sm" className="min-w-0">
          <h2 className="border-b border-accent-600/25 pb-2 text-xs font-semibold uppercase tracking-widest text-warm-500">
            Regressed — a fix failed
          </h2>
          {regressed.length === 0 ? (
            sentry.status === 'ok' ? (
              <PanelAllClear label="No regressed issues" checkedAt={new Date().toISOString()} />
            ) : (
              <PanelNoData
                label="No regressed issues in readable sources"
                description="Sentry could not be read this refresh, so a regression it alone would have shown is invisible right now."
              />
            )
          ) : (
            <TriageQueue items={regressed} canClaimAllClear={sentry.status === 'ok'} />
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
 * A compact masthead row, not a hero. This used to be a dark full-width card
 * with an eyebrow, a big title, a paragraph, and four shortcut pills — on
 * phone the FIRST thing rendered, spending the whole first viewport on
 * decoration before the posture banner (the actual answer to "is anything on
 * fire") ever appeared (M1, bridge-chrome). It's since moved below the
 * triage lane AND the collapsed Posture disclosure — there is no longer any
 * decorative hero above triage on any breakpoint — so it only needs to be a
 * single slim row: a brand label plus the same shortcut links, always
 * visible (no `hidden md:flex` — nothing above it is fighting for the
 * viewport any more).
 */
/**
 * MISSION CONTROL — the five facts that decide whether anything else on this
 * page can be trusted.
 *
 * Deliberately the FIRST panel, and deliberately its own boundary. Its three
 * reads (the incident board, the self-heal heartbeats, production freshness)
 * share nothing with the KPI snapshot below, so nesting it would make the
 * highest-signal panel on the Bridge wait on eleven Supabase queries before it
 * could issue its own — the same serialization mistake `AttentionPanel`'s doc
 * comment records. Siblings render concurrently.
 *
 * The self-heal and deploy reads are BOTH allowed to fail without taking the
 * strip down: a null loop renders as UNREADABLE and an unresolvable deploy
 * renders as UNKNOWN, because "we could not find out" is a different fact from
 * "it is fine" and this is the one panel that must never blur them.
 */
async function MissionTruthStrip() {
  const [board, loop, deploy] = await Promise.all([
    cachedIncidentBoard(DEFAULT_INCIDENT_WINDOW_HOURS),
    cachedSelfHealBoard(),
    fetchDeployFreshness(),
  ]);

  const now = Date.now();
  const loopData = loop.status === 'ok' ? loop.data : null;
  const loopAgeMs = loopData ? now - Date.parse(loopData.computedAt) : null;

  const cells = buildTruthStrip({
    incidents: board.incidents,
    coverage: board.coverage,
    deploy,
    // Throughput — the third axis of the self-heal cell. Computed from the
    // same board as the incidents cell, so a stall the strip escalates on is
    // an incident the queue below actually lists.
    flow: summarizeFlow(board.incidents, now),
    // The running deployment identifies itself through the env of the
    // deployment it is running in — no API token required, and no chance of
    // reporting a deploy other than the one serving this request.
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    loop: loopData?.verdict ?? null,
    loopAgeMs: Number.isFinite(loopAgeMs) ? loopAgeMs : null,
    computedAt: board.computedAt,
    now,
  });

  return (
    <div className="space-y-3">
      <TruthStrip cells={cells} />
      <BlindnessBeacon note={board.blindnessNote} coverage={board.coverage} />
    </div>
  );
}

/**
 * SELF-HEAL FLOW — where the loop's backlog sits, as counts.
 *
 * Reads the same memoised board as the truth strip, so the "N stalled" the
 * strip's self-heal cell escalates on and the per-stage numbers here cannot
 * disagree. Counts only, on purpose: the Overview has one attention list and
 * one incident list, and a stalled incident already earns its row in the
 * first (`attention.ts`'s `stage-stalled`). The rows themselves live on
 * /admin/self-heal, the loop's own board.
 */
async function SelfHealFlowPanel() {
  const board = await cachedIncidentBoard(DEFAULT_INCIDENT_WINDOW_HOURS);
  return (
    <SelfHealFlowStrip
      summary={summarizeFlow(board.incidents, Date.now())}
      canClaimAllClear={canClaimAllClear(board.coverage)}
    />
  );
}

/**
 * Proof debt — solved-looking work that is not yet evidenced.
 *
 * Reads the same memoised board as the truth strip above, so the number in the
 * strip and the list here cannot disagree. That is not a nicety: a headline
 * count that contradicts the list it links to is the exact failure
 * `incident-count-agreement.test.ts` exists to pin, one layer down.
 */
async function ProofDebt() {
  const board = await cachedIncidentBoard(DEFAULT_INCIDENT_WINDOW_HOURS);
  return (
    <ProofDebtPanel
      rows={selectProofDebt(board.incidents)}
      canClaimAllClear={canClaimAllClear(board.coverage)}
      checkedAt={board.computedAt}
    />
  );
}

/**
 * NEEDS YOUR EYES — THE attention list, ranked by evidence rather than by
 * severity alone.
 *
 * One list, deliberately. This started as a companion to a second panel that
 * carried the same title and rendered `fetchBriefing`'s platform checks on
 * their own, which left an operator holding two attention lists and ranking
 * them against each other by eye. Two lists over one question is the split
 * this read model exists to remove, so the briefing's checks are now rows in
 * here and the separate panel is gone.
 *
 * The ordering is what earns the merge: a fault that was declared fixed and
 * came back outranks a fresh critical, because the first says the system's own
 * judgement was wrong and the second only says something broke — and a failing
 * platform check ranks against both on the same scale.
 *
 * An all-clear is a CLAIM and needs the whole picture: a blind source or a
 * briefing check that could not run both withdraw it, because an empty list we
 * could not fully compute must not read as a calm morning.
 *
 * Mounted as a SIBLING boundary in the page body, never nested inside the
 * component that awaits `fetchOverviewSnapshot()` (11 parallel Supabase reads
 * + the Vercel API + a per-feature Sentry sweep). It shares no data with any
 * of that, and nesting it once meant the highest-signal panel on the page
 * could not even ISSUE its own queries until an unrelated fetch had resolved.
 * Sibling boundaries render concurrently; nested ones serialize.
 */
async function AttentionPanel() {
  const [board, loop, briefing] = await Promise.all([
    cachedIncidentBoard(DEFAULT_INCIDENT_WINDOW_HOURS),
    cachedSelfHealBoard(),
    fetchBriefing(),
  ]);
  const now = Date.now();
  const stages = loop.status === 'ok' ? (loop.data?.stages ?? []) : [];
  const input = {
    incidents: board.incidents,
    stages,
    coverage: board.coverage,
    now,
    briefing: briefing.items,
  };
  const all = selectAttention(input, Number.MAX_SAFE_INTEGER);
  const rows = selectAttention(input);
  return (
    <AttentionQueue
      rows={rows}
      total={all.length}
      checkedAt={board.computedAt}
      canClaimAllClear={canClaimAllClear(board.coverage) && briefing.degradedChecks.length === 0}
      degradedChecks={briefing.degradedChecks.length}
    />
  );
}

/**
 * CHANGE TIMELINE — what changed, and in what order.
 *
 * The sentence an operator otherwise reconstructs by hand every morning. It is
 * the difference between "the error stopped" and "the error stopped nine
 * minutes after the deploy that claimed to fix it" — and the second is the
 * only one you can act on.
 *
 * It takes the already-assembled board rather than re-deriving incidents, so
 * the strip and the list on /admin/errors cannot describe different sets of
 * incidents in the same moment. Deliberately states no causality: a deploy
 * immediately before an incident is a temporal neighbour, and calling it a
 * cause would be a claim the data does not support.
 */
async function ChangeTimelinePanel() {
  const board = await cachedIncidentBoard(DEFAULT_INCIDENT_WINDOW_HOURS);
  const timeline = await fetchChangeTimeline(board.incidents);
  if (timeline.status !== 'ok' || !timeline.data) {
    return <PanelStale label="Change timeline" error={timeline.error} />;
  }
  return <ChangeTimeline snapshot={timeline.data} />;
}

function CommandHeader() {
  const iconByHref = {
    '/admin/errors': Activity,
    '/admin/health': RadioTower,
    '/admin/deploys': GitBranch,
    '/admin/auth': ShieldCheck,
  } as const;

  return (
    <section
      aria-label="Command shortcuts"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warm-200 bg-surface px-4 py-2.5"
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-warm-500">
        Helm Bridge · Command Center
      </p>
      <nav aria-label="Command center shortcuts" className="flex flex-wrap gap-2">
        {ADMIN_COMMAND_SHORTCUTS.map((item) => {
          const Icon = iconByHref[item.href];
          return (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-warm-200 px-3 text-xs font-medium text-warm-700 transition-colors hover:bg-warm-100"
            >
              <Icon size={14} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}

export default async function AdminOverviewPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-5">
      <AutoRefresh />

      {/* Triage-first ordering (bridge-refit): Status → Needs your eyes →
          Severity mix, all THREE sibling boundaries so a hiccup in one never
          blocks the others (see AttentionPanel's doc comment) — then straight
          into Action lanes/Triage/Regressed, the actual work surface, still
          above the fold on every breakpoint. Slower posture detail (KPIs,
          signals, deploys, feature health) is collapsed further down. */}
      <section aria-label="Right now" className="space-y-4">
        <div>
          <Eyebrow as="h2" tone="secondary">Right now</Eyebrow>
          <p className="mt-1 text-sm text-warm-500">Signals refresh server-side and degrade per panel.</p>
        </div>
        <PanelBoundary title="System truth" skeleton={<Skeleton className="h-24 w-full rounded-2xl" />}>
          <MissionTruthStrip />
        </PanelBoundary>
        <PanelBoundary title="Status" skeleton={<Skeleton className="h-11 w-full rounded-2xl" />}>
          <StatusBanner />
        </PanelBoundary>
        <PanelBoundary title="Needs your eyes" skeleton={<SkeletonList />}>
          <AttentionPanel />
        </PanelBoundary>
        <PanelBoundary
          title="Severity mix (24h)"
          skeleton={
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-full rounded-full" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-11 w-24 rounded-full" />
                <Skeleton className="h-11 w-24 rounded-full" />
                <Skeleton className="h-11 w-24 rounded-full" />
              </div>
            </div>
          }
        >
          <SeverityMixSection />
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
        <Surface as="section" padding="sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-accent-600/25 pb-2">
            <Eyebrow as="h3" tone="tertiary">Self-heal flow</Eyebrow>
            <p className="text-caption text-warm-500">What is waiting on each stage, and what the loop has skipped</p>
          </div>
          <div className="mt-2">
            <PanelBoundary title="Self-heal flow" skeleton={<SkeletonStat />}>
              <SelfHealFlowPanel />
            </PanelBoundary>
          </div>
        </Surface>
        <Surface as="section" padding="sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-accent-600/25 pb-2">
            <Eyebrow as="h3" tone="tertiary">Proof debt</Eyebrow>
            <p className="text-caption text-warm-500">
              Solved-looking work that is not yet evidenced
            </p>
          </div>
          <div className="mt-2">
            <PanelBoundary title="Proof debt" skeleton={<SkeletonList />}>
              <ProofDebt />
            </PanelBoundary>
          </div>
        </Surface>
      </section>

      <Surface as="section" padding="sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-accent-600/25 pb-2">
          <Eyebrow as="h2" tone="tertiary">Change timeline</Eyebrow>
          <p className="text-caption text-warm-500">Deploys, repairs, closures and regressions</p>
        </div>
        <div className="mt-2">
          <PanelBoundary title="Change timeline" skeleton={<SkeletonList />}>
            <ChangeTimelinePanel />
          </PanelBoundary>
        </div>
      </Surface>

      <PostureDisclosure>
        <PanelBoundary title="Platform KPIs" skeleton={<SkeletonStat />}>
          <PostureBoards />
        </PanelBoundary>
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
      </PostureDisclosure>

      <CommandHeader />
    </div>
  );
}
