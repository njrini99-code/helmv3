/**
 * GOLF IA REORG (final_migrations #11) — canonical per-player Genome route.
 *
 * /dashboard/players/[playerId]/genome · coach-only. Moved verbatim from
 * /dashboard/coachhelm/genome/[playerId] (now a redirect shim to here) as a
 * real nested path segment sibling of /players/[playerId]/game — a
 * bookmarkable URL, not a ?tab= query param, per the plan's URL-hygiene
 * graft. GenomeDetailView itself is unchanged; it has no dependency on its
 * old mount point (props-only, no path-derived state).
 *
 * Layout:
 *   ┌──────── Header (player name + meta) ──────────┐
 *   │ ──────────────────────────────────────────────│
 *   │  RADAR (left)  │   STRENGTHS / WATCHOUTS      │
 *   │                │   COURSE PROFILE             │
 *   │ ──────────────────────────────────────────────│
 *   │  DIMENSION GRID (4-up at lg, 3-up at md)      │
 *   └────────────────────────────────────────────────┘
 */

import { notFound, redirect } from 'next/navigation';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadGenome } from '@/lib/coachhelm/v3/genome/loader';
import { derivePersona } from '@/lib/coachhelm/v3/genome/persona';
import type { Metadata } from 'next';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { fairwayScope } from '@/lib/redesign/flag';
import { GenomeDetailView, type FocusAreaCardData } from '@/components/fairway';

interface PageProps {
  params: Promise<{ playerId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { playerId } = await params;
  const sb = await createClient();
  const { data } = await sb
    .from('golf_players')
    .select('first_name, last_name')
    .eq('id', playerId)
    .maybeSingle();
  const name = data ? `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() : 'Player';
  return { title: `${name} · Genome · CoachHelm` };
}

export default async function PlayerGenomePage({ params }: PageProps) {
  const { playerId } = await params;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.coach) redirect('/golf/dashboard');

  const sb = await createClient();

  // Scope to the coach's ACTIVE team (cookie-resolved), matching
  // `/players/[playerId]/game`. RLS already prevents cross-org IDOR, but
  // without this gate a multi-team coach could open the genome for a player
  // on a NON-active team — inconsistent with the team toggle that the
  // Scouting Report / Game Fingerprint tabs honor.
  const teamId = await resolveCoachTeamIdWithCookie(sb, session.coach.organization_id, session.coach.id);
  if (!teamId) redirect('/golf/dashboard/roster');

  // Same shape as roster/[id]: on a detail page a discarded read error wears
  // notFound(), so a coach opening a player from their own roster is told that
  // player does not exist. Absent is a 404; unreadable is not.
  const { data: membership, error: membershipError } = await sb
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (membershipError) {
    await logServerError(
      `[genome] membership read failed — would have 404'd a rostered player: ${describeError(membershipError)}`,
      { action: 'genome.membership', featureArea: 'coachhelm', playerId },
    );
    throw new Error("Couldn't load this player. Please try again.");
  }
  if (!membership) notFound();

  const { data: player, error: playerError } = await sb
    .from('golf_players')
    .select('id, first_name, last_name')
    .eq('id', playerId)
    .maybeSingle();
  if (playerError) {
    await logServerError(
      `[genome] player read failed — would have 404'd a player who exists: ${describeError(playerError)}`,
      { action: 'genome.player', featureArea: 'coachhelm', playerId },
    );
    throw new Error("Couldn't load this player. Please try again.");
  }
  if (!player) notFound();

  const genome = await loadGenome(sb, playerId);
  const persona = genome ? derivePersona(genome.vector) : null;
  const name = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';

  // The warm "Players → genome detail" surface (CoachHelmShell
  // active='players'). The SAME view serves the concrete Nick Rini sample UUID
  // (no separate fork) — it renders both the populated genome AND the Compute-now
  // empty state on this one component. loadGenome + derivePersona + notFound +
  // coach gate all ran above.
  // A failed focus-area read renders as "this player has no focus areas" — a
  // coaching judgement the coach never made. Non-fatal (the genome above is
  // the point of the page) but no longer silent.
  const { data: faRows, error: faError } = await sb
    .from('golf_player_focus_areas')
    .select(
      'id, area_type, title, description, status, target_metric, current_value, target_value, started_at, completed_at, from_review_id, from_insight_id',
    )
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

  if (faError) {
    await logServerError(
      `[genome] focus-area read failed — the page will claim this player has none: ${describeError(faError)}`,
      { action: 'genome.focusAreas', featureArea: 'coachhelm', playerId },
    );
  }

  const countsRes = await getAlertCounts(session.coach.id);
  const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <GenomeDetailView
        playerId={playerId}
        playerName={name}
        genome={genome}
        persona={persona}
        focusAreas={(faRows ?? []) as FocusAreaCardData[]}
        coachId={session.coach.id}
        signalCount={signalCount}
      />
    </div>
  );
}
