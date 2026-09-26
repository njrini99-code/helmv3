'use client';

/**
 * ============================================================================
 * TriageDesk — the CoachHelm command desk (Triage Desk spec, full rebuild)
 * ----------------------------------------------------------------------------
 * Replaces the Spine + Bento home entirely. This is the ONE composition root
 * for the coach `/dashboard/intelligence` page: a horizontal `BriefBand`,
 * a `ViewSwitch` (Signals/Players/Effectiveness, `?view=`-driven), and below
 * it either the Signals master-detail (`SignalQueue` + `SignalDossier`, built
 * on the frozen `getSignalGroups`/`reviewSignal`/`dismissSignal` contract), the
 * unchanged `PlayersGridView` embed, or the compact `EffectivenessScoreboard`
 * (spec §4 — NOT the retired 1,800-line `FairwayEffectiveness` cockpit).
 *
 * Reads `view`/`filter`/`signal` from `useSearchParams()` directly (same
 * self-contained pattern `StageRouter` used) rather than threading them down
 * as server props — there is no separate "home" view to fall back to
 * anymore, so there is nothing for a server-resolved prop to buy here.
 *
 * `groups` is seeded from the server fetch and re-synced whenever it changes
 * (a `router.refresh()` after Scan team / a mutation re-runs
 * `getSignalGroups` server-side and flows a fresh array back down) — every
 * mutation below is optimistic-with-rollback on top of that local copy,
 * matching the pattern the diagnosis flagged as MISSING on the legacy
 * Signals surface (no `router.refresh()` after mutations there).
 * ========================================================================== */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Button, fairwayToast, InlineNotice, PlayersGridView } from '@/components/fairway';
import { surfaceHref, surfaceName } from '@/lib/golf/surface-registry';
import type { PlayersGridViewProps, FairwayEffectivenessProps, PlayersGridStats } from '@/components/fairway';
import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
import { InsufficientData } from '@/components/fairway/feedback/InsufficientData';
import { refreshTeamAnalysisAsCoach } from '@/app/golf/actions/insights';
import { reviewSignal, dismissSignal } from '@/app/golf/actions/signal-groups';
import type { TeamCategoryInsightsResult, TeamShotAnalysis } from '@/app/golf/actions/team-category-insights';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { TeamCategoryLeakBand } from '@/components/fairway/pages/coachhelm/TeamCategoryLeakBand';
import {
  formatShotContext,
  formatLie,
  formatDistanceRange,
} from '@/lib/coachhelm/v2/shot-analysis/format';
import { BriefBand } from './BriefBand';
import { ViewSwitch, DEFAULT_VIEW_OPTIONS, TEAM_ROOTS_OPTION } from './ViewSwitch';
import { TeamRootsView, type TeamRootsData } from '@/components/golf/coachhelm/root-map/TeamRootsView';
import { Disclosure } from '@/components/golf/coachhelm/root-map/Disclosure';
import { SignalQueue } from './SignalQueue';
import { TeamSignalSummary } from './TeamSignalSummary';
import { SignalDossier } from './SignalDossier';
import { EffectivenessScoreboard } from './EffectivenessScoreboard';
import {
  computeBriefCounts,
  buildBriefVerdict,
  distinctCategories,
  filterGroupSignals,
  findSignalInGroups,
  formatRelativeScanTime,
  removeSignalFromGroups,
  resolveQueueFilter,
  resolveTriageView,
  type TriageView,
} from './buildTriageViewModel';

/**
 * The team-level equivalent of `ShotAnalysisCard`'s "Key Weaknesses" —
 * `getTeamOverview`'s `teamShotAnalysis` (topWeaknesses + deadZones) was
 * computed on every `/intelligence` load and discarded down to
 * `playerCount` (data-completeness audit 2026-07-23). Same row treatment and
 * format helpers as the per-player card; honest-empty when the payload is
 * thin (overview failed, or the team simply has no shot data yet).
 */
