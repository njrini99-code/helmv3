'use client';

/**
 * ============================================================================
 * TriageDesk — the coach CoachHelm page: Home · The Lab · Chat
 * ----------------------------------------------------------------------------
 * The ONE composition root under `/golf/dashboard/intelligence`, below the
 * empty-roster gate in `CoachIntelligenceHome`. A top toggle (`ViewSwitch`,
 * `?view=home|lab|chat`) picks one of three views:
 *
 *   Home     the greeting (handed in as `homeLead`), then "Where the team is
 *            bleeding strokes" (`TeamBleedBoard`), "Team shot weaknesses"
 *            (`TeamShotWeaknesses`) and the full-width "Game pressure map"
 *            (`TeamSignalSummary`). Nothing else: the brief band, program
 *            pulse, roster and follow-up panels are gone from this page.
 *   The Lab  the signal queue (`SignalQueue`) beside the dossier
 *            (`SignalDossier`), built on the frozen `getSignalGroups` /
 *            `reviewSignal` / `dismissSignal` contract. Scan team lives in its
 *            header. On a phone it is list OR detail, with Back in the
 *            dossier header.
 *   Chat     the Ask CoachHelm conversation (handed in as `chatPanel`), kept
 *            mounted once opened so a reply that is still streaming survives
 *            a trip to Home or The Lab.
 *
 * `?view=players` (the focus-area board, `PlayersGridView`) has no toggle
 * segment but stays reachable: some fifteen links across the app deep-link
 * to it. `?view=signals` and `?view=effectiveness` are legacy values that
 * `resolveTriageView` maps to The Lab and Home.
 *
 * Every view's data is already in this island, so switching views, filters
 * and signals is purely client-side (`history.replaceState(null, …)`, which
 * Next syncs into its router). `groups` is seeded from the server fetch and
 * re-synced when it changes (a `router.refresh()` after Scan team or a
 * mutation); each mutation is optimistic with rollback on top of that copy.
 * ========================================================================== */

import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { RotateCw, ScanSearch } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, EmptyState, fairwayToast, InlineNotice, PlayersGridView } from '@/components/fairway';
import type { PlayersGridViewProps, PlayersGridStats } from '@/components/fairway';
import { refreshTeamAnalysisAsCoach } from '@/app/golf/actions/insights';
import { reviewSignal, dismissSignal } from '@/app/golf/actions/signal-groups';
import type { TeamCategoryInsightsResult, TeamShotAnalysis } from '@/app/golf/actions/team-category-insights';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { ViewSwitch } from './ViewSwitch';
import { SignalQueue } from './SignalQueue';
import { TeamSignalSummary } from './TeamSignalSummary';
import { SignalDossier, type RollupContributor } from './SignalDossier';
import { TeamBleedBoard } from './TeamBleedBoard';
import { TeamShotWeaknesses } from './TeamShotWeaknesses';
import {
  computeBriefCounts,
  buildBriefVerdict,
  distinctCategories,
  filterGroupSignals,
  findSignalInGroups,
  formatRelativeScanTime,
  hasSignalContext,
  removeSignalFromGroups,
  restoreSignalToGroups,
  resolveQueueFilter,
  resolveTriageView,
  rollupContributorsFor,
  type TriageView,
} from './buildTriageViewModel';

type TriageNavigationUpdates = Partial<{
  view: TriageView;
  filter: string | null;
  signal: string | null;
  player: string | null;
  playersTab: 'roster' | 'areas' | null;
}>;

export interface TriageDeskProps {
  coachId: string;
  groups: SignalGroup[];
  scannedAt: string | null;
  /** Non-null when `getSignalGroups` itself failed: a distinct state from a
   *  genuinely empty (all-clear) queue, rendered as an honest retry notice. */
  groupsError: string | null;
  /** "Where the team is bleeding strokes": categories[] + teamHealth from
   *  `getTeamCategoryInsights`. A failed read renders a retry notice. */
  categoryInsights: TeamCategoryInsightsResult;
  /** `getTeamOverview`'s shot-analysis payload (topWeaknesses + deadZones);
   *  `undefined` when the overview read failed or carried none. */
  teamShotAnalysis?: TeamShotAnalysis;
  /** The overview read failed, so the shot-weakness card says "didn't load"
   *  rather than "no data yet". */
  overviewFailed?: boolean;
  playersDrillProps: PlayersGridViewProps;
  /** The top of Home: the greeting and any page-level notice. */
  homeLead?: ReactNode;
  /** The Chat tab: the embedded Ask surface, or an honest notice. */
  chatPanel?: ReactNode;
}

