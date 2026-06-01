'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · FairwayPlayerStats — the PLAYER stats route shell
 * ----------------------------------------------------------------------------
 * The flag-on stats surface for /golf/dashboard/stats. It is now a THIN shell:
 * it resolves the requested player id + role, wraps the shared
 * <FairwayStatsCockpit> in the CoachHelm sub-nav (CoachHelmShell), and owns the
 * one state the cockpit can't — "no player selected".
 *
 * The cockpit BODY (data fetch + the re-architected sections) lives in
 * FairwayStatsCockpit so the coach roster drill-down (roster/[id]) can render
 * the SAME body inside a roster identity header — one beautiful stats page,
 * two roles, no double-nav.
 *
 * ── PLAYER RESOLUTION (mirrors the legacy StatsClient verbatim) ─────────────
 *   resolvedPlayerId = initialPlayerId (coach ?player=) ?? golfUser.playerId.
 *   A coach viewing a teammate keeps a back link to the team roster.
 *
 * ADDITIVE + GATED — imported only behind isRedesignEnabled() in stats/page.tsx.
 * ========================================================================== */

import Link from 'next/link';

import { fairwayScope } from '@/lib/redesign/flag';
import { Surface, EmptyState } from '@/components/fairway';
import { useGolfUser } from '@/contexts/golf-user-context';
import { CoachHelmShell } from './CoachHelmShell';
import { FairwayStatsCockpit } from './FairwayStatsCockpit';

export interface FairwayPlayerStatsProps {
  initialPlayerId?: string | null;
}

export function FairwayPlayerStats({ initialPlayerId = null }: FairwayPlayerStatsProps) {
  const golfUser = useGolfUser();

  const resolvedPlayerId = initialPlayerId || golfUser.playerId || null;
  const isCoachView = golfUser.role === 'coach';
  const playerName = isCoachView ? '' : golfUser.name;

  const title = isCoachView
    ? playerName
      ? `${playerName}'s stats`
      : 'Player stats'
    : 'Your stats';

  const backAction = isCoachView ? (
    <Link
      href="/golf/dashboard/stats"
      className="rounded-fw-sm font-fw-sans text-label font-medium text-text-secondary outline-none transition-colors [transition-duration:180ms] hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
    >
      ← Team stats
    </Link>
  ) : undefined;

  return (
    <div className={fairwayScope('min-h-full bg-canvas')}>
      <div className="mx-auto w-full max-w-[1200px] px-4 py-2 md:px-6">
        <CoachHelmShell
          active="players"
          role="player"
          eyebrow="Stats"
          title={title}
          description="Where you stand vs PGA Tour and your team — and where the strokes are leaking."
          actions={backAction}
        >
          {!resolvedPlayerId ? (
            <Surface padding="lg">
              <EmptyState
                title="No player selected"
                description="Pick a player from the team stats roster to see their personal stats."
                action={
                  <Link
                    href="/golf/dashboard/stats"
                    className="font-fw-sans text-label font-medium text-accent-600 hover:text-accent-700"
                  >
                    Back to team stats
                  </Link>
                }
              />
            </Surface>
          ) : (
            <FairwayStatsCockpit playerId={resolvedPlayerId} />
          )}
        </CoachHelmShell>
      </div>
    </div>
  );
}

export default FairwayPlayerStats;