function TeamShotWeaknessesPanel({ data }: { data: TeamShotAnalysis | undefined }) {
  const topWeaknesses = data?.topWeaknesses ?? [];
  const deadZones = data?.deadZones ?? [];

  if (topWeaknesses.length === 0 && deadZones.length === 0) {
    return (
      <InstrumentPanel depth="base" eyebrow="CoachHelm · team" header="Team shot weaknesses">
        <InsufficientData
          title="No team shot analysis yet"
          description="Log more team rounds and the toughest yardage bands will surface here."
          unit="rounds"
          compact
        />
      </InstrumentPanel>
    );
  }

  return (
    <InstrumentPanel depth="base" eyebrow="CoachHelm · team" header="Team shot weaknesses">
      <div className="space-y-4">
        {topWeaknesses.length > 0 ? (
          <div className="space-y-2">
            <p className="text-body-sm font-medium text-text-secondary">
              Where the team loses the most strokes
            </p>
            <div className="grid gap-2">
              {topWeaknesses.map((weakness, i) => (
                <div
                  key={`${weakness.context}-${weakness.lie}-${weakness.distanceRange}-${i}`}
                  className="flex items-center justify-between rounded-fw-md border border-border-subtle bg-surface-sunken p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-medium text-text-primary">
                      {formatShotContext({
                        lie: weakness.lie,
                        distanceRange: weakness.distanceRange,
                        context: weakness.context,
                      })}
                    </p>
                    <p className="text-caption text-text-tertiary">
                      {formatLie(weakness.lie)} · {formatDistanceRange(weakness.distanceRange, weakness.lie)}
                    </p>
                  </div>
                  <div className="ml-3 shrink-0 text-right">
                    <p className="font-fw-mono text-body-sm font-medium tabular-nums text-fw-danger-ink">
                      {weakness.avgSG.toFixed(2)}
                    </p>
                    <p className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                      {weakness.shotCount} shots
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {deadZones.length > 0 ? (
          <div className="rounded-fw-md border border-border-subtle bg-fw-danger-bg px-3 py-2.5">
            <p className="mb-1 text-caption font-medium text-fw-danger-ink">Dead zones</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {deadZones.map((dz, i) => (
                <span
                  key={`${dz.rangeStart}-${dz.rangeEnd}-${i}`}
                  className="inline-flex items-center gap-1 font-fw-mono text-caption tabular-nums text-fw-danger-ink"
                >
                  {dz.rangeStart}-{dz.rangeEnd}y
                  <span className="opacity-80">({dz.deficit.toFixed(2)} deficit)</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </InstrumentPanel>
  );
}

type TriageNavigationUpdates = Partial<{
  view: string;
  filter: string | null;
  signal: string | null;
  player: string | null;
  playersTab: 'roster' | 'areas' | null;
  /** Team roots drill: the cause whose Why is open (`?cause=`). */
  cause: string | null;
}>;

export interface TriageDeskProps {
  coachId: string;
  groups: SignalGroup[];
  scannedAt: string | null;
  /** Non-null when `getSignalGroups` itself failed — a distinct state from a
   *  genuinely empty (all-clear) queue, rendered as an honest retry notice. */
  groupsError: string | null;
  /** "Where the team is bleeding strokes" band data — categories[] +
   *  teamHealth from `getTeamCategoryInsights`. Rendered above `BriefBand` so
   *  it's visible regardless of which sub-view the coach is on; silently
   *  omitted (not an error banner) when the fetch failed, mirroring how the
   *  other best-effort extras on this page degrade. */
  categoryInsights: TeamCategoryInsightsResult;
  /** `getTeamOverview`'s discarded shot-analysis payload (topWeaknesses +
   *  deadZones) — `undefined` when the overview fetch failed or hasn't
   *  resolved yet. Rendered by `TeamShotWeaknessesPanel` as an honest-empty
   *  instrument, never a blocking error (mirrors how `categoryInsights`
   *  degrades above). */
  teamShotAnalysis?: TeamShotAnalysis;
  playersDrillProps: PlayersGridViewProps;
  /** Same SSR-fetched shape the retired cockpit consumed — `EffectivenessScoreboard`
   *  only reads its `initialOverview`/`initialEffectiveness`/`initialPerformance` fields. */
  effectivenessDrillProps: FairwayEffectivenessProps;
  /** Team roots (coach landing view). When present, an absent `?view=`
   *  lands on 'team' unless the URL is a signal/filter deep link; when
   *  null/absent the desk keeps its old Signals default and hides the tab. */
  teamRoots?: TeamRootsData | null;
}

/** Which view an absent/unknown `?view=` resolves to. Signal/filter deep
 *  links (`?signal=`, legacy `?id=`, `?filter=`) keep opening Signals. */
export function landingViewFor(
  params: { get: (key: string) => string | null },
  teamAvailable: boolean,
): TriageView {
  if (!teamAvailable) return 'signals';
  return params.get('signal') || params.get('id') || params.get('filter') ? 'signals' : 'team';
}

function resolveDeskView(
  params: { get: (key: string) => string | null },
  teamAvailable: boolean,
): TriageView {
  const v = resolveTriageView(params.get('view'), landingViewFor(params, teamAvailable));
  return v === 'team' && !teamAvailable ? 'signals' : v;
}

export function TriageDesk({
  coachId,
  groups: initialGroups,
  scannedAt,
  groupsError,
  categoryInsights,
  teamShotAnalysis,
  playersDrillProps,
  effectivenessDrillProps,
  teamRoots = null,
}: TriageDeskProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rosterPlayers = playersDrillProps.players ?? [];

  const teamAvailable = teamRoots !== null;
  const requestedView = resolveDeskView(searchParams, teamAvailable);
  const requestedQueueFilter = resolveQueueFilter(searchParams.get('filter'));
  // `signal` is the canonical param this desk writes; `id` is the legacy
  // insight deep-link CommandPalette.tsx:326 and FocusAreaCard.tsx:315 still
  // push (`?id=<insightId>`, forwarded here by the /insights redirect shim).
  // Both key off the same raw `golf_coach_insights`/`golf_patterns_v2` id
  // (signal-groups.ts's `id: row.id`), so falling back to `id` re-opens the
  // dossier for that exact insight instead of landing on an empty selection.
  const requestedSignalId = searchParams.get('signal') ?? searchParams.get('id');
  const requestedPlayerId = searchParams.get('player');
  const validRequestedPlayerId =
    requestedPlayerId && rosterPlayers.some((player) => player.id === requestedPlayerId)
      ? requestedPlayerId
      : null;
  const requestedPlayersTab =
    searchParams.get('playersTab') === 'areas' || validRequestedPlayerId ? 'areas' : 'roster';

  // These query parameters only choose among data that is already present in
  // this client island. Keep an optimistic local mirror so a tab/filter/row
  // responds in the same frame instead of waiting for the force-dynamic page
  // (and all of its Supabase reads) to render again.
  const [view, setView] = useState(requestedView);
  const [queueFilter, setQueueFilter] = useState(requestedQueueFilter);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(requestedSignalId);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(validRequestedPlayerId);
  const [playersTab, setPlayersTab] = useState<'roster' | 'areas'>(requestedPlayersTab);

  useEffect(() => setView(requestedView), [requestedView]);
  useEffect(() => setQueueFilter(requestedQueueFilter), [requestedQueueFilter]);
  useEffect(() => setSelectedSignalId(requestedSignalId), [requestedSignalId]);
  useEffect(() => setSelectedPlayerId(validRequestedPlayerId), [validRequestedPlayerId]);
  useEffect(() => setPlayersTab(requestedPlayersTab), [requestedPlayersTab]);

  const [groups, setGroups] = useState(initialGroups);
  useEffect(() => {
    setGroups(initialGroups);
  }, [initialGroups]);

  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [isScanning, startScanTransition] = useTransition();

  function hrefFor(updates: TriageNavigationUpdates) {
    // Read the browser's current query for rapid consecutive clicks. The
    // useSearchParams snapshot can legitimately trail a prior shallow update.
    const params = new URLSearchParams(
      typeof window === 'undefined' ? searchParams.toString() : window.location.search,
    );

    // Each top-level view owns a disjoint set of params. Clearing foreign
    // params prevents an old signal/player scope from resurrecting when the
    // coach moves away and comes back.
    // With Team roots as the landing view, a URL with no `view` resolves to
    // team once its signal/filter deep-link param is cleared. Pin the view
    // the coach is on, so Back from a dossier or the "All" chip stays on
    // Signals (and so the link hrefs say so too).
    if (updates.view === undefined && teamAvailable && !params.get('view')) {
      params.set('view', view);
    }
    if (updates.view !== undefined) {
      const targetView = resolveTriageView(updates.view);
      params.set('view', targetView);
      if (targetView === 'team') {
        params.delete('filter');
        params.delete('signal');
        params.delete('id');
        params.delete('playersTab');
        // `?view=team&player=` is the drill into one player's root map; it
        // only survives when the update names it.
        if (!('player' in updates)) params.delete('player');
        if (!('cause' in updates)) params.delete('cause');
      } else if (targetView === 'signals') {
        params.delete('player');
        params.delete('playersTab');
      } else if (targetView === 'players') {
        params.delete('filter');
        params.delete('signal');
        params.delete('id');
        if (!('player' in updates)) params.delete('player');
        if (!('playersTab' in updates)) params.delete('playersTab');
      } else {
        params.delete('filter');
        params.delete('signal');
        params.delete('id');
        params.delete('player');
        params.delete('playersTab');
      }
    }
    if (updates.view !== undefined && resolveTriageView(updates.view) !== 'team') params.delete('cause');
    if ('cause' in updates) {
      if (updates.cause) params.set('cause', updates.cause);
      else params.delete('cause');
    }
    if ('filter' in updates) {
      if (updates.filter) params.set('filter', updates.filter);
      else params.delete('filter');
    }
    if ('signal' in updates) {
      if (updates.signal) params.set('signal', updates.signal);
      else params.delete('signal');
      // `id` is the legacy one-shot deep-link param (CommandPalette.tsx:326,
      // FocusAreaCard.tsx:315) the dossier falls back to above — consume it
      // on the first signal navigation so `onBack`'s `navigate({ signal:
      // null })` actually closes the dossier instead of re-resolving `id`.
      params.delete('id');
    }
    if ('player' in updates) {
      if (updates.player) params.set('player', updates.player);
      else params.delete('player');
    }
    if ('playersTab' in updates) {
      if (updates.playersTab === 'areas') params.set('playersTab', 'areas');
      else params.delete('playersTab');
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function navigate(updates: TriageNavigationUpdates) {
    const href = hrefFor(updates);
    const next = new URL(
      href,
      typeof window === 'undefined' ? 'https://helmsportslabs.com' : window.location.origin,
    );
    const nextPlayerId = next.searchParams.get('player');

    setView(resolveDeskView(next.searchParams, teamAvailable));
    setQueueFilter(resolveQueueFilter(next.searchParams.get('filter')));
    setSelectedSignalId(next.searchParams.get('signal') ?? next.searchParams.get('id'));
    setSelectedPlayerId(
      nextPlayerId && rosterPlayers.some((player) => player.id === nextPlayerId)
        ? nextPlayerId
        : null,
    );
    setPlayersTab(
      next.searchParams.get('playersTab') === 'areas' || Boolean(nextPlayerId) ? 'areas' : 'roster',
    );

    if (typeof window !== 'undefined') {
      window.history.replaceState(window.history.state, '', `${next.pathname}${next.search}${next.hash}`);
    } else {
      router.replace(href, { scroll: false });
    }
  }

  const counts = useMemo(() => computeBriefCounts(groups), [groups]);
  const severityMix = useMemo(() => {
    const mix = { urgent: 0, high: 0, medium: 0, low: 0 };
    for (const group of groups) for (const signal of group.signals) mix[signal.severity] += 1;
    return mix;
  }, [groups]);
  const verdict = useMemo(() => buildBriefVerdict(groups, counts), [groups, counts]);
  const lastScanLabel = useMemo(() => formatRelativeScanTime(scannedAt), [scannedAt]);
  const categories = useMemo(() => distinctCategories(groups), [groups]);
  const filteredGroups = useMemo(() => filterGroupSignals(groups, queueFilter), [groups, queueFilter]);
  const selectedEntry = useMemo(() => findSignalInGroups(groups, selectedSignalId), [groups, selectedSignalId]);
  // Keep the desktop dossier useful on first load instead of dedicating half
  // the command desk to an empty placeholder. The URL remains unselected, so
  // mobile still opens on the queue and keyboard focus stays predictable.
  const defaultEntry = useMemo(() => {
    const group = groups.find((candidate) => candidate.signals.length > 0);
    const signal = group?.signals[0];
    return signal && group ? { group, signal } : null;
  }, [groups]);
  const dossierEntry = selectedEntry ?? defaultEntry;

  // Related-context slices for the dossier's right-pane fill (live-QA
  // "~700-800px dead space" fix) — derived straight from data this desk
  // already has (`playersDrillProps`), no extra fetch.
  const dossierPlayerId = dossierEntry?.group.playerId ?? null;
  const dossierPlayerFocusAreas = useMemo(
    () =>
      dossierPlayerId
        ? playersDrillProps.focusAreas.filter((fa) => fa.player_id === dossierPlayerId)
        : [],
    [dossierPlayerId, playersDrillProps.focusAreas],
  );
  const dossierPlayerGoals = dossierPlayerId
    ? (playersDrillProps.goalsByPlayer?.[dossierPlayerId] ?? [])
    : [];
  const dossierPlayerStats: PlayersGridStats | null = dossierPlayerId
    ? (playersDrillProps.playerStats[dossierPlayerId] ?? null)
    : null;

  const categoryBandData = categoryInsights.success ? categoryInsights.data : undefined;

  function handleScan() {
    startScanTransition(async () => {
      try {
        const res = await refreshTeamAnalysisAsCoach();
        if (!res.success) {
          fairwayToast.error(res.error ?? 'Could not scan the team. Try again.');
          return;
        }
        if ((res.playersFailed ?? 0) > 0) {
          fairwayToast.warning(
            `Scan finished with ${res.playersFailed} player${res.playersFailed === 1 ? '' : 's'} needing another pass.`,
          );
        } else {
          fairwayToast.success('Scan complete — team signals refreshed.');
        }
        router.refresh();
      } catch {
        fairwayToast.error('Could not scan the team. Try again.');
      }
    });
  }

  async function runSignalAction(
    signal: GroupedSignal,
    action: (id: string, kind: 'insight' | 'pattern') => Promise<{ success: boolean; error?: string }>,
    successLabel: string,
  ) {
    // A roster roll-up has no row behind it — its id is a synthetic
    // `team:<metric>` minted by synthesizeTeamSignals. Sending that to
    // acknowledgeInsight/dismissInsight would hit the server with an id that
    // does not exist, and optimistically remove a card that would come
    // straight back on refresh. Nothing to acknowledge: dismissing the summary
    // would not touch any of the leaks it summarizes.
    if (signal.kind === 'team_synthesis') return;
    if (pendingIds.has(signal.id)) return;
    setPendingIds((prev) => new Set(prev).add(signal.id));
    const prevGroups = groups;
    setGroups(removeSignalFromGroups(groups, signal.id));
    if (selectedSignalId === signal.id) navigate({ signal: null });

    try {
      const res = await action(signal.id, signal.kind);
      if (!res.success) {
        setGroups(prevGroups);
        fairwayToast.error(res.error ?? 'Could not update the signal. Try again.');
        return;
      }
      fairwayToast.success(successLabel);
      router.refresh();
    } catch {
      setGroups(prevGroups);
      fairwayToast.error('Could not update the signal. Try again.');
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(signal.id);
        return next;
      });
    }
  }

  const handleReview = (signal: GroupedSignal) => runSignalAction(signal, reviewSignal, 'Marked reviewed.');
  const handleDismiss = (signal: GroupedSignal) => runSignalAction(signal, dismissSignal, 'Dismissed.');

  function handlePromoted(signal: GroupedSignal) {
    setGroups((prev) => removeSignalFromGroups(prev, signal.id));
    // The newly-created focus area belongs to this player. Keep that context
    // through the drill-in so Prescribe opens the scoped development board
    // instead of dropping the coach back at the full roster. `router.replace`
    // re-runs the server page with `?player=` and therefore also reads the
    // freshly revalidated focus-area data; a separate refresh here races the
    // navigation and is unnecessary.
    navigate({ view: 'players', signal: null, player: signal.playerId, playersTab: 'areas' });
    router.refresh();
  }

  // A stale bookmark (or a signal reviewed in another tab) can leave a
  // `?signal=` that no longer resolves. On narrow screens the queue is hidden
  // whenever a detail is open, so key this off the resolved entry—not merely
  // the raw URL param—or an invalid deep link strands the coach on an empty
  // dossier with no Back control.
  const isSignalSelected = Boolean(selectedEntry);

  return (
    <div className="flex flex-col gap-6">
      {/*
        Ask sits BESIDE the view switcher, not inside it.

        `surface-registry.ts` has always declared Ask as a live
        `group: 'coachhelm-tab'` surface — it carries neither `legacy` nor
        `hidden`, unlike the three tabs Spine & Stage genuinely retired. But
        the strip that was supposed to render it, `CoachHelmSubNav`, is not
        mounted by any live page: every non-test reference to it is a comment
        or a `loading.tsx` skeleton drawing a tab strip the real page never
        shows. So the only route into the chat was the floating FAB, while the
        breadcrumb kept printing `CoachHelm AI / Ask`.

        It does NOT belong in `ViewSwitch`: that control is typed to the
        `?view=` drills of this same page (`signals | players | effectiveness`)
        and Ask is a separate route. Putting a route inside a view-switcher
        would break the one thing that control means.

        Name and href come from the registry rather than being written here,
        so this cannot drift from the breadcrumb and page title that already
        read from it.
      */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        {/* One row on phones: the switch scrolls inside its own track (with
            an edge fade) and Ask keeps its place beside it. */}
        <div className="min-w-0 flex-1 sm:flex-none">
          <ViewSwitch
            view={view}
            hrefFor={(next) => hrefFor({ view: next, signal: null })}
            onSelect={(next) => navigate({ view: next, signal: null })}
            options={teamAvailable ? [TEAM_ROOTS_OPTION, ...DEFAULT_VIEW_OPTIONS] : DEFAULT_VIEW_OPTIONS}
          />
        </div>
        <Button asChild variant="secondary" size="sm" className="min-h-11 shrink-0">
          <Link href={surfaceHref('ask')}>
            <MessageCircle aria-hidden className="h-3.5 w-3.5" />
            {surfaceName('ask')}
          </Link>
        </Button>
      </div>

      {view === 'team' && teamRoots ? (
        <TeamRootsView
          {...teamRoots}
          // The drill was built server-side for `?player=`; show it only while
          // the URL still names that player (a shallow move back to the team
          // map clears the param without a server render).
          drillOpen={selectedPlayerId !== null && teamRoots.drill?.playerId === selectedPlayerId}
          hrefFor={hrefFor}
          navigate={navigate}
        />
      ) : null}

      {view === 'signals' ? (
        groupsError ? (
          <InlineNotice
            tone="danger"
            title="Couldn't load signals — retry"
            action={
              <Button variant="secondary" size="sm" onClick={() => router.refresh()}>
                Try again
              </Button>
            }
          >
            {groupsError}
          </InlineNotice>
        ) : (
          <>
            {/* Summary first: the count, the verdict, the severity split and
                Scan team. The queue and its dossier follow; everything that
                describes the team as a whole sits in closed disclosures
                below them. */}
            <BriefBand
              verdict={verdict}
              counts={counts}
              lastScanLabel={lastScanLabel}
              scanning={isScanning}
              onScan={handleScan}
              mix={severityMix}
            />

            <div className="grid grid-cols-1 gap-4 min-[940px]:grid-cols-[380px_1fr] min-[940px]:items-stretch">
              <div className={cn(isSignalSelected && 'hidden min-[940px]:block')}>
                <SignalQueue
                  groups={filteredGroups}
                  allGroups={groups}
                  categories={categories}
                  filter={queueFilter}
                  filterHref={(next) => hrefFor({ filter: next === 'all' ? null : next })}
                  onSelectFilter={(next) => navigate({ filter: next === 'all' ? null : next })}
                  selectedSignalId={selectedSignalId}
                  onSelectSignal={(id) => navigate({ signal: id })}
                  signalHref={(id) => hrefFor({ signal: id })}
                />
              </div>
              <div className={cn(!isSignalSelected && 'hidden min-[940px]:block')}>
                <SignalDossier
                  entry={dossierEntry}
                  coachId={coachId}
                  pending={dossierEntry ? pendingIds.has(dossierEntry.signal.id) : false}
                  onReview={handleReview}
                  onDismiss={handleDismiss}
                  onPromoted={handlePromoted}
                  onBack={() => navigate({ signal: null })}
                  onSelectSignal={(id) => navigate({ signal: id })}
                  playerFocusAreas={dossierPlayerFocusAreas}
                  playerGoals={dossierPlayerGoals}
                  playerStats={dossierPlayerStats}
                />
              </div>
            </div>

            <div className="flex flex-col">
              {/* Per-category signal pressure: the shape of the whole queue
                  (count, high-priority share and impact per category). */}
              <Disclosure title="Where signals concentrate" slot="signals-concentrate">
                <TeamSignalSummary
                  groups={groups}
                  playerHref={(playerId) => hrefFor({ view: 'players', player: playerId, playersTab: 'areas' })}
                  onOpenPlayer={(playerId) => navigate({ view: 'players', player: playerId, playersTab: 'areas' })}
                />
              </Disclosure>
              {categoryBandData ? (
                <Disclosure title="Team by game area" slot="signals-leak-band">
                  <TeamCategoryLeakBand
                    categories={categoryBandData.categories}
                    teamHealth={categoryBandData.teamHealth}
                  />
                </Disclosure>
              ) : null}
              {/* Team diagnostics: the team shot weaknesses instrument,
                  supplementary to the queue. Closed by default under the
                  summary-first layout (owner direction 2026-09-25). */}
              <Disclosure title="Team diagnostics" slot="triage-team-diagnostics">
                <TeamShotWeaknessesPanel data={teamShotAnalysis} />
              </Disclosure>
            </div>
          </>
        )
      ) : null}

      {view === 'players' ? (
        <PlayersGridView
          {...playersDrillProps}
          embedded
          initialSelectedPlayerId={selectedPlayerId}
          initialPlayersView={playersTab === 'areas' ? 'areas' : 'grid'}
          onNavigationChange={({ view: nextView, playerId }) =>
            navigate({
              player: nextView === 'areas' ? playerId : null,
              playersTab: nextView === 'areas' ? 'areas' : null,
            })
          }
        />
      ) : null}
      {view === 'effectiveness' ? (
        <EffectivenessScoreboard
          initialOverview={effectivenessDrillProps.initialOverview}
          initialEffectiveness={effectivenessDrillProps.initialEffectiveness}
          initialPerformance={effectivenessDrillProps.initialPerformance}
        />
      ) : null}
    </div>
  );
}
