import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import type { TeamSgFigures, TeamSgWindow } from '@/lib/coachhelm/v3/chat/practice-reads';
import { holeRounds } from './round-scope';
import { countsForScoring, groupByPlayer, loadSeasonRounds, seasonStartDate, type ChRound } from './season';
import { loadSince, practiceCut, roundsInFilter } from './stats-common';
import { filterFor, type ChFilter } from './stats-filter';
import { sgOver } from './stats-weight';

/**
 * The team's strokes gained per round, the one calculation Team Stats' cards, Home's four parts and CoachHelm's Ask read share (QA-1):
 * each player's rounds in the filter's window (`roundsInFilter`, per player, so "Last 10" is every player's newest ten), practice
 * left out as Stats leaves it, the rounds with their holes pooled, and the mean of the stored per-round legs per 18 holes, null
 * under the floor of three whole rounds. Pure over the rounds, so a page and Ask can differ only by the window they name.
 */
export function teamStrokesGainedOver(rounds: readonly ChRound[], playerIds: readonly string[], f: ChFilter, seasonStart: string): TeamSgFigures {
  const scoring = practiceCut(f) ? rounds.filter(countsForScoring) : [...rounds];
  const byPlayer = groupByPlayer(scoring);
  const window: ChRound[] = [];
  for (const id of playerIds) window.push(...roundsInFilter(byPlayer.get(id) ?? [], f, seasonStart));
  const holes = holeRounds(window);
  const dates = holes.map((r) => r.round_date.slice(0, 10)).sort();
  return {
    legs: sgOver(holes).legs,
    rounds: holes.length,
    players: new Set(holes.map((r) => r.player_id)).size,
    window_start: dates[0] ?? null,
    window_end: dates[dates.length - 1] ?? null,
  };
}

/** The filter each window of Ask's read names: Team Stats' range switch (`ChRange`), nothing of Ask's own. */
export function filterForTeamSg(window: TeamSgWindow): ChFilter {
  return window === 'season' ? filterFor('season') : filterFor('last10', window === 'last5' ? 5 : window === 'last20' ? 20 : 10);
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Ask's `get_team_strokes_gained` source: the rounds Team Stats loads for the same window (`loadSince`, the team's zone for the
 * season's turn), through `teamStrokesGainedOver`. Null when the rounds could not be read. The route passes this in; CoachHelm's
 * own code does not import Clubhouse.
 */
export async function loadTeamStrokesGained(sb: Supabase, team: { timezone: string; playerIds: readonly string[] }, window: TeamSgWindow): Promise<TeamSgFigures | null> {
  const f = filterForTeamSg(window);
  const start = seasonStartDate(new Date(), team.timezone);
  if (team.playerIds.length === 0) return teamStrokesGainedOver([], [], f, start);
  const loaded = await loadSeasonRounds(sb, [...team.playerIds], { surface: 'ask.team_strokes_gained', since: loadSince(f, start) });
  return loaded.error ? null : teamStrokesGainedOver(loaded.rounds, team.playerIds, f, start);
}
