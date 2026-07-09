/**
 * W34 — coach desktop genome view.
 *
 * /dashboard/coachhelm/genome/[playerId] · coach-only.
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

export default async function CoachGenomePage({ params }: PageProps) {
  const { playerId } = await params;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.coach) redirect('/golf/dashboard');

  const sb = await createClient();

  // Scope to the coach's ACTIVE team (cookie-resolved), matching
  // `/players/[playerId]` and `/players/[playerId]/game`. RLS already prevents
  // cross-org IDOR, but without this gate a multi-team coach could open the
  // genome for a player on a NON-active team — inconsistent with the team
  // toggle that Insight/Game honor.
  const teamId = await resolveCoachTeamIdWithCookie(sb, session.coach.organization_id, session.coach.id);
  if (!teamId) redirect('/golf/dashboard/roster');

  const { data: membership } = await sb
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .maybeSingle();
  if (!membership) notFound();

  const { data: player } = await sb
    .from('golf_players')
    .select('id, first_name, last_name')
    .eq('id', playerId)
    .maybeSingle();
  if (!player) notFound();

  const genome = await loadGenome(sb, playerId);
  const persona = genome ? derivePersona(genome.vector) : null;
  const name = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';

  // The warm "Players → genome detail" surface (CoachHelmShell
  // active='players'). The SAME view serves the concrete Nick Rini sample UUID
  // (no separate fork) — it renders both the populated genome AND the Compute-now
  // empty state on this one component. loadGenome + derivePersona + notFound +
  // coach gate all ran above.
  const { data: faRows } = await sb
    .from('golf_player_focus_areas')
    .select(
      'id, area_type, title, description, status, target_metric, current_value, target_value, started_at, completed_at, from_review_id, from_insight_id',
    )
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });

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
