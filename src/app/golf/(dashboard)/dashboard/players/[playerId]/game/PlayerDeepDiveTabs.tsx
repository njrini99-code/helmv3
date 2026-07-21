'use client';

/**
 * ============================================================================
 * PlayerDeepDiveTabs — the coach per-player deep-dive tab switcher
 * ----------------------------------------------------------------------------
 * GOLF IA REORG (final_migrations #11): /players/[playerId]/game is now the
 * canonical per-player deep-dive. This client shell adds the in-page
 * "Scouting Report" tab that absorbs the content formerly at the standalone
 * /players/[playerId] route — the two components it switches between
 * (FairwayPlayerGameFingerprint, FairwayPlayerInsight) are rendered UNCHANGED;
 * this file only owns the tab chrome + which one is mounted.
 *
 * Both tabs' data are fetched server-side in ONE round trip by the route
 * (game/page.tsx) so switching tabs is instant — no client refetch, no
 * loading flash on toggle.
 *
 * The active tab is shareable via `?tab=scouting` (mirrors the URL-as-state
 * contract FairwayCoachHelmSignals already uses for its own filters) so an
 * inbound link — the coach-morning-digest email, the roster kebab menu, the
 * Genome cross-link — can deep-link straight to the Scouting Report without
 * a second click. `?tab=` absent (or any other value) defaults to Game
 * Fingerprint, the primary read.
 *
 * Both tabs mount inside ONE CoachHelmShell (active="players") so this leaf
 * keeps the same masthead sub-nav + player-name breadcrumb every other
 * Players-tab leaf (GenomeDetailView, PlayersGridView, the former standalone
 * FairwayPlayerInsight) mounts — the shell used to come from
 * FairwayPlayerInsight itself, but its `embedded` branch intentionally skips
 * that mount to avoid a second, competing masthead now that the tab switcher
 * above already owns the chrome for this route.
 * ========================================================================== */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Segmented, type SegmentedOption } from '@/components/fairway/controls/segmented';
import { FairwayPlayerGameFingerprint } from '@/components/fairway/pages/player-game';
import { CoachHelmShell } from '@/components/fairway/pages/coachhelm/CoachHelmShell';
import {
  FairwayPlayerInsight,
  type FairwayPlayerInsightProps,
} from '@/components/fairway/pages/coachhelm/FairwayPlayerInsight';
import type { PlayerFingerprint } from '@/app/golf/actions/player-fingerprint';

type DeepDiveTab = 'fingerprint' | 'scouting';

const TAB_OPTIONS: SegmentedOption<DeepDiveTab>[] = [
  { value: 'fingerprint', label: 'Game Fingerprint' },
  { value: 'scouting', label: 'Scouting Report' },
];

export interface PlayerDeepDiveTabsProps {
  fingerprint: PlayerFingerprint;
  /** Everything FairwayPlayerInsight needs, pre-fetched alongside the fingerprint. */
  insight: FairwayPlayerInsightProps;
}

export function PlayerDeepDiveTabs({ fingerprint, insight }: PlayerDeepDiveTabsProps) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<DeepDiveTab>(
    searchParams.get('tab') === 'scouting' ? 'scouting' : 'fingerprint',
  );

  useEffect(() => {
    setTab(searchParams.get('tab') === 'scouting' ? 'scouting' : 'fingerprint');
  }, [searchParams]);

  // Shareable, but not a client refetch trigger for THIS render — local state
  // already owns which view is mounted, so the tab flips instantly. The
  // native history update only keeps the URL bar honest for copy/paste + the
  // coach-morning-digest deep link; it does not rerun the server page.
  const onTabChange = useCallback(
    (next: DeepDiveTab) => {
      setTab(next);
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'scouting') params.set('tab', 'scouting');
      else params.delete('tab');
      const qs = params.toString();
      window.history.replaceState(
        window.history.state,
        '',
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
      );
    },
    [searchParams],
  );

  const playerName =
    `${insight.player.first_name ?? ''} ${insight.player.last_name ?? ''}`.trim() || 'Player';

  return (
    <CoachHelmShell
      active="players"
      // eslint-disable-next-line jsx-a11y/aria-role
      role="coach"
      signalCount={insight.signalCount}
      embedded
      breadcrumbs={[
        { label: 'Players', href: '/golf/dashboard/intelligence?view=players' },
        { label: playerName },
      ]}
    >
      <div className="flex flex-col gap-6">
        <Segmented<DeepDiveTab>
          options={TAB_OPTIONS}
          value={tab}
          onValueChange={onTabChange}
          aria-label="Player deep-dive view"
        />
        {tab === 'fingerprint' ? (
          <FairwayPlayerGameFingerprint fingerprint={fingerprint} />
        ) : (
          <FairwayPlayerInsight {...insight} embedded />
        )}
      </div>
    </CoachHelmShell>
  );
}

export default PlayerDeepDiveTabs;
