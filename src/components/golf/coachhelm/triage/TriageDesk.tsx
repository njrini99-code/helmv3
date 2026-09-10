'use client';

/**
 * ============================================================================
 * TriageDesk — the CoachHelm cockpit + Signals workspace (Fairway Premium
 * Facelift, `/golf/dashboard/intelligence`)
 * ----------------------------------------------------------------------------
 * The ONE composition root for the coach `/dashboard/intelligence` page: a
 * `ViewHeader`, a deep-green `Spine` (identity, pulse, the one urgent signal,
 * top priorities, a ledger, "Ask CoachHelm"), and — on the right — the
 * workspace: a frost `Toolbar` (Signals/Players/Effectiveness view switch +
 * Severity/Category filters), the team leak band as ONE row, and either the
 * Signals `ResizableWorkspace` (queue | dossier | CoachHelm), the unchanged
 * `PlayersGridView` embed, or the `EffectivenessScoreboard`.
 *
 * Reads `view`/`filter`/`signal` from `useSearchParams()` directly (same
 * self-contained pattern `StageRouter` used) rather than threading them down
 * as server props — there is no separate "home" view to fall back to
 * anymore, so there is nothing for a server-resolved prop to buy here.
 *
 * `groups` is seeded from the server fetch and re-synced whenever it changes
 * (a `router.refresh()` after Scan team / a mutation re-runs
 * `getSignalGroups` server-side and flows a fresh array back down) — every
 * mutation below is optimistic-with-rollback on top of that local copy. The
 * Spine reads from this SAME local `groups` state (not a separate copy), so
 * dismissing/reviewing the one urgent signal updates the Spine in the same
 * render frame.
 * ========================================================================== */

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { MessageCircle, MoreHorizontal, RotateCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, fairwayToast, InlineNotice, PlayersGridView } from '@/components/fairway';
import { surfaceHref, surfaceName } from '@/lib/golf/surface-registry';
import type { PlayersGridViewProps, FairwayEffectivenessProps, PlayersGridStats } from '@/components/fairway';
import { useMediaQuery } from '@/hooks/use-media-query';
import { ViewHeader } from '@/components/fairway/view-header/view-header';
import { IconButton } from '@/components/fairway/controls/button';
import { Menu } from '@/components/fairway/overlays/Menu';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Toolbar } from '@/components/fairway/controls/Toolbar';
import { Spine } from '@/components/fairway/modules/Spine';
import type { PriorityItem } from '@/components/fairway/modules/types';
import { ResizableWorkspace } from '@/components/fairway/modules/ResizableWorkspace';
import { refreshTeamAnalysisAsCoach } from '@/app/golf/actions/insights';
import { reviewSignal, dismissSignal } from '@/app/golf/actions/signal-groups';
import type { TeamCategoryInsightsResult } from '@/app/golf/actions/team-category-insights';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { TeamCategoryLeakBand } from '@/components/fairway/pages/coachhelm/TeamCategoryLeakBand';
import { ViewSwitch } from './ViewSwitch';
import { SignalQueue } from './SignalQueue';
import { SignalDossier } from './SignalDossier';
import { SignalInsightPanel } from './SignalInsightPanel';
import { EffectivenessScoreboard } from './EffectivenessScoreboard';
import { summarizeAdoption } from './buildEffectivenessScoreboard';
import {
  buildSpineVerdict,
  computeBriefCounts,
  distinctCategories,
  filterGroupSignals,
  findSignalInGroups,
  formatCategoryLabel,
  formatRelativeScanTime,
  removeSignalFromGroups,
  resolveQueueFilter,
  resolveTriageView,
  severityLabel,
} from './buildTriageViewModel';

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
  /** "Where the team is bleeding strokes" band data — categories[] +
   *  teamHealth from `getTeamCategoryInsights`. Rendered above the workspace
   *  so it's visible regardless of which sub-view the coach is on; silently
   *  omitted (not an error banner) when the fetch failed, mirroring how the
   *  other best-effort extras on this page degrade. */
  categoryInsights: TeamCategoryInsightsResult;
  /** The Spine's identity-line team name. Falls back to a neutral label when
   *  the CoachHelm chat context (`command`) couldn't be resolved. */
  teamName: string;
  /**
   * A server-seeded ISO timestamp (`page.tsx`'s one-time
   * `new Date().toISOString()`, computed during the server render) — used
   * ONLY to FORMAT the Spine's identity-line date and `SignalDossier`'s
   * relative-scan caption. Parsing a fixed value handed down as a prop is
   * not the same thing as reading the ambient clock during a client
   * re-render — no `new Date()`/`Date.now()` call happens here.
   */
  now: string;
  playersDrillProps: PlayersGridViewProps;
  /** Same SSR-fetched shape the retired cockpit consumed — `EffectivenessScoreboard`
   *  only reads its `initialOverview`/`initialEffectiveness`/`initialPerformance` fields. */
  effectivenessDrillProps: FairwayEffectivenessProps;
}

