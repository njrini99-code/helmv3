'use client';

/**
 * ============================================================================
 * TriageDesk — the coach Intelligence field sheet (`/golf/dashboard/intelligence`)
 * ----------------------------------------------------------------------------
 * Rebuilt to docs/design/fairway-facelift/LANGUAGE.md and its screen spec
 * `screens/intelligence.v3.md`. The page answers one question — where is the
 * team bleeding strokes, and who needs the coach first — and it answers it in
 * the four regions the language defines:
 *
 *   1. Masthead, bare on the canvas: scan freshness as the eyebrow, the
 *      surface name as the title, one honest verdict sentence with real links.
 *   2. The stage, the ONE Surface: the leak rail (every raw signal category
 *      ranked by strokes at risk) with the severity mix as its legend and four
 *      readouts in a right-hand rail from xl.
 *   3. The ledger row, three bare hairline-divided columns: Queue, Players,
 *      Focus areas.
 *   4. The dense Signals table, with the selected signal's drill panel below it.
 *
 * ── WHAT THIS REPLACED ─────────────────────────────────────────────────────
 * The green `Spine` (identity / hero / priorities / five-row ledger / urgent
 * block), the `ResizableWorkspace` three-pane queue | dossier | CoachHelm
 * layout with its persisted layout key, the permanently docked
 * `SignalInsightPanel`, the bordered `SignalQueue`, and `TeamCategoryLeakBand`
 * (built on the five fixed `TeamCategory` buckets, a different taxonomy from
 * the raw `GroupedSignal.category` the Toolbar's own Category filter uses — the
 * two disagreed on what "category" meant). Every real fact the Spine carried
 * survives: open signals, players flagged and outcomes awaiting are readouts,
 * last scan is both the eyebrow and a readout, focus areas active is the third
 * ledger column's count, and the urgent signal is the first Queue row.
 *
 * ── NO CLIENT-MEASURED WIDTH ───────────────────────────────────────────────
 * `isDesktopSpine` / `isWideWorkspace` (`useMediaQuery`) are gone with the
 * components they gated. Every phone/desktop split on this screen is a CSS
 * class or a primitive's own responsive behavior, so the server and the
 * client's first paint render identical markup.
 *
 * ── NO CLOCK READ ──────────────────────────────────────────────────────────
 * `now` is a server-seeded ISO string. It is the only timestamp this screen
 * formats, through `formatRelativeScanTime`, and no `new Date()`/`Date.now()`
 * call happens during a render.
 *
 * `groups` is still seeded from the server fetch and re-synced whenever it
 * changes; every mutation is optimistic-with-rollback on top of that copy.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { MessageCircle, MoreHorizontal, RotateCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, fairwayToast, InlineNotice, PlayersGridView, Surface } from '@/components/fairway';
import { surfaceHref, surfaceName } from '@/lib/golf/surface-registry';
import type { PlayersGridViewProps, FairwayEffectivenessProps, PlayersGridStats } from '@/components/fairway';
import { IconButton } from '@/components/fairway/controls/button';
import { Menu } from '@/components/fairway/overlays/Menu';
import { Toolbar } from '@/components/fairway/controls/Toolbar';
import { DrillPanel } from '@/components/fairway/modules/DrillPanel';
import {
  FieldReadouts,
  SectionHead,
  VerdictLine,
  type ReadoutItem,
} from '@/components/fairway/pages/dashboard/coach-home-parts';
import { refreshTeamAnalysisAsCoach } from '@/app/golf/actions/insights';
import { reviewSignal, dismissSignal } from '@/app/golf/actions/signal-groups';
import type { TeamCategoryInsightsResult } from '@/app/golf/actions/team-category-insights';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { ViewSwitch } from './ViewSwitch';
import { SignalDossier } from './SignalDossier';
import { EffectivenessScoreboard } from './EffectivenessScoreboard';
import { summarizeAdoption } from './buildEffectivenessScoreboard';
import {
  computeBriefCounts,
  countForFilter,
  distinctCategories,
  filterGroupSignals,
  findSignalInGroups,
  formatCategoryLabel,
  formatRelativeScanTime,
  removeSignalFromGroups,
  resolveQueueFilter,
  resolveTriageView,
} from './buildTriageViewModel';
import {
  activeFocusCount,
  aggregateCategoryLeaks,
  buildIntelligenceVerdict,
  buildLeakField,
  compactScanAge,
  filterLabel,
  focusRows,
  openSignalCount,
  playerRows,
  queueEntries,
  queueSignalCount,
  rollupCount,
  severityMix,
  tableEntries,
  TABLE_PAGE_SIZE,
} from './intelligence-logic';
import {
  FocusLedgerRow,
  LedgerColumn,
  LedgerEmpty,
  LeakRail,
  PlayerLedgerRow,
  QueueLedgerRow,
  SeverityLegend,
  SignalsTable,
} from './intelligence-parts';

type TriageNavigationUpdates = Partial<{
  view: string;
  filter: string | null;
  signal: string | null;
  player: string | null;
  playersTab: 'roster' | 'areas' | null;
}>;

export interface TriageDeskProps {
  coachId: string;
  groups: SignalGroup[];
  scannedAt: string | null;
  /** Non-null when `getSignalGroups` itself failed — a distinct state from a
   *  genuinely empty (all-clear) queue, rendered as an honest retry notice. */
  groupsError: string | null;
  /**
   * Retained on the contract because `page.tsx` and `CoachIntelligenceHome`
   * still fetch and thread it. Nothing on this screen renders it any more:
   * `TeamCategoryLeakBand` was built on the five fixed `TeamCategory` buckets,
   * a taxonomy the stage's own category rail and the Toolbar's Category filter
   * do not share, so the two disagreed on what "category" meant. Removing the
   * prop is a loader change that belongs with the loader, not here.
   */
  categoryInsights: TeamCategoryInsightsResult;
  /** Kept for the same reason: the retired Spine's identity line used it. */
  teamName: string;
  /**
   * A server-seeded ISO timestamp (`page.tsx`'s one-time
   * `new Date().toISOString()`, computed during the server render) — used ONLY
   * to FORMAT the relative "last scan" caption. Parsing a fixed value handed
   * down as a prop is not the same thing as reading the ambient clock during a
   * client re-render: no `new Date()`/`Date.now()` call happens here.
   */
  now: string;
  playersDrillProps: PlayersGridViewProps;
  /** Same SSR-fetched shape the retired cockpit consumed — `EffectivenessScoreboard`
   *  only reads its `initialOverview`/`initialEffectiveness`/`initialPerformance` fields. */
  effectivenessDrillProps: FairwayEffectivenessProps;
}