/** Parse the desk's URL-owned navigation state from a query string. */
function readTriageNavState(params: URLSearchParams, rosterPlayers: ReadonlyArray<{ id: string }>) {
  const playerId = params.get('player');
  const validPlayerId = playerId && rosterPlayers.some((player) => player.id === playerId) ? playerId : null;
  return {
    view: resolveTriageView(params.get('view'), { hasSignalContext: hasSignalContext(params) }),
    queueFilter: resolveQueueFilter(params.get('filter')),
    // `signal` is the canonical param this desk writes; `id` is the legacy
    // insight deep-link CommandPalette and FocusAreaCard still push
    // (`?id=<insightId>`, forwarded by the /insights redirect shim). Both key
    // off the same raw row id, so falling back to `id` re-opens the dossier
    // for that exact insight instead of landing on an empty selection.
    signalId: params.get('signal') ?? params.get('id'),
    playerId: validPlayerId,
    // A stale `player=` (not on the roster) degrades to the unscoped roster
    // rather than an empty areas board.
    playersTab: (params.get('playersTab') === 'areas' || Boolean(validPlayerId) ? 'areas' : 'roster') as
      | 'roster'
      | 'areas',
  };
}

/** The Lab's split height on a desktop: one viewport under the sticky top
 *  bar, so each pane scrolls on its own. Kept out of the JSX so the queue and
 *  the dossier cannot drift apart. */
const LAB_SPLIT =
  'min-[940px]:h-[calc(100dvh-var(--golf-mobile-header-offset,4rem)-var(--fw-hub-subnav-offset,0px)-2rem)] min-[940px]:min-h-[30rem]';

