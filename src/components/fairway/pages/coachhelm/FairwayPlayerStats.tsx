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

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { fairwayScope } from '@/lib/redesign/flag';
import { Surface, EmptyState } from '@/components/fairway';
import { useGolfUser } from '@/contexts/golf-user-context';
import { getPlayerDisplayName } from '@/app/golf/actions/stats-data';
import { CoachHelmShell } from './CoachHelmShell';
import { StatsSpineStage } from '@/components/golf/stats/spine-stage/StatsSpineStage';

export interface FairwayPlayerStatsProps {
  initialPlayerId?: string | null;
}

export function FairwayPlayerStats({ initialPlayerId = null }: FairwayPlayerStatsProps) {
  const golfUser = useGolfUser();

  const resolvedPlayerId = initialPlayerId || golfUser.playerId || null;
  const isCoachView = golfUser.role === 'coach';

  // A coach drilling into a teammate must see THAT player's name — not the
  // coach's own (golfUser.name) and not the generic "Player stats". The name
  // isn't in any cockpit payload, so resolve it here (authorized server action).
  const [viewedPlayerName, setViewedPlayerName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (isCoachView && resolvedPlayerId) {
      getPlayerDisplayName(resolvedPlayerId)
        .then((name) => { if (!cancelled) setViewedPlayerName(name); })
        .catch(() => { if (!cancelled) setViewedPlayerName(null); });
    } else {
      setViewedPlayerName(null);
    }
    return () => { cancelled = true; };
  }, [isCoachView, resolvedPlayerId]);

  const playerName = isCoachView ? viewedPlayerName : golfUser.name;

  const title = isCoachView
    ? playerName
      ? `${playerName}'s stats`
      : 'Player stats'
    : 'Your stats';

  // Third-person framing for a coach viewing a teammate; first-person for a
  // player viewing their own page.
  const description = isCoachView
    ? `Where ${playerName ?? 'this player'} stands vs PGA Tour and the team — and where the strokes are leaking.`
    : 'Where you stand vs PGA Tour and your team — and where the strokes are leaking.';

  // golf-ia-plan.json step 8 — the shell's role/active-tab must track WHO is
  // viewing, not a hardcoded value: a coach drilling into a teammate gets the
  // coach's 5-tab strip (previously got the PLAYER strip pointed at the
  // viewer's own /my-development, /my-game-profile, /my-standing — nonsense
  // for a coach). Coach lands on the sibling idiom already used by every
  // other coach player-detail surface (GenomeDetailView, FairwayPlayerInsight,
  // PlayersGridView all use active="players" role="coach"). A player has no
  // dedicated tab for their own /stats page (it's a separate rail item, not
  // part of the 4-tab Overview/Development/Game Profile/Standing strip), so
  // 'brief' (Overview) is the closest real tab — matching final_routes' note
  // that /stats cross-links to "that player's CoachHelm Brief context".
  const shellRole = isCoachView ? 'coach' : 'player';
  const activeTab = isCoachView ? 'players' : 'brief';

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
          active={activeTab}
          role={shellRole}
          eyebrow="Stats"
          title={title}
          description={description}
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
            <StatsSpineStage
              playerId={resolvedPlayerId}
              isOwnStats={!isCoachView}
              // Bug #915: label the coach-facing SG cards with the actual
              // teammate name instead of the generic "Player" fallback.
              playerName={isCoachView ? (playerName ?? undefined) : undefined}
            />
          )}
        </CoachHelmShell>
      </div>
    </div>
  );
}
