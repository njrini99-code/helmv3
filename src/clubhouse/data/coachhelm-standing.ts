import 'server-only';
import { getInsightsForPlayer, type EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { createClient } from '@/lib/supabase/server';
import { loadPlayerCohort } from '@/lib/coachhelm/v3/counterfactual/player-cohort-loader';
import { loadPlayerSeasonStandingMap, loadPlayerStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import { chLogServer } from '../lib/track-server';
import { earliestStaleFloor, loadPlayerDismissed, loadVisible, newestRounds, PLAYER_FEED_LIMIT, playerTeam } from './coachhelm';
import { isOpenFinding } from './coachhelm-classify';
import { readEngineFlags } from './coachhelm-engine';
import { seasonStartDate } from './season';
import { loadPlayerSeasonFigures, loadPlayerTeamZone } from './season-figures';
import { shapeReadsLifecycle } from './coachhelm-engine-shape';
import type { ChLadderReads } from './coachhelm-ladder-shape';
import { toChInsight } from './coachhelm-map';
import { toChStanding, type ChStandBaselineRead, type ChStandWindowKind, type ChStanding } from './coachhelm-standing-shape';
import type { ChViewLoad } from './coachhelm-views-shape';
import type { ChViewer } from './coachhelm-voice';

export type * from './coachhelm-standing-shape';

type Supabase = Awaited<ReturnType<typeof createClient>>;

const log = (what: string, err: unknown) => chLogServer('coachhelm', what, err, 'coachhelm');

/**
 * Their scoring average, the base every projection starts from, and the attempts a round the counterfactual sizes by. The average is
 * this season's (`season-figures.ts`, stats and charts audit 2026-11-15, SC-01): the lifetime stats cache it came from counts test and
 * total-only rounds in production until the held OD-01 chain is applied, and Standing's rows are this season's. The attempts stay the
 * cache row's, the row the putt-distance and scrambling generators size the same projections from (DC-ATTEMPT-1), so a row's
 * projection is the one its insight card states; `roundsPlayed` is that row's rounds on file, the attempts' own denominator and the
 * count an all-time page names. `loadPlayerScoringBaseline` answers null for a failed read as it does for "under five rounds", so it
 * cannot tell the two apart; this read can, and logs the failure.
 */
async function readBaseline(supabase: Supabase, playerId: string, zone: Promise<string>): Promise<ChStandBaselineRead> {
  const [res, season] = await Promise.all([
    supabase
      .from('golf_player_stats_cache')
      .select('rounds_played, sand_attempts, putt_attempts_3_5ft, putt_attempts_5_10ft, putt_attempts_10_15ft, putt_attempts_15_25ft, putt_attempts_25_plus_ft')
      .eq('player_id', playerId)
      .maybeSingle(),
    zone.then((z) => loadPlayerSeasonFigures(supabase, playerId, { zone: z, surface: 'coachhelm.standing' })),
  ]);
  if (res.error) {
    log('standing.baseline', res.error);
    return { status: 'failed' };
  }
  // The season's rounds or their stats rows did not read (logged where they were read): no projection starts from a guess.
  if (season.status === 'failed') return { status: 'failed' };
  const row = res.data;
  const rounds = row?.rounds_played ?? null;
  // The player's own attempts a round, as the putt-distance and scrambling generators size the same projections (DC-ATTEMPT-1).
  const attemptsPerRound: Partial<Record<MetricId, number>> = {};
  if (row && rounds != null && rounds > 0) {
    const per = (n: number | null) => (n != null && n > 0 ? n / rounds : null);
    for (const metric of Object.keys(PUTT_ATTEMPTS) as Array<keyof typeof PUTT_ATTEMPTS>) {
      const v = per(row[PUTT_ATTEMPTS[metric]]);
      if (v != null) attemptsPerRound[metric] = v;
    }
    const sand = per(row.sand_attempts);
    if (sand != null) attemptsPerRound.scrambling_pct_sand = sand;
  }
  return { status: 'ok', roundsPlayed: rounds, scoringAverage: season.set.scoring, scoringRounds: season.set.n, attemptsPerRound };
}

/** Each putt band's attempts column in `golf_player_stats_cache` (the putt-distance generator's own map). */
const PUTT_ATTEMPTS = {
  putts_made_3_5ft_pct: 'putt_attempts_3_5ft',
  putts_made_5_10ft_pct: 'putt_attempts_5_10ft',
  putts_made_10_15ft_pct: 'putt_attempts_10_15ft',
  putts_made_15_25ft_pct: 'putt_attempts_15_25ft',
  putts_made_25_plus_ft_pct: 'putt_attempts_25_plus_ft',
} as const satisfies Partial<Record<MetricId, string>>;

/**
 * Whether the player's cohort (their team's gender, which picks the Tour the rows are graded against) reads. `loadPlayerStandingMap`
 * resolves it inside and answers the men's default when it cannot, with nothing to say so; this is the same lookup, read beside it,
 * so a page that fell back says the Tour may not be theirs. The two reads can disagree (a transient failure in only one), so this
 * is a check that catches a failing lookup, not a proof of the one the map used.
 */
async function readCohort(playerId: string): Promise<{ failed: boolean }> {
  try {
    return { failed: (await loadPlayerCohort(playerId)).failed === true };
  } catch (err) {
    log('standing.cohort', err);
    return { failed: true };
  }
}

/**
 * The player's open reads for the ladder's "Because" (`coachhelm-ladder-shape.ts`): the reads the Deep dive delivers, kept to current
 * findings by the Board's own `isOpenFinding`, each mapped by the Board's mapper in their own voice. Every link goes to
 * `?view=deep-dive&insight=<id>`, so the ids come from the Deep dive's own feed read (`getInsightsForPlayer`, or the coach's feed for the
 * player when a coach's page hands one over (`feed`), with its limit and
 * `includeMore`), which applies the ranking, the player's feedback, the reads-v1 folding and the limit: a raw visible-row list can hold
 * an id that folding or the limit removes, and the ladder would link to a read the destination does not draw. `drawnLater` answers
 * no ids, so the feed records nothing as shown (this page shows only titles). A feed that comes back empty is told from a first run
 * as the Deep dive does (`loadVisible`). A read that fails, the team or Tour lookup and the newest round included, is `failed`, which
 * the ladder says, and the strokes still draw: a null Tour or newest round would read a stat that beats the Tour as a finding or an
 * out-of-date read as current.
 */
async function readLadderReads(supabase: Supabase, playerId: string, viewer: ChViewer, readFeed: (() => Promise<EvidenceInsight[]>) | undefined): Promise<ChLadderReads> {
  try {
    const [feed, team] = await Promise.all([
      readFeed ? readFeed() : getInsightsForPlayer(playerId, { limit: PLAYER_FEED_LIMIT, drawnLater: () => Promise.resolve([]), includeMore: true }),
      playerTeam(supabase, playerId),
    ]);
    if (team.error || team.tourError) return { status: 'failed' };
    if (feed.length === 0) {
      const [visible, dismissed] = await Promise.all([loadVisible(supabase, [playerId]), loadPlayerDismissed(supabase, playerId)]);
      if (visible.error || dismissed.error) return { status: 'failed' };
      // Reads the player has not dismissed that the feed could draw: the feed failed without saying so.
      const undrawn = visible.rows.filter((r) => !dismissed.ids.has(r.id)).length;
      if (undrawn > 0) {
        log('standing.reads', new Error(`the feed came back empty with ${undrawn} visible read(s)`));
        return { status: 'failed' };
      }
      return { status: 'ok', list: [] };
    }
    const mine = feed.filter((r) => r.player_id === playerId);
    const newest = await newestRounds(supabase, [playerId], earliestStaleFloor(mine));
    if (newest.error) return { status: 'failed' };
    const newestRound = newest.days.get(playerId) ?? null;
    const flags = readEngineFlags();
    const now = new Date().toISOString();
    // With the recheck on, a cleared or retired read is not open (the Deep dive's own shaping); with it off this keeps them all.
    const kept = shapeReadsLifecycle(
      mine.filter((r) => isOpenFinding(r, team.tour, newestRound)),
      flags.recheck,
      viewer,
      now,
    ).kept;
    const list = kept.map((r) => {
      const card = toChInsight(r, { tour: team.tour, newestRound, viewer, engine: { flags, lifecycle: null, focus: null, now } });
      const cause = card.engine?.cause;
      return { id: r.id, category: r.category, title: card.title, priority: card.priority, word: card.evidence.read?.word ?? null, cause: cause ? { word: cause.word, line: cause.line } : null };
    });
    return { status: 'ok', list };
  } catch (err) {
    log('standing.reads', err);
    return { status: 'failed' };
  }
}

/**
 * Whether the player has a test round on file, which the lifetime Standing table counts (DF-P-05). A failed read is logged and
 * answers false: the page then says nothing about test rounds rather than guess.
 */
async function hasTestRounds(supabase: Supabase, playerId: string): Promise<boolean> {
  const { count, error } = await supabase.from('golf_rounds').select('id', { count: 'exact', head: true }).eq('player_id', playerId).eq('is_test', true);
  if (error) {
    log('standing.test_rounds', error);
    return false;
  }
  return (count ?? 0) > 0;
}

/**
 * The rows Standing draws, and the window they cover. This season's table first (owner decision 9: from 1 August in the team's time
 * zone, each row with its own round count); while that table is not deployed (its migration is held), the lifetime table, which the
 * page labels "Rounds on file" rather than call it a season or "All time" (DF-P-05: its pressure rows are the last 90 days). Only rows that are this player's are kept, whatever a loader returned.
 */
export async function readStandingRows(playerId: string): Promise<{ ok: true; rows: PlayerStanding[]; window: ChStandWindowKind } | { ok: false }> {
  try {
    const season = await loadPlayerSeasonStandingMap(playerId);
    if (season.status === 'ok') return { ok: true, rows: [...season.rows.values()].filter((r) => r.player_id === playerId), window: 'season' };
    const lifetime = await loadPlayerStandingMap(playerId);
    return { ok: true, rows: [...lifetime.values()].filter((r) => r.player_id === playerId), window: 'all_time' };
  } catch (err) {
    log('standing.map', err);
    return { ok: false };
  }
}

/**
 * The player's Standing (`?view=standing`), read after the route has checked CoachHelm is on for them. `playerId` is the session's,
 * or a coach's branded scope's (`data/coachhelm-player.ts`, the only other caller, with `viewer` the coach's), never an address's: the standing loaders read `golf_player_standing_season` (or `golf_player_standing`) through the service client (both are written
 * by the refresh, and the season table has no policy at all), so the id it is given is the only thing scoping it.
 *
 * The standing read is the page: when it throws the page says it did not load, never "no standing yet". The scoring-average read
 * is only the projections' base, so its failure is its own flag on the page (`baselineFailed`) and the rows still draw.
 */
export async function loadPlayerStanding(input: { playerId: string; viewer?: ChViewer; feed?: () => Promise<EvidenceInsight[]> }): Promise<ChViewLoad<ChStanding>> {
  try {
    const supabase = await createClient();
    // The team's clock dates "Refreshed" (A20) and starts the season the scoring average covers.
    const zoneRead = loadPlayerTeamZone(supabase, input.playerId, 'coachhelm.standing');
    const [map, baseline, cohort, reads, zone] = await Promise.all([
      readStandingRows(input.playerId),
      readBaseline(supabase, input.playerId, zoneRead),
      readCohort(input.playerId),
      readLadderReads(supabase, input.playerId, input.viewer ?? { role: 'player' }, input.feed),
      zoneRead,
    ]);
    if (!map.ok) return { status: 'failed' };
    // A season row from before this season's 1 August (on the team's clock) is last season's: the nightly run at 02:20 UTC on
    // 1 August is still 31 July in every US zone, and a team outside a chunk waits longer. It is dropped, never labelled "This season".
    const since = seasonStartDate(new Date(), zone);
    const rows = map.window === 'season' ? map.rows.filter((r) => typeof r.season_start === 'string' && r.season_start.slice(0, 10) >= since) : map.rows;
    const shaped = toChStanding(rows, baseline, reads, input.viewer, zone, map.window);
    // DF-P-05: the lifetime table counts test rounds until the OD-01 chain is applied, so a player with one on file is told.
    const tests = map.window === 'all_time' && rows.length > 0 ? await hasTestRounds(supabase, input.playerId) : false;
    const data = tests ? { ...shaped, window: { ...shaped.window, testRounds: true as const } } : shaped;
    return { status: 'ready', data: { ...data, ...(cohort.failed ? { cohortFailed: true as const } : {}) } };
  } catch (err) {
    log('standing', err);
    return { status: 'failed' };
  }
}