export function TriageDesk({
  coachId,
  groups: initialGroups,
  scannedAt,
  groupsError,
  categoryInsights,
  teamShotAnalysis,
  overviewFailed = false,
  playersDrillProps,
  homeLead,
  chatPanel,
}: TriageDeskProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rosterPlayers = useMemo(() => playersDrillProps.players ?? [], [playersDrillProps.players]);

  // These query parameters only choose among data already present in this
  // client island. Keep an optimistic local mirror so a tab/filter/row
  // responds in the same frame instead of waiting for the force-dynamic page
  // to render again. First render reads the server-visible snapshot, so a
  // deep link selects its view on the very first paint.
  const initialNav = readTriageNavState(new URLSearchParams(searchParams.toString()), rosterPlayers);
  const [view, setView] = useState<TriageView>(initialNav.view);
  const [queueFilter, setQueueFilter] = useState(initialNav.queueFilter);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(initialNav.signalId);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(initialNav.playerId);
  const [playersTab, setPlayersTab] = useState<'roster' | 'areas'>(initialNav.playersTab);
  // Chat stays mounted once opened: a reply still streaming must survive a
  // trip to Home or The Lab, and the thread must be where the coach left it.
  const [chatOpened, setChatOpened] = useState(initialNav.view === 'chat');
  useEffect(() => {
    if (view === 'chat') setChatOpened(true);
  }, [view]);

  // MOT-19: the signal the coach just closed, so the queue can scroll back
  // to its row and highlight it on Back.
  const [returnSignalId, setReturnSignalId] = useState<string | null>(null);
  const lastSignalRef = useRef<string | null>(initialNav.signalId);
  useEffect(() => {
    if (lastSignalRef.current && !selectedSignalId) setReturnSignalId(lastSignalRef.current);
    lastSignalRef.current = selectedSignalId;
  }, [selectedSignalId]);

  function applyNavState(next: ReturnType<typeof readTriageNavState>) {
    setView(next.view);
    setQueueFilter(next.queueFilter);
    setSelectedSignalId(next.signalId);
    setSelectedPlayerId(next.playerId);
    setPlayersTab(next.playersTab);
  }

  // Re-sync when the router's query changes underneath us (back/forward, a
  // link from elsewhere into this page, or Next syncing one of our own
  // `history.replaceState` writes). Read the LIVE address bar rather than the
  // hook snapshot: Next applies a replaceState sync inside a transition, so
  // after two quick taps the snapshot can briefly still name the first tab.
  const searchKey = searchParams.toString();
  const hasSyncedRef = useRef(false);
  useEffect(() => {
    if (!hasSyncedRef.current) {
      hasSyncedRef.current = true;
      return;
    }
    const live =
      typeof window === 'undefined' ? new URLSearchParams(searchKey) : new URLSearchParams(window.location.search);
    applyNavState(readTriageNavState(live, rosterPlayers));
    // rosterPlayers is a fresh array per server render; the query string is
    // the only thing this sync keys on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey]);

  // ── Scroll anchoring for top-level view switches ─────────────────────────
  // The views have very different heights. When the document shrinks under
  // a coach who has scrolled down to the toggle, the browser clamps scrollY
  // and the page jumps. Before the swap, give the view region just enough
  // min-height to keep the current scroll position valid, so the toggle
  // stays where the finger left it. Recomputed on every switch.
  const switchRowRef = useRef<HTMLDivElement | null>(null);
  const viewRegionRef = useRef<HTMLDivElement | null>(null);
  const revealSwitchRef = useRef(false);

  function anchorBeforeViewSwitch() {
    if (typeof window === 'undefined') return;
    const switchRow = switchRowRef.current;
    const region = viewRegionRef.current;
    if (!switchRow || !region) return;
    const viewportHeight = window.innerHeight;
    const switchRect = switchRow.getBoundingClientRect();
    const switchOnScreen = switchRect.bottom > 0 && switchRect.top < viewportHeight;
    if (switchOnScreen) {
      const regionTop = region.getBoundingClientRect().top;
      region.style.minHeight = `${Math.max(0, Math.ceil(viewportHeight - regionTop))}px`;
      revealSwitchRef.current = false;
    } else {
      // A switch triggered from deep in the page (a pressure-map area opening
      // The Lab): holding height would park the coach in blank space. Let the
      // view settle, then bring the toggle and the new view's top into view.
      region.style.minHeight = '';
      revealSwitchRef.current = true;
    }
  }

  useLayoutEffect(() => {
    if (!revealSwitchRef.current) return;
    revealSwitchRef.current = false;
    const switchRow = switchRowRef.current;
    if (typeof switchRow?.scrollIntoView === 'function') switchRow.scrollIntoView({ block: 'nearest' });
  }, [view]);

  const [groups, setGroups] = useState(initialGroups);
  useEffect(() => {
    setGroups(initialGroups);
  }, [initialGroups]);

  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [isScanning, startScanTransition] = useTransition();

  function hrefFor(updates: TriageNavigationUpdates) {
    // Read the browser's current query for rapid consecutive clicks. The
    // useSearchParams snapshot can legitimately trail a prior shallow update.
    const params = new URLSearchParams(typeof window === 'undefined' ? searchParams.toString() : window.location.search);

    // Each view owns a disjoint set of params. Clearing foreign ones stops an
    // old signal or player scope resurrecting when the coach comes back. `c`
    // (the open chat thread) is never cleared: leaving Chat and coming back,
    // or reloading on another view, keeps the conversation.
    if (updates.view !== undefined) {
      const targetView = updates.view;
      params.set('view', targetView);
      if (targetView === 'lab') {
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
    if ('filter' in updates) {
      if (updates.filter) params.set('filter', updates.filter);
      else params.delete('filter');
    }
    if ('signal' in updates) {
      if (updates.signal) params.set('signal', updates.signal);
      else params.delete('signal');
      // `id` is the legacy one-shot deep-link param the dossier falls back to
      // above; consume it on the first signal navigation so Back's
      // `navigate({ signal: null })` actually closes the dossier.
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
    const next = new URL(href, typeof window === 'undefined' ? 'https://helmsportslabs.com' : window.location.origin);
    const nextNav = readTriageNavState(next.searchParams, rosterPlayers);

    if (nextNav.view !== view) anchorBeforeViewSwitch();
    applyNavState(nextNav);

    if (typeof window === 'undefined') {
      router.replace(href, { scroll: false });
      return;
    }
    // `null` state, NOT `window.history.state`, so Next's patched
    // replaceState syncs its router URL: carrying the existing `__NA` marker
    // made Next skip that sync, leaving its canonical URL stale so a later
    // `router.refresh()` re-fetched (and wrote back) the PREVIOUS query.
    const nextUrl = `${next.pathname}${next.search}${next.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    // Safari throttles replaceState (100 per 10s); a no-op write only costs.
    if (nextUrl !== currentUrl) window.history.replaceState(null, '', nextUrl);
  }

  const counts = useMemo(() => computeBriefCounts(groups), [groups]);
  const verdict = useMemo(() => buildBriefVerdict(groups, counts), [groups, counts]);
  // HYD-10: the relative scan time reads the clock, which differs between the
  // server render and hydration. Render a clock-free label first, then fill
  // in the elapsed time after mount and keep it current once a minute.
  const [nowTs, setNowTs] = useState<number | null>(null);
  useEffect(() => {
    setNowTs(Date.now());
    const id = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const lastScanLabel = useMemo(
    () => formatRelativeScanTime(scannedAt, nowTs === null ? null : new Date(nowTs)),
    [scannedAt, nowTs],
  );
  const categories = useMemo(() => distinctCategories(groups), [groups]);
  const filteredGroups = useMemo(() => filterGroupSignals(groups, queueFilter), [groups, queueFilter]);
  const selectedEntry = useMemo(() => findSignalInGroups(groups, selectedSignalId), [groups, selectedSignalId]);
  // Keep the desktop dossier useful on first load instead of dedicating half
  // the Lab to an empty placeholder. The URL stays unselected, so a phone
  // still opens on the queue and keyboard focus stays predictable.
  const defaultEntry = useMemo(() => {
    const group = groups.find((candidate) => candidate.signals.length > 0);
    const signal = group?.signals[0];
    return signal && group ? { group, signal } : null;
  }, [groups]);
  const dossierEntry = selectedEntry ?? defaultEntry;

  const avatarByPlayerId = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const player of rosterPlayers) map[player.id] = player.avatar_url ?? null;
    return map;
  }, [rosterPlayers]);

  // Related context for the dossier, derived from data this desk already has.
  const dossierPlayerId = dossierEntry?.group.playerId ?? null;
  const dossierPlayerFocusAreas = useMemo(
    () => (dossierPlayerId ? playersDrillProps.focusAreas.filter((fa) => fa.player_id === dossierPlayerId) : []),
    [dossierPlayerId, playersDrillProps.focusAreas],
  );
  const dossierPlayerGoals = dossierPlayerId ? (playersDrillProps.goalsByPlayer?.[dossierPlayerId] ?? []) : [];
  const dossierPlayerStats: PlayersGridStats | null = dossierPlayerId
    ? (playersDrillProps.playerStats[dossierPlayerId] ?? null)
    : null;
  const dossierRollupContributors: RollupContributor[] = useMemo(
    () =>
      rollupContributorsFor(groups, dossierEntry?.signal).map((c) => ({
        ...c,
        avatarUrl: avatarByPlayerId[c.playerId] ?? null,
      })),
    [groups, dossierEntry, avatarByPlayerId],
  );

  const liveSignalCount = useMemo(
    () => groups.reduce((n, g) => n + g.signals.filter((s) => s.kind !== 'team_synthesis').length, 0),
    [groups],
  );

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
          fairwayToast.success('Scan complete, team signals refreshed.');
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
    // A roster roll-up has no row behind it: its id is a synthetic
    // `team:<metric>` minted by synthesizeTeamSignals. Sending that to the
    // server would hit an id that does not exist and optimistically remove a
    // card that comes straight back on refresh.
    if (signal.kind === 'team_synthesis') return;
    if (pendingIds.has(signal.id)) return;
    setPendingIds((prev) => new Set(prev).add(signal.id));
    // Snapshot for THIS signal only. On failure it is re-inserted into the
    // current groups (DATA-12): restoring the whole snapshot would resurrect
    // any signal another action or a refresh removed in the meantime.
    const prevGroups = groups;
    const rollback = () => setGroups((current) => restoreSignalToGroups(current, prevGroups, signal.id));
    setGroups((current) => removeSignalFromGroups(current, signal.id));
    if (selectedSignalId === signal.id) navigate({ signal: null });

    try {
      const res = await action(signal.id, signal.kind);
      if (!res.success) {
        rollback();
        fairwayToast.error(res.error ?? 'Could not update the signal. Try again.');
        return;
      }
      fairwayToast.success(successLabel);
      router.refresh();
    } catch {
      rollback();
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
    // The coach stays in The Lab: the focus-area modal has already confirmed
    // the save, and the next signal is the next job. The refresh re-reads the
    // focus area this mutation created (it shows in the player's related
    // context) and the queue without the promoted signal.
    setGroups((prev) => removeSignalFromGroups(prev, signal.id));
    if (selectedSignalId === signal.id) navigate({ signal: null });
    router.refresh();
  }

  // A stale bookmark (or a signal reviewed in another tab) can leave a
  // `?signal=` that no longer resolves. On narrow screens the queue is hidden
  // whenever a detail is open, so key this off the resolved entry, not the
  // raw URL param, or an invalid deep link strands the coach on an empty
  // dossier with no Back control.
  const isSignalSelected = Boolean(selectedEntry);

  // On a phone the Lab is list OR detail. Opening a signal from deep in the
  // queue would otherwise leave the coach scrolled past the dossier's top.
  const labTopRef = useRef<HTMLElement | null>(null);
  const previousSelectionRef = useRef<string | null>(selectedSignalId);
  useEffect(() => {
    const previous = previousSelectionRef.current;
    previousSelectionRef.current = selectedSignalId;
    if (!selectedSignalId || selectedSignalId === previous) return;
    if (typeof window === 'undefined' || window.matchMedia?.('(min-width: 940px)').matches !== false) return;
    const top = labTopRef.current;
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView?.({ block: 'start' });
  }, [selectedSignalId]);

  const retry = (
    <Button
      variant="secondary"
      size="sm"
      leftIcon={<RotateCw className="h-4 w-4" aria-hidden />}
      onClick={() => router.refresh()}
    >
      Try again
    </Button>
  );

  const scanButton = (
    <Button
      variant="secondary"
      size="sm"
      busy={isScanning}
      leftIcon={<ScanSearch className="h-4 w-4" aria-hidden />}
      onClick={handleScan}
      aria-label={isScanning ? 'Scanning the team for new signals' : 'Scan the team for new signals'}
    >
      {isScanning ? 'Scanning' : 'Scan team'}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div ref={switchRowRef} className="flex items-center">
        <ViewSwitch
          view={view}
          hrefFor={(next) => hrefFor({ view: next, signal: null })}
          onSelect={(next) => navigate({ view: next, signal: null })}
        />
      </div>

      <div ref={viewRegionRef} data-triage-view-region className="flex flex-col gap-6">
        {view === 'home' ? (
          <>
            {homeLead}

            {categoryInsights.success && categoryInsights.data ? (
              <TeamBleedBoard
                categories={categoryInsights.data.categories}
                teamHealth={categoryInsights.data.teamHealth}
              />
            ) : (
              <InlineNotice tone="danger" title="Couldn't load where the team is bleeding strokes" action={retry}>
                {categoryInsights.error ?? 'The area breakdown did not load. The rest of the page is unaffected.'}
              </InlineNotice>
            )}

            <TeamShotWeaknesses data={teamShotAnalysis} unavailable={overviewFailed} />

            {groupsError ? (
              <InlineNotice tone="danger" title="Couldn't load the game pressure map" action={retry}>
                {groupsError}
              </InlineNotice>
            ) : liveSignalCount > 0 ? (
              <TeamSignalSummary
                groups={groups}
                categoryHref={(category) => hrefFor({ view: 'lab', filter: `category:${category}`, signal: null })}
                onOpenCategory={(category) => navigate({ view: 'lab', filter: `category:${category}`, signal: null })}
              />
            ) : (
              <section
                aria-labelledby="pressure-map-empty-heading"
                className="flex flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft"
              >
                <div className="fw-plinth-green flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <h2 id="pressure-map-empty-heading" className="font-fw-sans text-h3 font-semibold text-text-primary">
                    Game pressure map
                  </h2>
                </div>
                <div className="p-4 sm:p-5">
                  <EmptyState
                    variant="subtle"
                    title="No open signals"
                    description="Nothing is open across the team right now. Scan the team after new rounds come in."
                    action={scanButton}
                  />
                </div>
              </section>
            )}
          </>
        ) : null}

        {view === 'lab' ? (
          <section
            ref={labTopRef}
            aria-labelledby="the-lab-heading"
            className="flex scroll-mt-[calc(var(--golf-mobile-header-offset,4rem)+0.75rem)] flex-col gap-4"
          >
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
              <div className="min-w-0">
                <h1
                  id="the-lab-heading"
                  className="font-fw-display text-h2 font-semibold tracking-[-0.02em] text-text-primary"
                >
                  The Lab
                </h1>
                {/* The verdict reads "All clear" off an empty list; a failed read
                    is not an empty one. */}
                {!groupsError ? (
                  <p className="mt-1 max-w-2xl font-fw-sans text-body-sm text-text-secondary">{verdict}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">{lastScanLabel}</span>
                {scanButton}
              </div>
            </div>

            {groupsError ? (
              <InlineNotice tone="danger" title="Couldn't load signals" action={retry}>
                {groupsError}
              </InlineNotice>
            ) : groups.length === 0 ? (
              <div className="rounded-fw-lg border border-border-subtle bg-surface p-6 shadow-soft">
                <EmptyState
                  title="All clear"
                  description="No open signals right now. Scan the team after new rounds come in."
                />
              </div>
            ) : (
              <div
                className={cn(
                  'grid grid-cols-1 gap-4 min-[940px]:grid-cols-[minmax(0,380px)_minmax(0,1fr)]',
                  LAB_SPLIT,
                )}
              >
                <div className={cn('min-w-0 min-[940px]:min-h-0', isSignalSelected && 'hidden min-[940px]:block')}>
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
                    returnSignalId={returnSignalId}
                    avatarByPlayerId={avatarByPlayerId}
                  />
                </div>
                <div className={cn('min-w-0 min-[940px]:min-h-0', !isSignalSelected && 'hidden min-[940px]:block')}>
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
                    playerAvatarUrl={dossierPlayerId ? (avatarByPlayerId[dossierPlayerId] ?? null) : null}
                    rollupContributors={dossierRollupContributors}
                  />
                </div>
              </div>
            )}
          </section>
        ) : null}

        {chatOpened ? (
          <section aria-labelledby="chat-heading" className={cn(view !== 'chat' && 'hidden')} data-triage-chat>
            <h1 id="chat-heading" className="sr-only">
              Chat with CoachHelm
            </h1>
            {chatPanel ?? (
              <InlineNotice tone="warning" title="Chat is unavailable">
                CoachHelm could not load your program context. Try again in a moment.
              </InlineNotice>
            )}
          </section>
        ) : null}

        {view === 'players' ? (
          <section aria-labelledby="players-heading" className="flex flex-col gap-4">
            <div>
              <h1
                id="players-heading"
                className="font-fw-display text-h2 font-semibold tracking-[-0.02em] text-text-primary"
              >
                Players
              </h1>
              <p className="mt-1 font-fw-sans text-body-sm text-text-secondary">
                Assign and track measurable development focus areas across your roster.
              </p>
            </div>
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
          </section>
        ) : null}
      </div>
    </div>
  );
}
