/**
 * Coach Genome: /golf/dashboard/players/[playerId]/genome (coach-only).
 *
 * The skill profile against a baseline: a masthead with a one-sentence
 * verdict, the skill strand (each standing metric as a signed segment against
 * the team or Tour), a ranked ledger, "How they play" (genome tendencies), and
 * focus areas streamed in below the fold.
 *
 * Load order (the page must paint fast):
 *   1. session → active team (the gate everything else needs)
 *   2. in parallel, under RLS: membership, player, genome, stats cache,
 *      90-day completed rounds
 *   3. only after membership is proven: the standing snapshot (admin client)
 *   Focus areas stream in their own Suspense boundary.
 */

import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { isUuid } from '@/lib/utils/uuid';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { loadGenome } from '@/lib/coachhelm/v3/genome/loader';
import { formatGenomeRefreshed } from '@/lib/coachhelm/v3/genome/format-refreshed';
import { GENOME_WINDOW_DAYS } from '@/lib/coachhelm/v3/genome/types';
import { loadPlayerStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { fairwayScope } from '@/lib/redesign/flag';
import { Skeleton } from '@/components/fairway/feedback/Skeleton';
import type { FocusAreaCardData } from '@/components/fairway/pages/coachhelm/FocusAreaCard';
import { CoachGenomeView } from '@/components/fairway/pages/genome/CoachGenomeView';
import { GenomeEmpty } from '@/components/fairway/pages/genome/GenomeEmpty';
import { GenomeTendencies } from '@/components/fairway/pages/genome/GenomeTendencies';
import { GenomeComputeButton } from '@/components/fairway/pages/genome/GenomeComputeButton';
import { GenomeFocusAreaList } from '@/components/fairway/pages/genome/GenomeFocusAreaList';
import { buildStrand, type StrandStandingInput } from '@/components/fairway/pages/genome/strand-model';
import { buildArchetype, buildTendencies } from '@/components/fairway/pages/genome/tendencies-model';

interface PageProps {
  params: Promise<{ playerId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { playerId } = await params;
  if (!isUuid(playerId)) notFound();
  const sb = await createClient();
  const { data } = await sb
    .from('golf_players')
    .select('first_name, last_name')
    .eq('id', playerId)
    .maybeSingle();
  const name = data ? `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() : 'Player';
  return { title: `${name} · Genome · CoachHelm` };
}

/** UTC calendar date N days ago, matching the genome orchestrator's window. */
function windowStart(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export default async function PlayerGenomePage({ params }: PageProps) {
  const { playerId } = await params;
  if (!isUuid(playerId)) notFound();
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');
  if (!session.coach) redirect('/golf/dashboard');

  const sb = await createClient();

  // Scope to the coach's ACTIVE team (cookie-resolved), matching
  // `/players/[playerId]/game`.
  const teamId = await resolveCoachTeamIdWithCookie(sb, session.coach.organization_id, session.coach.id);
  if (!teamId) redirect('/golf/dashboard/roster');

  const [membershipRes, playerRes, genome, cacheRes, recentRes] = await Promise.all([
    sb.from('golf_team_members').select('player_id').eq('team_id', teamId).eq('player_id', playerId).maybeSingle(),
    sb.from('golf_players').select('id, first_name, last_name').eq('id', playerId).maybeSingle(),
    loadGenome(sb, playerId),
    sb.from('golf_player_stats_cache').select('rounds_in_calculation, rounds_played').eq('player_id', playerId).maybeSingle(),
    sb
      .from('golf_rounds')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId)
      .eq('status', 'completed')
      .gte('round_date', windowStart(GENOME_WINDOW_DAYS)),
  ]);

  // On a detail page a discarded read error must not wear notFound(): absent
  // is a 404, unreadable is not.
  if (membershipRes.error) {
    await logServerError(
      `[genome] membership read failed — would have 404'd a rostered player: ${describeError(membershipRes.error)}`,
      { action: 'genome.membership', featureArea: 'coachhelm', playerId },
    );
    throw new Error("Couldn't load this player. Please try again.");
  }
  if (!membershipRes.data) notFound();
  if (playerRes.error) {
    await logServerError(
      `[genome] player read failed — would have 404'd a player who exists: ${describeError(playerRes.error)}`,
      { action: 'genome.player', featureArea: 'coachhelm', playerId },
    );
    throw new Error("Couldn't load this player. Please try again.");
  }
  const player = playerRes.data;
  if (!player) notFound();

  // Admin-client read: only after membership in the coach's active team is proven.
  let standingRows: StrandStandingInput[] = [];
  try {
    const standing = await loadPlayerStandingMap(playerId);
    standingRows = [...standing.values()].map((s) => ({
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
  } catch (err) {
    await logServerError(`[genome] standing read failed — strand renders empty: ${describeError(err)}`, {
      action: 'genome.standing',
      featureArea: 'coachhelm',
      playerId,
    });
  }

  const cache = cacheRes.data;
  const roundsOnFile = cache ? (cache.rounds_in_calculation ?? cache.rounds_played ?? null) : null;
  const rounds90 = recentRes.error ? null : (recentRes.count ?? null);
  const firstName = player.first_name?.trim() || 'This player';
  const name = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';
  const scope = fairwayScope('min-h-full bg-canvas font-fw-sans text-text-primary');

  if (standingRows.length === 0 && !genome && !roundsOnFile && !rounds90) {
    return (
      <div className={scope}>
        <GenomeEmpty playerId={playerId} playerName={name} firstName={firstName} />
      </div>
    );
  }

  const traits = buildStrand(standingRows, { roundsOnFile, rounds90 });
  const vector = genome?.vector ?? null;

  return (
    <div className={scope}>
      <CoachGenomeView
        playerId={playerId}
        playerName={name}
        firstName={firstName}
        traits={traits}
        samples={{ roundsOnFile, rounds90 }}
        archetype={buildArchetype(vector)}
        coachId={session.coach.id}
        tendencies={
          <GenomeTendencies
            tendencies={buildTendencies(vector)}
            roundsBasis={genome ? genome.rounds_basis : null}
            refreshed={genome ? formatGenomeRefreshed(genome.computed_at) : null}
            emptyAction={genome ? undefined : <GenomeComputeButton playerId={playerId} />}
          />
        }
      >
        <Suspense fallback={<FocusAreasFallback />}>
          <FocusAreasSection playerId={playerId} />
        </Suspense>
      </CoachGenomeView>
    </div>
  );
}

async function FocusAreasSection({ playerId }: { playerId: string }) {
  const sb = await createClient();
  const { data, error } = await sb
    .from('golf_player_focus_areas')
    .select(
      'id, area_type, title, description, status, target_metric, current_value, target_value, baseline_value, started_at, completed_at, outcome_status, from_review_id, from_insight_id',
    )
    .eq('player_id', playerId)
    .order('created_at', { ascending: false });
  if (error) {
    await logServerError(
      `[genome] focus-area read failed — shown as unreadable, not as none: ${describeError(error)}`,
      { action: 'genome.focusAreas', featureArea: 'coachhelm', playerId },
    );
  }
  return (
    <GenomeFocusAreaList
      playerId={playerId}
      focusAreas={(data ?? []) as FocusAreaCardData[]}
      readFailed={Boolean(error)}
    />
  );
}

function FocusAreasFallback() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <Skeleton className="h-5 w-28" />
      <div className="border-t border-border-strong pt-4">
        <Skeleton className="h-24 w-full rounded-card" />
      </div>
    </div>
  );
}
