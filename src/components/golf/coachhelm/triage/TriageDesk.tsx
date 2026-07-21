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
import { cn } from '@/lib/utils';
import { Button, fairwayToast, InlineNotice, PlayersGridView } from '@/components/fairway';
import type { PlayersGridViewProps, FairwayEffectivenessProps } from '@/components/fairway';
import { refreshTeamAnalysisAsCoach } from '@/app/golf/actions/insights';
import { reviewSignal, dismissSignal } from '@/app/golf/actions/signal-groups';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { BriefBand } from './BriefBand';
import { ViewSwitch } from './ViewSwitch';
import { SignalQueue } from './SignalQueue';
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
} from './buildTriageViewModel';

export interface TriageDeskProps {
  coachId: string;
  groups: SignalGroup[];
  scannedAt: string | null;
  /** Non-null when `getSignalGroups` itself failed — a distinct state from a
   *  genuinely empty (all-clear) queue, rendered as an honest retry notice. */
  groupsError: string | null;
  playersDrillProps: PlayersGridViewProps;
  /** Same SSR-fetched shape the retired cockpit consumed — `EffectivenessScoreboard`
   *  only reads its `initialOverview`/`initialEffectiveness`/`initialPerformance` fields. */
  effectivenessDrillProps: FairwayEffectivenessProps;
}

export function TriageDesk({
  coachId,
  groups: initialGroups,
  scannedAt,
  groupsError,
  playersDrillProps,
  effectivenessDrillProps,
}: TriageDeskProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const view = resolveTriageView(searchParams.get('view'));
  const queueFilter = resolveQueueFilter(searchParams.get('filter'));
  // `signal` is the canonical param this desk writes; `id` is the legacy
  // insight deep-link CommandPalette.tsx:326 and FocusAreaCard.tsx:315 still
  // push (`?id=<insightId>`, forwarded here by the /insights redirect shim).
  // Both key off the same raw `golf_coach_insights`/`golf_patterns_v2` id
  // (signal-groups.ts's `id: row.id`), so falling back to `id` re-opens the
  // dossier for that exact insight instead of landing on an empty selection.
  const selectedSignalId = searchParams.get('signal') ?? searchParams.get('id');

  const [groups, setGroups] = useState(initialGroups);
  useEffect(() => {
    setGroups(initialGroups);
  }, [initialGroups]);

  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [isScanning, startScanTransition] = useTransition();

  function navigate(
    updates: Partial<{ view: string; filter: string | null; signal: string | null; player: string | null }>,
  ) {
    const params = new URLSearchParams(searchParams.toString());
    if (updates.view !== undefined) params.set('view', updates.view);
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
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const counts = useMemo(() => computeBriefCounts(groups), [groups]);
  const verdict = useMemo(() => buildBriefVerdict(groups, counts), [groups, counts]);
  const lastScanLabel = useMemo(() => formatRelativeScanTime(scannedAt), [scannedAt]);
  const categories = useMemo(() => distinctCategories(groups), [groups]);
  const filteredGroups = useMemo(() => filterGroupSignals(groups, queueFilter), [groups, queueFilter]);
  const selectedEntry = useMemo(() => findSignalInGroups(groups, selectedSignalId), [groups, selectedSignalId]);

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
    navigate({ view: 'players', signal: null, player: signal.playerId });
  }

  // A stale bookmark (or a signal reviewed in another tab) can leave a
  // `?signal=` that no longer resolves. On narrow screens the queue is hidden
  // whenever a detail is open, so key this off the resolved entry—not merely
  // the raw URL param—or an invalid deep link strands the coach on an empty
  // dossier with no Back control.
  const isSignalSelected = Boolean(selectedEntry);

  return (
    <div className="flex flex-col gap-6">
      <BriefBand
        verdict={verdict}
        counts={counts}
        lastScanLabel={lastScanLabel}
        scanning={isScanning}
        onScan={handleScan}
      />

      <ViewSwitch view={view} onChange={(next) => navigate({ view: next, signal: null })} />

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
          <div className="grid grid-cols-1 gap-4 min-[940px]:grid-cols-[380px_1fr] min-[940px]:items-start">
            <div className={cn(isSignalSelected && 'hidden min-[940px]:block')}>
              <SignalQueue
                groups={filteredGroups}
                allGroups={groups}
                categories={categories}
                filter={queueFilter}
                onFilterChange={(next) => navigate({ filter: next === 'all' ? null : next })}
                selectedSignalId={selectedSignalId}
                onSelectSignal={(id) => navigate({ signal: id })}
              />
            </div>
            <div className={cn(!isSignalSelected && 'hidden min-[940px]:block')}>
              <SignalDossier
                entry={selectedEntry}
                coachId={coachId}
                pending={selectedEntry ? pendingIds.has(selectedEntry.signal.id) : false}
                onReview={handleReview}
                onDismiss={handleDismiss}
                onPromoted={handlePromoted}
                onBack={() => navigate({ signal: null })}
              />
            </div>
          </div>
        )
      ) : null}

      {view === 'players' ? <PlayersGridView {...playersDrillProps} embedded /> : null}
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
