import 'server-only';
import { getInsightsForPlayer, getThemesForPlayer, type EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { loadActiveGoals, loadRecentlyAchievedGoals } from '@/lib/coachhelm/v3/goals/loader';
import type { Goal } from '@/lib/coachhelm/v3/goals/types';
import type { AssembledThemes } from '@/lib/coachhelm/v3/themes/types';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import { assignedByInsight, countCountableRounds, drillTextByInsight, earliestStaleFloor, loadPlayerDismissed, loadVisible, newestRounds, PLAYER_FEED_LIMIT, playerTeam } from './coachhelm';
import { kindOf } from './coachhelm-classify';
import { diveCounts, orderDive, roundIdsToRead, themesByCategory, toChDeepInsight, type ChDeepDive, type DiveFocusRow, type DiveRoundRow } from './coachhelm-dive-shape';
import { toChInsight } from './coachhelm-map';
import { speak } from './coachhelm-voice';
import type { ChViewLoad } from './coachhelm-views-shape';

export type * from './coachhelm-dive-shape';

type Supabase = Awaited<ReturnType<typeof createClient>>;

const log = (what: string, err: unknown) => chLogServer('coachhelm', what, err, 'coachhelm');

/** The rounds the reads name, through the session's client and for this player only: completed, not a test round. A failed read is `null`, never "no rounds". */
async function readRounds(supabase: Supabase, playerId: string, ids: string[]): Promise<Map<string, DiveRoundRow> | null> {
  const out = new Map<string, DiveRoundRow>();
  for (const chunk of chunkIds([...new Set(ids)])) {
    const res = await supabase
      .from('golf_rounds')
      .select('id, round_date, course_name, total_score, score_to_par, holes_played')
      .eq('player_id', playerId)
      .eq('is_test', false)
      .eq('status', 'completed')
      .in('id', chunk);
    if (res.error) {
      log('dive.rounds', res.error);
      return null;
    }
    for (const r of res.data ?? []) out.set(r.id, r);
  }
  return out;
}

/** The focus areas and goals a player has, which an insight links to. Goals read through the service client, scoped by this player id. `null`: a read failed. */
async function readPlans(supabase: Supabase, playerId: string): Promise<{ focusAreas: DiveFocusRow[]; goals: Goal[] } | null> {
  try {
    const [focus, active, achieved] = await Promise.all([
      supabase
        .from('golf_player_focus_areas')
        .select('id, title, status, from_insight_id, target_metric')
        .eq('player_id', playerId)
        .in('status', ['proposed', 'active', 'in_progress', 'paused', 'completed'])
        .order('created_at', { ascending: false }),
      loadActiveGoals(playerId),
      loadRecentlyAchievedGoals(playerId),
    ]);
    if (focus.error) throw focus.error;
    return { focusAreas: focus.data ?? [], goals: [...active, ...achieved].filter((g) => g.player_id === playerId) };
  } catch (err) {
    log('dive.plans', err);
    return null;
  }
}

/** The category reads. `null`: they did not load (the action answers `success: false`, or throws). */
async function readThemes(playerId: string): Promise<AssembledThemes | null> {
  try {
    const res = await getThemesForPlayer(playerId);
    if (res.success && res.data) return res.data;
    log('dive.themes', res.error ?? 'no themes');
    return null;
  } catch (err) {
    log('dive.themes', err);
    return null;
  }
}

const EMPTY = (rounds: number | null): ChDeepDive => ({ list: [], rounds, themes: {}, roundsFailed: false, plansFailed: false, themesFailed: false, counts: { insights: 0, needs: 0, working: 0, inPlan: 0 } });

/**
 * The player's Deep dive (`?view=deep-dive`), read after the route has checked CoachHelm is on for them. `playerId` is the session's,
 * never an address's, and is the only thing scoping the reads that do not go through RLS (the goals; the standing is not read here).
 *
 * The insights are the Board's: `getInsightsForPlayer`, then the same mapper (`toChInsight`), so one insight reads the same on both.
 * The delivery action answers an empty list when its read fails, so an empty feed is told from a first run the way the Board does
 * (`loadVisible`): rows the player has not dismissed that the feed could draw mean it failed. Each part beside the insights (the rounds
 * behind them, the plans they belong to, the category reads) has its own failure flag, and the page says which part is missing; none
 * of them takes the insights down.
 */
export async function loadPlayerDeepDive(input: { playerId: string }): Promise<ChViewLoad<ChDeepDive>> {
  const { playerId } = input;
  try {
    const supabase = await createClient();
    let feed: EvidenceInsight[];
    try {
      feed = await getInsightsForPlayer(playerId, { limit: PLAYER_FEED_LIMIT });
    } catch (err) {
      log('dive.feed', err);
      return { status: 'failed' };
    }
    const team = await playerTeam(supabase, playerId);
    if (feed.length === 0) {
      const [visible, dismissed] = await Promise.all([loadVisible(supabase, [playerId]), loadPlayerDismissed(supabase, playerId)]);
      if (visible.error || dismissed.error || visible.rows.some((r) => !dismissed.ids.has(r.id))) return { status: 'failed' };
      return { status: 'ready', data: EMPTY(await countCountableRounds(supabase, playerId)) };
    }
    // A card that states no finding is not drawn on the Board, and is not here.
    const drawn = feed.filter((i) => kindOf(i, team.tour) !== 'note');
    if (drawn.length === 0) return { status: 'ready', data: EMPTY(await countCountableRounds(supabase, playerId)) };

    const [drills, assigned, newest, rounds, plans, themes] = await Promise.all([
      drillTextByInsight(supabase, drawn),
      assignedByInsight(
        supabase,
        drawn.map((i) => i.id),
      ),
      newestRounds(supabase, [playerId], earliestStaleFloor(drawn)),
      readRounds(supabase, playerId, drawn.flatMap((i) => roundIdsToRead(i.evidence))),
      readPlans(supabase, playerId),
      readThemes(playerId),
    ]);
    const newestRound = newest.get(playerId) ?? null;
    const say = (t: string) => speak(t, { role: 'player' });
    const list = orderDive(drawn.map((raw) => {
      const base = toChInsight(raw, { drillText: drills.get(raw.id) ?? null, assigned: assigned.get(raw.id) ?? null, tour: team.tour, newestRound, viewer: { role: 'player' } });
      return toChDeepInsight(raw, base, { rounds: rounds ?? new Map(), focusAreas: plans?.focusAreas ?? [], goals: plans?.goals ?? [], themes }, say);
    }));
    return {
      status: 'ready',
      data: { list, rounds: null, themes: themesByCategory(themes), roundsFailed: rounds === null, plansFailed: plans === null, themesFailed: themes === null, counts: diveCounts(list) },
    };
  } catch (err) {
    log('dive', err);
    return { status: 'failed' };
  }
}
