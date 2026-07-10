import { createClient } from '@/lib/supabase/server';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { getTeamStatsIntelligence } from '@/app/golf/actions/stats-intelligence';
import { resolveCoachTeamIdWithCookie } from '@/lib/golf/resolve-team-server';
import { fairwayScope } from '@/lib/redesign/flag';
import { FairwayTeamStats } from '@/components/fairway/pages/coachhelm/FairwayTeamStats';
import { ViewHeader, EmptyState, Button } from '@/components/fairway';
import { fetchAllRows, fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { getTeamLeakMaps } from '@/app/golf/actions/stats-leak-maps';
import { loadPlayersStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Team Stats Overview | Helm Golf',
  description: 'View and compare statistics for all players on your team',
};

// Cache for 5 minutes
export const revalidate = 300;

export interface TeamPlayerStats {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  graduation_year: number | null;
  handicap: number | null;
  rounds_played: number;
  scoring_average: number | null;
  best_round: number | null;
  worst_round: number | null;
  fairway_pct: number | null;
  gir_pct: number | null;
  putts_per_round: number | null;
  birdies_per_round: number | null;
  scoring_trend: number | null; // Difference from previous period
  // Per-format stats (9 vs 18 holes)
  rounds_played_18: number;
  rounds_played_9: number;
  scoring_average_18: number | null;
  scoring_average_9: number | null;
  best_round_18: number | null;
  best_round_9: number | null;
}

export default async function TeamStatsPage() {
  const session = await getGolfSessionProfile();
  if (!session) redirect('/golf/login');

  const { coach } = session;
  if (!coach) redirect('/golf/dashboard/stats'); // coach-only page

  const supabase = await createClient();

  // Get team_id from golf_teams via organization_id (deterministic: handles
  // orgs with >1 team), then load the chosen team's display name.
  const teamId = await resolveCoachTeamIdWithCookie(supabase, coach.organization_id, coach.id);
  let team: { name: string } | null = null;
  if (teamId) {
    const { data: chosenTeam } = await supabase
      .from('golf_teams')
      .select('name')
      .eq('id', teamId)
      .maybeSingle();
    team = chosenTeam ? { name: chosenTeam.name } : null;
  }

  if (!teamId) {
    // A real empty state inside the .fairway-ds scope with an actionable CTA.
    return (
      <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
        <div className="mx-auto w-full max-w-[1536px] px-4 py-6 md:px-6 md:py-8">
          <EmptyState
            icon={<Users strokeWidth={1.75} />}
            title="No team yet"
            description="Create a team and add players to see team statistics, strokes-gained, and where the strokes leak."
            action={
              <Button asChild variant="primary" size="md">
                <Link href="/golf/dashboard/team">Create a team</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  // Get all team members first, then get their player data
  const { data: teamMembers } = await supabase
    .from('golf_team_members')
    .select('player_id')
    .eq('team_id', teamId)
    .eq('status', 'active');

  const playerIds = (teamMembers || []).map(tm => tm.player_id);

  // Get player data - use graduation_year (actual DB column name)
  const { data: players } = playerIds.length > 0
    ? await supabase
        .from('golf_players')
        .select('id, first_name, last_name, avatar_url, graduation_year, handicap')
        .in('id', playerIds)
        .order('last_name')
    : { data: [] };

  if (!players || players.length === 0) {
    // A Fairway-styled empty state with a real next action (open the roster)
    // inside the .fairway-ds scope.
    return (
      <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
        <div className="mx-auto w-full max-w-[1536px] px-4 py-6 md:px-6 md:py-8">
          <ViewHeader
            eyebrow="Team Stats"
            title="Team Stats"
            description={team?.name || 'Your Team'}
          />
          <div className="mt-8">
            <EmptyState
              icon={<Users strokeWidth={1.75} />}
              title="No players on your roster yet"
              description="Add players to your roster and their rounds will roll up here into team strokes-gained, leak maps, and per-player tiles."
              action={
                <Button asChild variant="primary" size="md">
                  <Link href="/golf/dashboard/roster">Add players to your roster</Link>
                </Button>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  // Fetch ALL rounds for ALL players in a single query (performance optimization).
  // Run CoachHelm intelligence fetch in parallel — it reads already-persisted
  // engine output and doesn't block the raw stats query.
  const allPlayerIds = players.map(p => p.id);

  const [roundsResult, intelligenceResult] = await Promise.all([
    // Paginated: PostgREST caps each response at 1000 rows; a full roster's
    // season exceeds that and silently dropped the oldest rounds. Keep
    // round_date DESC first (the trend math below expects newest-first) with
    // id ASC as a unique tiebreak so page boundaries are stable.
    fetchAllRowsResult((from, to) =>
      supabase
        .from('golf_rounds')
        .select('id, player_id, total_score, round_date, holes_played')
        .in('player_id', allPlayerIds)
        .eq('status', 'completed')
        .not('total_score', 'is', null)
        .order('round_date', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    getTeamStatsIntelligence(teamId),
  ]);
  const { data: allRounds } = roundsResult;

  // Fetch ALL holes for calculating GIR and fairway stats
  const roundIds = (allRounds || []).map(r => r.id);

  // Chunked + paginated. The round_id list is chunked (~300 per .in(...)) so the
  // request URL stays well under the ~414 length limit at full-roster scale, and
  // each chunk is itself paginated because PostgREST caps each request at 1000
  // rows — a team season exceeds 1000 golf_holes rows, which previously
  // truncated the per-player putts / GIR% / fairway% aggregates below. Page
  // through ALL holes in every chunk with a stable order.
  const HOLES_ROUND_BATCH = 300;
  const allHoles: HoleData[] = [];
  for (let i = 0; i < roundIds.length; i += HOLES_ROUND_BATCH) {
    const roundIdBatch = roundIds.slice(i, i + HOLES_ROUND_BATCH);
    const batchHoles = (await fetchAllRows((from, to) =>
      supabase
        .from('golf_holes')
        .select('round_id, par, fairway_hit, gir, putts, score')
        .in('round_id', roundIdBatch)
        .order('id', { ascending: true })
        .range(from, to),
    )) as HoleData[];
    allHoles.push(...batchHoles);
  }

  // Define types for the grouped data
  type RoundData = { id: string; player_id: string; total_score: number | null; round_date: string; holes_played: number | null };
  type HoleData = { round_id: string; par: number; fairway_hit: boolean | null; gir: boolean | null; putts: number | null; score: number | null };

  // Group data by player in memory
  const roundsByPlayer: Record<string, RoundData[]> = {};
  for (const round of (allRounds || [])) {
    const playerId = round.player_id;
    if (!roundsByPlayer[playerId]) {
      roundsByPlayer[playerId] = [];
    }
    roundsByPlayer[playerId]!.push(round as RoundData);
  }

  const holesByRound: Record<string, HoleData[]> = {};
  for (const hole of (allHoles || [])) {
    const roundId = hole.round_id;
    if (!holesByRound[roundId]) {
      holesByRound[roundId] = [];
    }
    holesByRound[roundId]!.push(hole);
  }

  // Calculate comprehensive stats for each player
  const playersWithStats: TeamPlayerStats[] = players.map(player => {
    const playerRounds = roundsByPlayer[player.id] || [];
    const scoredRounds = playerRounds.filter(r => r.total_score !== null);

    // Normalize to 18-hole equivalents + split by format
    let totalStrokes = 0;
    let totalHolesScored = 0;
    let totalStrokes18 = 0;
    let totalStrokes9 = 0;
    let roundsPlayed18 = 0;
    let roundsPlayed9 = 0;
    const normalizedScores: number[] = [];
    const scores18: number[] = [];
    const scores9: number[] = [];
    for (const r of scoredRounds) {
      const hp = r.holes_played ?? 18;
      const score = r.total_score as number;
      totalStrokes += score;
      totalHolesScored += hp;
      normalizedScores.push(Math.round(score * (18 / hp)));
      if (hp <= 9) {
        totalStrokes9 += score;
        roundsPlayed9++;
        scores9.push(score);
      } else if (hp === 18) {
        // Strictly 18-hole rounds only, matching the canonical cache
        // (scoring_average over holes_played = 18). Partial rounds (10-17)
        // are excluded here; they still feed the normalized "all" average.
        totalStrokes18 += score;
        roundsPlayed18++;
        scores18.push(score);
      }
    }

    const roundsPlayed = scoredRounds.length;
    const scoringAverage18 = roundsPlayed18 > 0
      ? totalStrokes18 / roundsPlayed18
      : null;
    const scoringAverage9 = roundsPlayed9 > 0
      ? totalStrokes9 / roundsPlayed9
      : null;
    // Canonical scoring average = strictly 18-hole rounds, matching
    // golf_player_stats_cache (and therefore the dashboard / CoachHelm / player
    // surfaces). Previously this card showed an all-rounds 18-normalized figure,
    // which disagreed with the cache by ~0.2-0.4 strokes for players with a
    // 9-hole round. Fall back to the normalized figure only when a player has no
    // full 18-hole rounds, so the card never shows "—".
    const scoringAverage = scoringAverage18 ?? (totalHolesScored > 0
      ? (totalStrokes / totalHolesScored) * 18
      : null);
    const bestRound = normalizedScores.length > 0 ? Math.min(...normalizedScores) : null;
    const worstRound = normalizedScores.length > 0 ? Math.max(...normalizedScores) : null;
    const bestRound18 = scores18.length > 0 ? Math.min(...scores18) : null;
    const bestRound9 = scores9.length > 0 ? Math.min(...scores9) : null;

    // Calculate scoring trend (last 5 vs previous 5) using normalized scores
    let scoringTrend: number | null = null;
    if (normalizedScores.length >= 6) {
      const recent5 = normalizedScores.slice(0, 5);
      const previous5 = normalizedScores.slice(5, 10);
      if (previous5.length >= 3) {
        const recentAvg = recent5.reduce((a, b) => a + b, 0) / recent5.length;
        const prevAvg = previous5.reduce((a, b) => a + b, 0) / previous5.length;
        scoringTrend = recentAvg - prevAvg; // Negative is good (improving)
      }
    }

    // Aggregate hole stats
    let totalFairwayHits = 0;
    let totalFairwayOpps = 0;
    let totalGirHits = 0;
    let totalGirOpps = 0;
    let totalPutts = 0;
    let totalHolesWithPutts = 0;
    let totalBirdies = 0;
    let totalHolesWithScore = 0;

    playerRounds.forEach(round => {
      const holes = holesByRound[round.id] || [];
      holes.forEach(hole => {
        // Fairway (only par 4s and 5s). Exclude holes where fairway_hit was never
        // recorded (NULL) — mirrors the GIR rule below and the player stats page.
        // Counting a NULL flag as a miss understated FW% and disagreed with the
        // player page, which recovers the real outcome from tee-shot data (e.g. a
        // re-tee after a penalty that finds the fairway). "Of the holes where we
        // know the tee result, what fraction found the fairway" is the right rate.
        if (hole.par >= 4 && hole.fairway_hit !== null) {
          totalFairwayOpps++;
          if (hole.fairway_hit) totalFairwayHits++;
        }
        // GIR
        if (hole.gir !== null) {
          totalGirOpps++;
          if (hole.gir) totalGirHits++;
        }
        // Putts — track the holes that actually carry a putts value so the
        // per-round denominator matches the numerator (some holes lack putts;
        // counting them in the denominator understated putts/round).
        if (hole.putts !== null && hole.putts > 0) {
          totalPutts += hole.putts;
          totalHolesWithPutts++;
        }
        // Birdies (score exactly par - 1 — eagles are NOT birdies; matches
        // the canonical cache definition of birdies_per_round)
        if (hole.score !== null) {
          totalHolesWithScore++;
          if (hole.score === hole.par - 1) totalBirdies++;
        }
      });
    });

    const fairwayPct = totalFairwayOpps > 0
      ? (totalFairwayHits / totalFairwayOpps) * 100
      : null;
    const girPct = totalGirOpps > 0
      ? (totalGirHits / totalGirOpps) * 100
      : null;
    // Normalize putts to 18-hole equivalent. Denominator = holes that actually
    // carry a putts value (totalHolesWithPutts), NOT every scored hole — the
    // numerator only summed holes with a non-null putts, so dividing by all
    // scored holes (Σ holes_played) understated putts/round whenever some holes
    // lacked a recorded putt count.
    const puttsPerRound = totalHolesWithPutts > 0 && totalPutts > 0
      ? (totalPutts / totalHolesWithPutts) * 18
      : null;

    // Birdies per round: normalize to 18-hole equivalent
    // golf_holes.score is stored per-hole — null values indicate pre-score-tracking rounds
    const birdiesPerRound = totalHolesWithScore > 0
      ? (totalBirdies / totalHolesWithScore) * 18
      : null;

    return {
      id: player.id,
      first_name: player.first_name || '',
      last_name: player.last_name || '',
      avatar_url: player.avatar_url,
      graduation_year: player.graduation_year,
      handicap: player.handicap,
      rounds_played: roundsPlayed,
      scoring_average: scoringAverage,
      best_round: bestRound,
      worst_round: worstRound,
      fairway_pct: fairwayPct,
      gir_pct: girPct,
      putts_per_round: puttsPerRound,
      birdies_per_round: birdiesPerRound,
      scoring_trend: scoringTrend,
      rounds_played_18: roundsPlayed18,
      rounds_played_9: roundsPlayed9,
      scoring_average_18: scoringAverage18,
      scoring_average_9: scoringAverage9,
      best_round_18: bestRound18,
      best_round_9: bestRound9,
    };
  });

  // The data-rich Fairway team-stats surface inside the .fairway-ds scope on
  // a bg-canvas page. It receives the SAME data the route already resolved
  // (teamId-scoped players + per-player intelligence) plus two thin reads
  // that JOIN already-populated tables: team leak maps (raw shots vs PGA)
  // and per-player standing snapshots.
  const intelligenceByPlayer = intelligenceResult.success && intelligenceResult.data
    ? Object.fromEntries(
        intelligenceResult.data.players.map((p) => [
          p.playerId,
          {
            composite: p.composite,
            overall: p.categories?.overall ?? null,
            topInsightTitle: p.topInsight?.title ?? null,
            topInsightPriority: p.topInsight?.priority ?? null,
            insightCount: p.insightCount,
          },
        ]),
      )
    : {};
  // Honesty flags: a FAILED action must read as "couldn't load" (with retry),
  // NOT as a cheerful empty. Distinguish failure (success === false) from a
  // successful-but-empty result so the surface never masks a backend error.
  const intelligenceError = !intelligenceResult.success;
  // sampleSize = teammates with a stats-cache row that fed the z-score
  // normalization; < 3 makes every composite statistically unstable (the
  // composite UI should down-tone it). 0 when the fetch failed/returned none.
  const intelligenceSampleSize = intelligenceResult.success && intelligenceResult.data
    ? intelligenceResult.data.sampleSize
    : 0;
  // Batched: ONE chunked .in('player_id', ...) read for every roster player
  // instead of N admin queries (one per player).
  const [leakRes, standingByPlayer] = await Promise.all([
    getTeamLeakMaps(teamId),
    loadPlayersStandingMap(playersWithStats.map((p) => p.id)),
  ]);
  const leakError = !leakRes.success;
  return (
    <div className={fairwayScope('min-h-full bg-canvas bg-canvas-gradient font-fw-sans text-text-primary')}>
      <FairwayTeamStats
        teamName={team?.name ?? 'Your Team'}
        players={playersWithStats}
        intelligenceByPlayer={intelligenceByPlayer}
        intelligenceError={intelligenceError}
        intelligenceSampleSize={intelligenceSampleSize}
        leakMaps={leakRes.success ? leakRes.data ?? null : null}
        leakError={leakError}
        standingByPlayer={standingByPlayer}
      />
    </div>
  );
}