const OVERLINE = 'font-fw-sans text-eyebrow uppercase tracking-[0.07em] text-text-tertiary';

export function TriageDesk({
  coachId,
  groups: initialGroups,
  scannedAt,
  groupsError,
  now,
  playersDrillProps,
  effectivenessDrillProps,
}: TriageDeskProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rosterPlayers = playersDrillProps.players ?? [];

  const requestedView = resolveTriageView(searchParams.get('view'));
  const requestedQueueFilter = resolveQueueFilter(searchParams.get('filter'));
  // `signal` is the canonical param this desk writes; `id` is the legacy
  // insight deep-link CommandPalette.tsx:326 and FocusAreaCard.tsx:315 still
  // push (`?id=<insightId>`, forwarded here by the /insights redirect shim).
  // Both key off the same raw `golf_coach_insights`/`golf_patterns_v2` id
  // (signal-groups.ts's `id: row.id`), so falling back to `id` re-opens the
  // drill for that exact insight instead of landing on an empty selection.
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
  const [tableVisible, setTableVisible] = useState(TABLE_PAGE_SIZE);

  useEffect(() => setView(requestedView), [requestedView]);
  useEffect(() => setQueueFilter(requestedQueueFilter), [requestedQueueFilter]);
  useEffect(() => setSelectedSignalId(requestedSignalId), [requestedSignalId]);
  useEffect(() => setSelectedPlayerId(validRequestedPlayerId), [validRequestedPlayerId]);
  useEffect(() => setPlayersTab(requestedPlayersTab), [requestedPlayersTab]);
  // A narrowed list is a different list. Collapsing back to the first page on
  // every filter change keeps "View all N" honest about what N counts.
  useEffect(() => setTableVisible(TABLE_PAGE_SIZE), [queueFilter]);

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
    if (updates.view !== undefined) {
      const targetView = resolveTriageView(updates.view);
      params.set('view', targetView);
      if (targetView === 'signals') {
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
      // `id` is the legacy one-shot deep-link param (CommandPalette.tsx:326,
      // FocusAreaCard.tsx:315) the drill falls back to above — consume it on
      // the first signal navigation so `onBack`'s `navigate({ signal: null })`
      // actually closes the drill instead of re-resolving `id`.
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

    setView(resolveTriageView(next.searchParams.get('view')));
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

  /* ── Derivations ──────────────────────────────────────────────────────── */

  const counts = useMemo(() => computeBriefCounts(groups), [groups]);
  const categories = useMemo(() => distinctCategories(groups), [groups]);
  const filteredGroups = useMemo(() => filterGroupSignals(groups, queueFilter), [groups, queueFilter]);
  const selectedEntry = useMemo(() => findSignalInGroups(groups, selectedSignalId), [groups, selectedSignalId]);

  // The stage always ranks the FULL set. A category filter narrows the queue
  // and the table beneath it; narrowing the rail too would collapse the
  // ranking to the one row that was just clicked.
  const leakField = useMemo(() => buildLeakField(aggregateCategoryLeaks(groups)), [groups]);
  const mix = useMemo(() => severityMix(groups), [groups]);
  const triageable = useMemo(() => queueSignalCount(groups), [groups]);
  const openCount = useMemo(() => openSignalCount(groups), [groups]);
  const rollups = useMemo(() => rollupCount(groups), [groups]);
  const queueRows = useMemo(() => queueEntries(filteredGroups), [filteredGroups]);
  const flaggedPlayers = useMemo(() => playerRows(filteredGroups), [filteredGroups]);
  const allTableRows = useMemo(() => tableEntries(filteredGroups), [filteredGroups]);
  const tableRows = allTableRows.slice(0, tableVisible);
  const tableTotal = useMemo(() => countForFilter(groups, queueFilter), [groups, queueFilter]);
  const activeFilterLabel = filterLabel(queueFilter);

  // Memoized rather than defaulted inline: a fresh `[]` on every render would
  // invalidate the three memos below it on every render too.
  const focusAreas = useMemo(() => playersDrillProps.focusAreas ?? [], [playersDrillProps.focusAreas]);
  const focusLedger = useMemo(
    () => focusRows(focusAreas, playersDrillProps.playerNameById),
    [focusAreas, playersDrillProps.playerNameById],
  );
  const focusCount = useMemo(() => activeFocusCount(focusAreas), [focusAreas]);
  const focusError = playersDrillProps.loadError ?? null;

  const adoption = useMemo(
    () => summarizeAdoption(effectivenessDrillProps.initialEffectiveness),
    [effectivenessDrillProps.initialEffectiveness],
  );
  const outcomesAwaiting = Math.max(0, adoption.generated - adoption.actedUpon);

  // `now` is a server-seeded ISO string, not a live clock read — see the `now`
  // prop doc above.
  const lastScanLabel = useMemo(() => formatRelativeScanTime(scannedAt, new Date(now)), [scannedAt, now]);

  const verdictParts = useMemo(
    () =>
      buildIntelligenceVerdict({
        groupsError,
        groups,
        counts,
        outcomesAwaiting,
        filterHref: (filter) => hrefFor({ filter: filter === 'all' ? null : filter }),
        playerHref: (playerId) => `/golf/dashboard/roster/${playerId}`,
        effectivenessHref: hrefFor({ view: 'effectiveness' }),
      }),
    // `hrefFor` reads the live query string on purpose and is re-created every
    // render; the query snapshot it depends on is `searchParams`, which IS in
    // the list below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupsError, groups, counts, outcomesAwaiting, searchParams],
  );

  const readouts: ReadoutItem[] = useMemo(
    () => [
      {
        key: 'open',
        label: 'Open signals',
        // A failed read is not a zero. `groups` is `[]` on that path for a
        // reason unrelated to how many signals exist, so this prints nothing.
        value: groupsError ? null : String(openCount),
        note: groupsError
          ? 'Could not be read'
          : rollups > 0
            ? `includes ${rollups} team roll-up${rollups === 1 ? '' : 's'}`
            : 'fewer is better',
      },
      {
        key: 'flagged',
        label: 'Players flagged',
        value: groupsError ? null : String(counts.playersFlagged),
        note: groupsError ? 'Could not be read' : 'fewer is better',
      },
      {
        // Reads `getInsightEffectiveness`, wholly independent of
        // `getSignalGroups` — it stays correct while the signals read is down.
        key: 'outcomes',
        label: 'Outcomes awaiting',
        value: String(outcomesAwaiting),
        note: 'a resolved result',
      },
      {
        // `getSignalGroups`'s own failure path returns `scannedAt: null`
        // explicitly, so "Never" during a load failure is an honest read of a
        // real null rather than a fabrication.
        key: 'scan',
        label: 'Last scan',
        value: compactScanAge(lastScanLabel),
        note: 'more recent is better',
      },
    ],
    [groupsError, openCount, rollups, counts.playersFlagged, outcomesAwaiting, lastScanLabel],
  );

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const openSignal = useCallback(
    (signalId: string) => navigate({ signal: signalId }),
    // `navigate` closes over the live query snapshot; re-create this callback
    // when that snapshot changes rather than on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchParams, pathname],
  );

  // A row clicked in the ledger sits well above the drill panel, which is
  // appended under the table. `block: 'nearest'` scrolls only when the panel
  // is genuinely off screen, so a table row that already sits beside it never
  // jumps the page.
  useEffect(() => {
    if (!selectedSignalId || typeof document === 'undefined') return;
    const panel = document.getElementById('signal-drill');
    // jsdom (and any environment without a layout engine) defines no
    // `scrollIntoView`, so this is a capability check, not defensive padding.
    if (typeof panel?.scrollIntoView === 'function') panel.scrollIntoView({ block: 'nearest' });
  }, [selectedSignalId]);

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
          fairwayToast.success('Scan complete. Team signals refreshed.');
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
    // does not exist, and optimistically remove a row that would come straight
    // back on refresh.
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
    // instead of dropping the coach back at the full roster.
    navigate({ view: 'players', signal: null, player: signal.playerId, playersTab: 'areas' });
    router.refresh();
  }

  function toggleQueueFilter(next: string) {
    navigate({ filter: queueFilter === next ? null : next });
  }

  const severityFilterSelected = queueFilter === 'urgent' ? ['urgent'] : [];
  const categoryFilterSelected =
    queueFilter === 'patterns' || queueFilter.startsWith('category:') ? [queueFilter] : [];

  /* ── The drill's related-context slices, straight from data this desk
       already has (`playersDrillProps`), no extra fetch. ─────────────────── */
  const drillPlayerId = selectedEntry?.group.playerId ?? null;
  const drillFocusAreas = useMemo(
    () => (drillPlayerId ? focusAreas.filter((fa) => fa.player_id === drillPlayerId) : []),
    [drillPlayerId, focusAreas],
  );
  const drillGoals = drillPlayerId ? (playersDrillProps.goalsByPlayer?.[drillPlayerId] ?? []) : [];
  const drillStats: PlayersGridStats | null = drillPlayerId
    ? (playersDrillProps.playerStats[drillPlayerId] ?? null)
    : null;

  const signalsNotice = (
    <InlineNotice
      tone="danger"
      title="Couldn't load signals"
      action={
        <Button variant="secondary" size="sm" onClick={() => router.refresh()}>
          Try again
        </Button>
      }
    >
      {groupsError}
    </InlineNotice>
  );

  return (
    <div className="flex w-full flex-col overflow-x-clip">
      {/* ── 1 · Masthead, bare on the canvas ───────────────────────────────── */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <p className={OVERLINE}>{lastScanLabel}</p>
          <div className="flex flex-wrap items-center gap-2">
            {/* The view control belongs to the PAGE, not the stage: Players and
                Effectiveness replace the whole field sheet. Leaving it above
                the table (where the spec drew it) would put the only route to
                those two views below the fold on every load. */}
            <ViewSwitch
              view={view}
              hrefFor={(next) => hrefFor({ view: next, signal: null })}
              onSelect={(next) => navigate({ view: next, signal: null })}
            />
            <Menu
              trigger={
                <IconButton aria-label="More options">
                  <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
                </IconButton>
              }
              align="end"
            >
              <Menu.Item icon={<RotateCw className="h-4 w-4" aria-hidden />} onSelect={() => router.refresh()}>
                Refresh
              </Menu.Item>
              <Menu.Item
                icon={<MessageCircle className="h-4 w-4" aria-hidden />}
                onSelect={() => router.push(surfaceHref('ask'))}
              >
                {surfaceName('ask')}
              </Menu.Item>
            </Menu>
            <Button variant="primary" busy={isScanning} disabled={isScanning} onClick={() => handleScan()}>
              <Sparkles className="h-4 w-4" aria-hidden />
              <span>Scan team</span>
            </Button>
          </div>
        </div>
        <h1 className="font-fw-display text-h1 text-text-primary md:text-display">{surfaceName('brief')}</h1>
        <VerdictLine parts={verdictParts} />
      </header>

      {isScanning ? (
        <div className="mt-6">
          <InlineNotice tone="info" title="Scanning the team">
            Refreshing signals. Nothing moves while this finishes.
          </InlineNotice>
        </div>
      ) : null}

      {view === 'signals' ? (
        <>
          {/* ── 2 · The stage, the one Surface ───────────────────────────── */}
          <Surface as="section" aria-label="Leak ranking" elevation="border" padding="none" className="mt-10 overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border-subtle px-5 py-4 md:px-6">
              <div className="flex min-w-0 flex-col gap-1">
                <p className={OVERLINE}>The team <span aria-hidden="true">·</span> by category</p>
                <h2 className="font-fw-display text-h2 text-text-primary">Leak ranking</h2>
                <p className="max-w-[64ch] font-fw-sans text-caption text-text-tertiary">
                  {leakField.allUnmeasured
                    ? 'No measured stroke impact yet, so this is ranked by signal count. Roster roll-ups are excluded: their strokes are already counted in the per-player rows.'
                    : `Open per-player signals summed by category. Bars run from zero; the second rule is the across-category mean${
                        leakField.meanStrokes != null ? `, ${leakField.meanStrokes.toFixed(1)} str/rd` : ''
                      }. Roster roll-ups are excluded: their strokes are already counted in the per-player rows.`}
                </p>
              </div>
              {groupsError ? null : (
                <SeverityLegend segments={mix} total={triageable} urgentHref={hrefFor({ filter: 'urgent' })} />
              )}
            </div>
            {/* A fixed rail beside a flexible instrument may not split before
                xl: at 1024 a 15rem readouts column leaves the rail about 70px
                of track. Below xl the four readouts sit as a band above it. */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_15rem] xl:divide-x xl:divide-border-subtle">
              <div className="order-2 min-w-0 px-5 py-5 md:px-6 xl:order-1">
                {groupsError ? (
                  signalsNotice
                ) : leakField.rows.length === 0 ? (
                  <p className="font-fw-sans text-body-sm text-text-tertiary">
                    {groups.length === 0
                      ? 'No open signals. Nothing to rank.'
                      : `No per-player leaks to rank. ${rollups} team-level ${rollups === 1 ? 'signal' : 'signals'} in the table below.`}
                  </p>
                ) : (
                  <>
                    <LeakRail
                      field={leakField}
                      hrefForCategory={(category) => hrefFor({ filter: `category:${category}` })}
                      ariaLabel="Strokes at risk by category"
                    />
                    {leakField.overflow > 0 ? (
                      <p className="mt-3 font-fw-sans text-caption text-text-tertiary">
                        {leakField.overflow} more {leakField.overflow === 1 ? 'category' : 'categories'} sit below the top eight. Every signal in them is still in the table.
                      </p>
                    ) : null}
                  </>
                )}
              </div>
              <div className="order-1 border-b border-border-subtle px-5 py-4 md:px-6 md:py-5 xl:order-2 xl:border-b-0">
                <FieldReadouts items={readouts} />
              </div>
            </div>
          </Surface>

          {/* ── 3 · The ledger row ───────────────────────────────────────── */}
          {/* Even thirds at xl, unequal 5/3/4 only from 2xl. At 1280 a 3-span
              column is about 290px, which clips a full player name and a focus
              area title alike. The unequal split is the intended reading
              rhythm, but rhythm loses to whole words. */}
          <div className="mt-12 grid grid-cols-1 gap-y-10 md:grid-cols-2 md:gap-x-8 xl:grid-cols-12 xl:gap-x-0 xl:gap-y-0 xl:divide-x xl:divide-border-subtle">
            {groupsError ? null : (
              <>
                <LedgerColumn
                  id="ledger-queue"
                  title="Queue"
                  count={triageable}
                  className="xl:col-span-4 xl:pr-8 2xl:col-span-5"
                >
                  {queueRows.length === 0 ? (
                    <LedgerEmpty>
                      {groups.length === 0
                        ? 'All clear. No open signals.'
                        : rollups > 0 && triageable === 0
                          ? `No player-level signals. ${rollups} team-level ${rollups === 1 ? 'signal' : 'signals'} below.`
                          : 'No signals match this filter.'}
                    </LedgerEmpty>
                  ) : (
                    queueRows.map((entry) => (
                      <QueueLedgerRow key={entry.signal.id} entry={entry} onOpen={() => openSignal(entry.signal.id)} />
                    ))
                  )}
                </LedgerColumn>

                <LedgerColumn
                  id="ledger-players"
                  title="Players"
                  count={counts.playersFlagged}
                  className="xl:col-span-4 xl:px-8 2xl:col-span-3"
                >
                  {flaggedPlayers.length === 0 ? (
                    <LedgerEmpty>No players flagged.</LedgerEmpty>
                  ) : (
                    flaggedPlayers.map((row) => (
                      <PlayerLedgerRow key={row.playerId} row={row} href={`/golf/dashboard/roster/${row.playerId}`} />
                    ))
                  )}
                </LedgerColumn>
              </>
            )}

            {/* Focus areas reads `playersDrillProps`, not `getSignalGroups`.
                It keeps rendering — with its OWN failure state — while the
                signals read is down, because blanking successfully-loaded data
                is the mirror image of the bug the notice above exists to fix. */}
            <LedgerColumn
              id="ledger-focus"
              title="Focus areas"
              count={focusError ? null : focusCount}
              className={cn(
                'md:col-span-2',
                groupsError ? 'xl:col-span-12' : 'xl:col-span-4 xl:pl-8 2xl:col-span-4',
              )}
            >
              {focusError ? (
                <InlineNotice
                  tone="warning"
                  title="Couldn't load focus areas"
                  action={
                    <Button variant="secondary" size="sm" onClick={() => router.refresh()}>
                      Try again
                    </Button>
                  }
                >
                  {focusError}
                </InlineNotice>
              ) : focusLedger.length === 0 ? (
                <LedgerEmpty>No active focus areas.</LedgerEmpty>
              ) : (
                focusLedger.map((row) => (
                  <FocusLedgerRow
                    key={row.id}
                    row={row}
                    onOpen={() =>
                      navigate({ view: 'players', player: row.playerId, playersTab: 'areas', signal: null })
                    }
                  />
                ))
              )}
            </LedgerColumn>
          </div>

          {/* ── 4 · The table ────────────────────────────────────────────── */}
          {groupsError ? null : (
            <section id="signals-table" aria-label="Signals" className="mt-12 flex flex-col gap-3">
              {/* The heading names the active filter whenever one is set, so
                  its count and the unfiltered "Open signals" readout above can
                  never carry the same caption while showing different numbers. */}
              <SectionHead
                title={activeFilterLabel ? `Signals · ${activeFilterLabel}` : 'Signals'}
                count={tableTotal}
              />
              <Toolbar
                aria-label="Filter signals"
                filters={
                  <>
                    <Toolbar.FilterMenu
                      label="Severity"
                      options={[{ value: 'urgent', label: 'Urgent' }]}
                      selected={severityFilterSelected}
                      onToggle={toggleQueueFilter}
                      onClear={() => navigate({ filter: null })}
                    />
                    <Toolbar.FilterMenu
                      label="Category"
                      options={[
                        { value: 'patterns', label: 'Patterns' },
                        ...categories.map((category) => ({
                          value: `category:${category}`,
                          label: formatCategoryLabel(category),
                        })),
                      ]}
                      selected={categoryFilterSelected}
                      onToggle={toggleQueueFilter}
                      onClear={() => navigate({ filter: null })}
                    />
                  </>
                }
              />
              {allTableRows.length === 0 ? (
                <p className="px-0.5 py-1 font-fw-sans text-body-sm text-text-tertiary">
                  {groups.length === 0 ? 'All clear. No open signals.' : 'No signals match this filter.'}
                </p>
              ) : (
                <>
                  <SignalsTable entries={tableRows} selectedSignalId={selectedSignalId} onOpen={openSignal} />
                  {allTableRows.length > tableRows.length ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="self-start"
                      onClick={() => setTableVisible((n) => n + TABLE_PAGE_SIZE)}
                    >
                      View all {tableTotal}
                    </Button>
                  ) : null}
                </>
              )}

              {selectedEntry ? (
                <div id="signal-drill" className="mt-4 scroll-mt-6">
                  <DrillPanel
                    title={selectedEntry.signal.title}
                    backLabel="All signals"
                    onBack={() => navigate({ signal: null })}
                  >
                    <SignalDossier
                      entry={selectedEntry}
                      coachId={coachId}
                      pending={pendingIds.has(selectedEntry.signal.id)}
                      onReview={handleReview}
                      onDismiss={handleDismiss}
                      onPromoted={handlePromoted}
                      onSelectSignal={openSignal}
                      playerFocusAreas={drillFocusAreas}
                      playerGoals={drillGoals}
                      playerStats={drillStats}
                    />
                  </DrillPanel>
                </div>
              ) : null}
            </section>
          )}
        </>
      ) : null}

      {view === 'players' ? (
        <div className="mt-10">
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
        </div>
      ) : null}
      {view === 'effectiveness' ? (
        <div className="mt-10">
          <EffectivenessScoreboard
            initialOverview={effectivenessDrillProps.initialOverview}
            initialEffectiveness={effectivenessDrillProps.initialEffectiveness}
            initialPerformance={effectivenessDrillProps.initialPerformance}
          />
        </div>
      ) : null}
    </div>
  );
}