/** Fixed month+day format for the Spine's identity line — a plain
 *  presentation formatter over an already-known timestamp, not a clock read. */
function formatSpineDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  } catch {
    return '';
  }
}

export function TriageDesk({
  coachId,
  groups: initialGroups,
  scannedAt,
  groupsError,
  categoryInsights,
  teamName,
  now,
  playersDrillProps,
  effectivenessDrillProps,
}: TriageDeskProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rosterPlayers = playersDrillProps.players ?? [];
  // 940px matches the app-wide spine/stage stacking threshold (MatrixBoard,
  // StatsSpineStage) — the Spine stacks above the workspace below it, and
  // collapses its priorities/ledger rows per the phone composition.
  const isDesktopSpine = useMediaQuery('(min-width: 940px)');
  // Below 2xl three panes leave the dossier ~500px wide at 1440 (the leak
  // band's fourth column landed in the scroll fade). The inspector starts
  // collapsed there — one chevron brings it back, and that choice persists.
  const isWideWorkspace = useMediaQuery('(min-width: 1536px)');

  const requestedView = resolveTriageView(searchParams.get('view'));
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
  // "Ask CoachHelm" — opens the right (CoachHelm) pane's own sheet on phone;
  // a no-op on desktop, where that pane is already docked and visible.
  const [askOpen, setAskOpen] = useState(false);

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

  const counts = useMemo(() => computeBriefCounts(groups), [groups]);
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
  const isAllClear = !groupsError && groups.length === 0;

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

  // ── Spine content ─────────────────────────────────────────────────────
  const adoption = useMemo(
    () => summarizeAdoption(effectivenessDrillProps.initialEffectiveness),
    [effectivenessDrillProps.initialEffectiveness],
  );
  const outcomesAwaiting = Math.max(0, adoption.generated - adoption.actedUpon);
  const activeFocusAreaCount = playersDrillProps.focusAreas.filter(
    (fa) => fa.status === 'active' || fa.status === 'in_progress',
  ).length;
  const roundsLogged = Object.values(playersDrillProps.playerStats ?? {}).reduce(
    (sum, stats) => sum + (stats?.rounds_played ?? 0),
    0,
  );
  const spineVerdict = useMemo(
    () => buildSpineVerdict(groups, counts, outcomesAwaiting),
    [groups, counts, outcomesAwaiting],
  );
  // `now` is a server-seeded ISO string, not a live clock read — see the
  // `now` prop doc above. Passing it explicitly (rather than relying on
  // `formatRelativeScanTime`'s `now = new Date()` default) is the fix for
  // the render-time `Date()` call this function used to make on every
  // client re-render.
  const lastScanLabel = useMemo(() => formatRelativeScanTime(scannedAt, new Date(now)), [scannedAt, now]);
  const priorityItems: PriorityItem[] = useMemo(() => {
    const flat = groups.flatMap((group) => group.signals);
    return flat.slice(0, 3).map((s, i) => ({
      rank: i + 1,
      title: s.title,
      value:
        s.strokeImpact != null
          ? `${s.strokeImpact > 0 ? '+' : ''}${s.strokeImpact.toFixed(1)} str`
          : severityLabel(s.severity),
    }));
  }, [groups]);
  const urgentSignal = useMemo(() => {
    for (const group of groups) {
      const signal = group.signals.find((s) => s.severity === 'urgent');
      if (signal) return { signal, group };
    }
    return null;
  }, [groups]);
  const leakBandExplanation = categoryBandData
    ? `Team health is ${categoryBandData.teamHealth} of 100. Check the category leak band for where to look next.`
    : undefined;

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
  // (and the dossier sheet closed) whenever a detail is open, so key this off
  // the resolved entry — not merely the raw URL param — or an invalid deep
  // link strands the coach on an empty dossier with no Back control.
  const isSignalSelected = Boolean(selectedEntry);

  function toggleQueueFilter(next: string) {
    navigate({ filter: queueFilter === next ? null : next });
  }

  const severityFilterSelected = queueFilter === 'urgent' ? ['urgent'] : [];
  const categoryFilterSelected =
    queueFilter === 'patterns' || queueFilter.startsWith('category:') ? [queueFilter] : [];

  const insightPanel = (
    <SignalInsightPanel
      entry={dossierEntry}
      coachId={coachId}
      onPromoted={handlePromoted}
      playerStats={dossierPlayerStats}
      open={askOpen}
      onOpenChange={setAskOpen}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <ViewHeader
        // Facelift (2026-09, REVIEW.md item 3): the program name used to
        // appear here AND on the Spine's own eyebrow below — at most once per
        // screen, and the Spine (identity: team + date) is where it stays.
        // This eyebrow now carries scan freshness instead.
        eyebrow={lastScanLabel}
        // Matches the breadcrumb leaf for this route (`surfaceName('brief')`
        // === "Brief") rather than a hardcoded "CoachHelm" that disagreed
        // with the nav/breadcrumb's own name for the same screen.
        title={surfaceName('brief')}
        secondaryActions={
          // One overflow Menu, not a standalone Refresh icon beside it — on
          // phone, ViewHeader's action cluster drops to its own row under
          // the title; two icon buttons there read as a large, empty gap.
          // Folding Refresh into the Menu also leaves one primary action
          // (Scan team) rather than three competing icons/items.
          <Menu
            trigger={
              <IconButton aria-label="More options">
                <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
              </IconButton>
            }
            align="end"
          >
            <Menu.Item icon={<Sparkles className="h-4 w-4" aria-hidden />} onSelect={() => handleScan()}>
              Scan team
            </Menu.Item>
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
        }
      />

      <div className="grid grid-cols-1 gap-6 min-[940px]:grid-cols-[320px_1fr] min-[940px]:items-start">
        <Spine
          className="min-[940px]:sticky min-[940px]:top-6"
          eyebrow={`${teamName} · ${formatSpineDate(now)}`}
          hero={{ value: String(groups.reduce((n, g) => n + g.signals.length, 0)), unit: 'open signals' }}
          verdict={spineVerdict}
          priorities={isDesktopSpine ? priorityItems : undefined}
          ledger={
            isDesktopSpine
              ? [
                  { label: 'Players needing attention', value: String(counts.playersFlagged) },
                  { label: 'Outcomes awaiting', value: String(outcomesAwaiting) },
                  { label: 'Rounds logged', value: String(roundsLogged) },
                  { label: 'Focus areas active', value: String(activeFocusAreaCount) },
                  { label: 'Last scan', value: lastScanLabel },
                ]
              : undefined
          }
          cta={{ label: 'Ask CoachHelm', onClick: () => setAskOpen(true) }}
        >
          {urgentSignal ? (
            <div
              className="mt-5 border-t pt-4"
              style={{ borderTopColor: 'oklch(1 0 0 / 0.14)' }}
            >
              <p className="font-fw-display text-eyebrow uppercase tracking-[0.13em] text-accent-300">
                Urgent
              </p>
              <p className="mt-1.5 font-fw-sans text-body-sm font-medium text-text-on-accent">
                {urgentSignal.group.playerId ? `${urgentSignal.group.playerName}: ` : ''}
                {urgentSignal.signal.title}
              </p>
            </div>
          ) : null}
        </Spine>

        <div className="flex min-w-0 flex-col gap-4">
          {isScanning ? (
            <InlineNotice tone="info" title="Scanning the team">
              Refreshing signals. Panes stay put while this finishes.
            </InlineNotice>
          ) : null}

          <Toolbar
            material="frost"
            viewToggle={
              <ViewSwitch
                view={view}
                hrefFor={(next) => hrefFor({ view: next, signal: null })}
                onSelect={(next) => navigate({ view: next, signal: null })}
              />
            }
            filters={
              view === 'signals' ? (
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
              ) : null
            }
          />

          {categoryBandData ? (
            <TeamCategoryLeakBand categories={categoryBandData.categories} teamHealth={categoryBandData.teamHealth} />
          ) : null}

          {view === 'signals' ? (
            groupsError ? (
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
            ) : (
              <ResizableWorkspace
                left={
                  <SignalQueue
                    groups={filteredGroups}
                    selectedSignalId={selectedSignalId}
                    onSelectSignal={(id) => navigate({ signal: id })}
                    signalHref={(id) => hrefFor({ signal: id })}
                    isAllClear={isAllClear}
                    onScan={handleScan}
                    scanning={isScanning}
                  />
                }
                center={
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
                    emptyLeakBandExplanation={isAllClear ? leakBandExplanation : undefined}
                  />
                }
                right={insightPanel}
                defaultLayout={[26, 48, 26]}
                minSizes={{ left: 20, center: 32, right: 20 }}
                collapsible={{ left: true, right: true }}
                defaultCollapsed={{ right: !isWideWorkspace }}
                storageKey="coachhelm-signals-workspace-v2"
                renderMobile={
                  <div className="flex flex-col gap-3">
                    <div className={cn(isSignalSelected && 'hidden')}>
                      <SignalQueue
                        groups={filteredGroups}
                        selectedSignalId={selectedSignalId}
                        onSelectSignal={(id) => navigate({ signal: id })}
                        signalHref={(id) => hrefFor({ signal: id })}
                        isAllClear={isAllClear}
                        onScan={handleScan}
                        scanning={isScanning}
                      />
                    </div>
                    <Sheet
                      open={isSignalSelected}
                      onOpenChange={(next) => {
                        if (!next) navigate({ signal: null });
                      }}
                      material="frost"
                      side="bottom"
                      hideTitle
                      hideClose
                      title={dossierEntry?.signal.title ?? 'Signal'}
                    >
                      <Sheet.Body>
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
                          emptyLeakBandExplanation={isAllClear ? leakBandExplanation : undefined}
                        />
                      </Sheet.Body>
                    </Sheet>
                    {insightPanel}
                  </div>
                }
              />
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
      </div>
    </div>
  );
}
