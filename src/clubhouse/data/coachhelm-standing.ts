import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { loadPlayerCohort } from '@/lib/coachhelm/v3/counterfactual/player-cohort-loader';
import { loadPlayerStandingMap } from '@/lib/coachhelm/v3/standing/loader';
import { chLogServer } from '../lib/track-server';
import { toChStanding, type ChStandBaselineRead, type ChStanding } from './coachhelm-standing-shape';
import type { ChViewLoad } from './coachhelm-views-shape';

export type * from './coachhelm-standing-shape';

type Supabase = Awaited<ReturnType<typeof createClient>>;

const log = (what: string, err: unknown) => chLogServer('coachhelm', what, err, 'coachhelm');

/**
 * Their scoring average and rounds on file, through the session's client (their own cache row, as the Fairway page reads it). It is
 * the base every projection starts from and says how many rounds stand behind the page. `loadPlayerScoringBaseline` answers null
 * for a failed read as it does for "under five rounds", so it cannot tell the two apart; this read can, and logs the failure.
 */
async function readBaseline(supabase: Supabase, playerId: string): Promise<ChStandBaselineRead> {
  const res = await supabase.from('golf_player_stats_cache').select('rounds_played, scoring_average').eq('player_id', playerId).maybeSingle();
  if (res.error) {
    log('standing.baseline', res.error);
    return { status: 'failed' };
  }
  return { status: 'ok', roundsPlayed: res.data?.rounds_played ?? null, scoringAverage: res.data?.scoring_average ?? null };
}

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
 * The player's Standing (`?view=standing`), read after the route has checked CoachHelm is on for them. `playerId` is the session's,
 * never an address's: `loadPlayerStandingMap` reads `golf_player_standing` through the service client (that table is written by
 * the nightly refresh and has no per-player policy to lean on), so the id it is given is the only thing scoping it.
 *
 * The standing read is the page: when it throws the page says it did not load, never "no standing yet". The scoring-average read
 * is only the projections' base, so its failure is its own flag on the page (`baselineFailed`) and the rows still draw.
 */
export async function loadPlayerStanding(input: { playerId: string }): Promise<ChViewLoad<ChStanding>> {
  try {
    const supabase = await createClient();
    const [map, baseline, cohort] = await Promise.all([
      loadPlayerStandingMap(input.playerId).then(
        // The map is this player's already; a row that is anyone else's is never drawn, whatever the loader returned.
        (m) => ({ ok: true as const, rows: [...m.values()].filter((r) => r.player_id === input.playerId) }),
        (err: unknown) => {
          log('standing.map', err);
          return { ok: false as const };
        },
      ),
      readBaseline(supabase, input.playerId),
      readCohort(input.playerId),
    ]);
    if (!map.ok) return { status: 'failed' };
    return { status: 'ready', data: { ...toChStanding(map.rows, baseline), ...(cohort.failed ? { cohortFailed: true as const } : {}) } };
  } catch (err) {
    log('standing', err);
    return { status: 'failed' };
  }
}
