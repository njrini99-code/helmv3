/**
 * Genome compare: /dashboard/coachhelm/genome/compare?p1=&p2= (coach-only).
 *
 * Two skill strands against the same baseline, aligned skill for skill, with
 * the widest splits marked and a ranked "where they differ most" ledger.
 * Players come from a roster sheet scoped to the coach's ACTIVE team.
 *
 * Security: p1/p2 are resolved against the active-team roster first; only
 * resolved ids ever reach the admin-client standing loader.
 */

import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadGenomes } from '@/lib/coachhelm/v3/genome/loader';
import { formatGenomeRefreshed } from '@/lib/coachhelm/v3/genome/format-refreshed';
import { loadPlayersStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { fairwayScope } from '@/lib/redesign/flag';
import { GenomeCompareStrands, type CompareSide } from '@/components/fairway/pages/genome/GenomeCompareStrands';
import { buildStrand, type StrandStandingInput } from '@/components/fairway/pages/genome/strand-model';

interface PageProps {
  searchParams: Promise<{ p1?: string; p2?: string }>;
}

export const metadata: Metadata = {
  title: 'Compare players · Genome',
};

function toInputs(map: Map<MetricId, PlayerStanding> | undefined): StrandStandingInput[] {
  if (!map) return [];
  return [...map.values()].map((s) => ({
    metric_id: s.metric_id,
    player_value: s.player_value,
    team_avg: s.team_avg,
    team_n: s.team_n,
    team_pct: s.team_pct,
    pga_value: s.pga_value,
    pga_omitted: s.pga_omitted,
    pga_omitted_reason: s.pga_omitted_reason ?? null,
    is_womens: s.is_womens,
  }));
}

export default async function GenomeComparePage({ searchParams }: PageProps) {
  const { p1, p2 } = await searchParams;
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.coach) redirect('/golf/dashboard');

  const sb = await createClient();
  const teamId = await resolveCoachTeamIdWithCookie(sb, session.coach.organization_id, session.coach.id);
  if (!teamId) redirect('/golf/dashboard/roster');

  const { data: rosterRows } = await sb
    .from('golf_team_members')
    .select('player_id, player:golf_players(id, first_name, last_name)')
    .eq('team_id', teamId)
    .eq('status', 'active');
  const roster = (rosterRows ?? [])
    .filter((r) => r.player && typeof r.player === 'object' && 'first_name' in r.player)
    .map((r) => {
      const p = r.player as { id: string; first_name: string | null; last_name: string | null };
      return { id: p.id, name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player' };
    });

  // Only roster-resolved ids go further.
  const playerA = p1 ? (roster.find((r) => r.id === p1) ?? null) : null;
  const playerB = p2 && p2 !== p1 ? (roster.find((r) => r.id === p2) ?? null) : null;
  const ids = [playerA?.id, playerB?.id].filter((x): x is string => Boolean(x));

  let sides: { a: CompareSide | null; b: CompareSide | null } = { a: null, b: null };
  if (ids.length > 0) {
    const [standingRes, cacheRes, genomes] = await Promise.all([
      loadPlayersStandingMap(ids).catch(async (err: unknown) => {
        await logServerError(`[genome.compare] standing read failed: ${describeError(err)}`, {
          action: 'genome.compare.standing',
          featureArea: 'coachhelm',
        });
        return new Map<string, Map<MetricId, PlayerStanding>>();
      }),
      sb.from('golf_player_stats_cache').select('player_id, rounds_in_calculation, rounds_played').in('player_id', ids),
      loadGenomes(sb, ids),
    ]);
    const cacheById = new Map((cacheRes.data ?? []).map((c) => [c.player_id, c]));
    const genomeById = new Map(genomes.map((g) => [g.player_id, g]));
    const build = (p: { id: string; name: string } | null): CompareSide | null => {
      if (!p) return null;
      const c = cacheById.get(p.id);
      const roundsOnFile = c ? (c.rounds_in_calculation ?? c.rounds_played ?? null) : null;
      const g = genomeById.get(p.id);
      return {
        playerId: p.id,
        name: p.name,
        // Compare shows skills on file; the 90-day pressure traits carry the
        // on-file read here (their own n is on each player's Genome).
        traits: buildStrand(toInputs(standingRes.get(p.id)), { roundsOnFile, rounds90: null }),
        roundsOnFile,
        genomeRefreshed: g ? formatGenomeRefreshed(g.computed_at) : null,
        genomeRoundsBasis: g ? g.rounds_basis : null,
      };
    };
    sides = { a: build(playerA), b: build(playerB) };
  }

  return (
    <div className={fairwayScope('min-h-full bg-canvas font-fw-sans text-text-primary')}>
      <GenomeCompareStrands roster={roster} a={sides.a} b={sides.b} />
    </div>
  );
}
