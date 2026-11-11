import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import type { TeamSgFigures, TeamSgWindow } from '@/lib/coachhelm/v3/chat/practice-reads';
import { holeRounds } from './round-scope';
import { countsForScoring, groupByPlayer, loadSeasonRounds, seasonStartDate, type ChRound } from './season';
import { loadSince, practiceCut, roundsInFilter, sgPolicyAtSource, sgSourceFor } from './stats-common';
import { sgMixOf, type ChSgMix } from './stats-sg-mix';
import { filterFor, type ChFilter } from './stats-filter';
import { teamStrokesGained } from './stats-team-sg';

/**
 * The team's strokes gained per round, the one calculation Team Stats' cards, Home's four parts, CoachHelm Team and CoachHelm's Ask
 * read share (QA-1): each player's rounds in the filter's window (`roundsInFilter`, per player, so "Last 10" is every player's newest
 * ten), practice left out as Stats leaves it, then `teamStrokesGained` (data/stats-team-sg.ts) over the rounds with their holes: only
 * the players with three whole rounds that have strokes gained count, their rounds pooled per 18 holes. This used to pool every round
 * with no per-player floor, so a player's first tracked round or two moved Ask's figure and not Team Stats'. `rounds` and `players` are
 * the rounds and players the figure rests on. Pure over the rounds, so a page and Ask can differ only by the window they name.
 */
export function teamStrokesGainedOver(rounds: readonly ChRound[], playerIds: readonly string[], f: ChFilter, seasonStart: string): TeamSgFigures {
  return teamSgRead(rounds, playerIds, f, seasonStart).figures;
}

/** The figure, and the rounds with their holes of the players it counts (what the measured-or-estimated split is taken over). */
function teamSgRead(rounds: readonly ChRound[], playerIds: readonly string[], f: ChFilter, seasonStart: string): { figures: TeamSgFigures; counted: ChRound[] } {
  const scoring = practiceCut(f) ? rounds.filter(countsForScoring) : [...rounds];
  const byPlayer = groupByPlayer(scoring);
  const window: ChRound[] = [];
  for (const id of playerIds) window.push(...roundsInFilter(byPlayer.get(id) ?? [], f, seasonStart));
  const sg = teamStrokesGained(holeRounds(window), playerIds);
  const counted = holeRounds(window).filter((r) => sg.ready.has(r.player_id));
  const dates = counted.filter((r) => r.strokes_gained_total != null).map((r) => r.round_date.slice(0, 10)).sort();
  const figures: TeamSgFigures = {
    legs: { tee: sg.legs[0], approach: sg.legs[1], around: sg.legs[2], putting: sg.legs[3] },
    rounds: sg.rounds,
    players: sg.ready.size,
    window_start: dates[0] ?? null,
    window_end: dates[dates.length - 1] ?? null,
  };
  return { figures, counted };
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
export async function loadTeamStrokesGained(sb: Supabase, team: { timezone: string; playerIds: readonly string[] }, window: TeamSgWindow): Promise<TeamSgFiguresWithMix | null> {
  const f = filterForTeamSg(window);
  const start = seasonStartDate(new Date(), team.timezone);
  if (team.playerIds.length === 0) return { ...teamStrokesGainedOver([], [], f, start), sg_mix: null };
  const loaded = await loadSeasonRounds(sb, [...team.playerIds], { surface: 'ask.team_strokes_gained', since: loadSince(f, start) });
  if (loaded.error) return null;
  // Estimated strokes gained (stats-sg-mix.ts): the policy on the rounds as loaded, then the split over the rounds the figure counts.
  const policy = await sgPolicyAtSource(sb, loaded.rounds, 'ask.team_strokes_gained');
  const { figures, counted } = teamSgRead(policy.rounds, team.playerIds, f, start);
  const source = await sgSourceFor(sb, policy.early, counted, 'ask.team_strokes_gained');
  return { ...figures, sg_mix: sgMixOf(counted, source) };
}

/**
 * `TeamSgFigures` with, added, how many of its rounds were shot-tracked and how many estimated from the scorecard (`sg_mix`; null when
 * that read failed). Additive: a reader that does not know the field ignores it, and one that does can say "6 of 10 rounds
 * shot-tracked; 4 estimated from the scorecard" with `sgMixWords` (stats-sg-mix.ts).
 */
export type TeamSgFiguresWithMix = TeamSgFigures & { sg_mix: ChSgMix | null };
