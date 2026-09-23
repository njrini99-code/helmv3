import type { ComponentProps } from 'react';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import {
  fetchOverviewSnapshot,
  classifyKpiTone,
  ERRORS_24H_RED_AT,
  SECURITY_EVENTS_24H_RED_AT,
  type WatcherSignal,
} from '@/lib/admin/data/overview';
import { fetchFeatureHealth, summarizeFeatureHealth } from '@/lib/admin/data/feature-health';
import { KpiTile } from './_components/KpiTile';
import { KpiSourceNote } from './_components/KpiSourceNote';
import { AutoRefresh } from './_components/AutoRefresh';
import { PanelBoundary } from './_components/PanelBoundary';
import { PanelStale } from './_components/PanelStates';
import { FeatureHealthRollup } from './_components/FeatureHealthRollup';
import { Skeleton, SkeletonStat, SkeletonList, Surface, Eyebrow, StatStrip } from '@/components/fairway';
import { cachedIncidentBoard } from '@/lib/admin/incidents/fetch';
import { DEFAULT_INCIDENT_WINDOW_HOURS } from '@/lib/admin/data/incident-feed';
import { fetchChangeTimeline } from '@/lib/admin/data/change-timeline';
import { ChangeTimeline } from './_components/ChangeTimeline';
import { CommandDeck } from '@/components/admin/command-deck/CommandDeck';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/**
 * The KPI `StatStrip` — promoted out of the collapsed Posture disclosure
 * (bridge redesign plan §2.2; `PostureDisclosure.tsx` is deleted). The
 * disclosure defaulted CLOSED on every fresh session, which hid this strip
 * and the feature-health rollup below it behind a click on a surface whose
 * owner-stated priority is visibility — the opposite of what a collapsed
 * default buys. `MetricTruthPanel` (a fourth full-width "here's where every
 * number came from" section) DISSOLVED before this: each tile below carries
 * its own `<KpiSourceNote>` — a tap-to-expand line under the tile — so the
 * honesty stays without spending a whole extra section on it.
 *
 * `fetchOverviewSnapshot()` is React `cache()`-memoised per request, and
 * `CommandDeck` above already calls it once (for `activeUsersToday`) — this
 * is a second call site, not a second query.
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
      // value === null means the count QUERY failed, not that the product had
      // a quiet day — KpiTile's generic starved copy ("log more data") would
      // say the opposite of what happened.
      starvedTitle: 'Active-user count unavailable',
      starvedDescription: 'The users.last_seen count could not be read. This is not zero activity.',
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

/**
 * Feature health rollup — promoted out of the collapsed Posture disclosure,
 * same reasoning as `PostureBoards` above. Compact, with a real link to the
 * full board, mirroring the pattern `/admin/golf` and `/admin/baseball`
 * already ship for their own per-app cross-links (see those pages' own
 * "Feature health" sections) rather than the old heading-only rollup this
 * used to be, which had no way out to `/admin/health` at all.
 */
async function FeatureHealthPanel() {
  const raw = await fetchFeatureHealth();
  const summary = summarizeFeatureHealth(raw, new Date());
  return (
    <Surface elevation="border" padding="sm">
      <Eyebrow as="h2" tone="tertiary" className="mb-2">
        Feature command map
      </Eyebrow>
      <FeatureHealthRollup summary={summary} />
      <p className="mt-3 text-xs text-warm-500">
        Full cross-sport board lives at{' '}
        <Link href="/admin/health" className="text-accent-700 underline">
          /admin/health →
        </Link>
      </p>
    </Surface>
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

export default async function AdminOverviewPage() {
  await requireSuperAdmin();

  return (
    <div className="space-y-5">
      <AutoRefresh />

      {/* HELM COMMAND DECK (brief §10; bridge redesign plan §2) — THE
          Overview. Posture sentence + blindness beacon, System Orbit,
          Attention Stack, Decision Inbox, Release Wake, Self-Heal Circuit
          (+ proof-debt chip). This finishes the Phase 2 -> 3 migration: the
          eleven panels that used to render below this deck (Status banner,
          Needs-your-eyes, Severity mix, Action lanes/Triage/Regressed,
          Self-heal flow, Proof debt, Mission Truth Strip, the collapsed
          Posture disclosure, Saved command views, the Deploy rail, and the
          bottom command-shortcut row) were each a second or third rendering
          of a computation this deck already makes, or dissolved into a lens
          one click away — see `CommandDeck.tsx`'s own header for the full
          accounting. What survives below the Deck is exactly what it does
          NOT compute: the KPI `StatStrip`, the feature-health rollup, and
          the change timeline. */}
      <PanelBoundary
        title="Helm Command Deck"
        skeleton={
          <div className="space-y-4">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-[360px] w-full rounded-2xl" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-40 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        }
      >
        <CommandDeck />
      </PanelBoundary>

      <section aria-label="Platform KPIs">
        <PanelBoundary title="Platform KPIs" skeleton={<SkeletonStat />}>
          <PostureBoards />
        </PanelBoundary>
      </section>

      <section aria-label="Feature command map">
        <PanelBoundary title="Feature command map" skeleton={<SkeletonStat />}>
          <FeatureHealthPanel />
        </PanelBoundary>
      </section>

      <Surface as="section" padding="sm" aria-label="Change timeline">
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
    </div>
  );
}
