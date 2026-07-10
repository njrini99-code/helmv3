/**
 * W34 — coach desktop genome compare.
 *
 * /dashboard/coachhelm/genome/compare?p1=&p2=  · coach-only.
 *
 * Two players overlaid on the same radar so the coach can see "who's
 * the better fit for course X" at a glance. p2 is optional — when
 * omitted, this renders the same single-radar view as /[playerId]
 * but with a player picker to add the second.
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadGenomes } from '@/lib/coachhelm/v3/genome/loader';
import type { Metadata } from 'next';
import { getAlertCounts } from '@/app/golf/actions/alerts';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { fairwayScope } from '@/lib/redesign/flag';
import { GenomeCompareView, type CompareSeries } from '@/components/fairway';

interface PageProps {
  searchParams: Promise<{ p1?: string; p2?: string }>;
}

export const metadata: Metadata = {
  title: 'Compare players · Genome · CoachHelm',
};

export default async function GenomeComparePage({ searchParams }: PageProps) {
  const { p1, p2 } = await searchParams;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.coach) redirect('/golf/dashboard');

  const sb = await createClient();

  // Scope the roster picker to the coach's ACTIVE team (cookie-resolved),
  // matching `/players/[playerId]` and the genome detail page. RLS prevents
  // cross-org IDOR, but without the team filter a multi-team coach would see
  // (and could compare) players across ALL their teams regardless of the
  // active-team toggle that Insight/Game honor.
  const teamId = await resolveCoachTeamIdWithCookie(sb, session.coach.organization_id, session.coach.id);
  if (!teamId) redirect('/golf/dashboard/roster');

  // Player roster picker source — active players on the coach's ACTIVE team.
  const { data: rosterRows } = await sb
    .from('golf_team_members')
    .select('player_id, player:golf_players(id, first_name, last_name)')
    .eq('team_id', teamId)
    .eq('status', 'active');
  const roster = (rosterRows ?? [])
    .filter((r) => r.player && typeof r.player === 'object' && 'first_name' in r.player)
    .map((r) => {
      const p = r.player as { id: string; first_name: string; last_name: string };
      return { id: p.id, name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() };
    });

  const ids = [p1, p2].filter(Boolean) as string[];
  const genomes = ids.length > 0 ? await loadGenomes(sb, ids) : [];
  const genomeById = new Map(genomes.map((g) => [g.player_id, g]));

  const playerA = p1 ? roster.find((r) => r.id === p1) : null;
  const playerB = p2 ? roster.find((r) => r.id === p2) : null;
  const a = playerA && genomeById.get(playerA.id);
  const b = playerB && genomeById.get(playerB.id);

  // The warm "Players → compare" surface (CoachHelmShell active='players'). It
  // renders GenomeFingerprint DIVERGING BARS (not two overlaid radars) + a
  // numeric dimension table + an honest "N of M live" caption + a "no genome
  // computed" legend chip. loadGenomes + roster + ?p1=&p2= resolution + coach
  // gate all ran above; vectors carried in as serializable CompareSeries.
  const seriesA: CompareSeries | null = playerA
    ? { playerId: playerA.id, name: playerA.name, vector: a ? a.vector : null }
    : null;
  const seriesB: CompareSeries | null = playerB
    ? { playerId: playerB.id, name: playerB.name, vector: b ? b.vector : null }
    : null;

  const countsRes = await getAlertCounts(session.coach.id);
  const signalCount = countsRes.success ? (countsRes.counts?.critical ?? null) : null;

  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <GenomeCompareView
        roster={roster}
        p1={p1 ?? null}
        p2={p2 ?? null}
        seriesA={seriesA}
        seriesB={seriesB}
        signalCount={signalCount}
      />
    </div>
  );
}

