import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { countsForScoring, isFull18, loadSeasonRounds, seasonStartDate, type ChRound } from '@/clubhouse/data/season';
import { todayIsoInZone } from '@/lib/golf/timezone';
import { requireRosterPlayer, type CoachChatContext } from './context';
import { coverageFor, nowIso, readFigure, unavailableEnvelope, type Measurement, type ToolEnvelope } from './provenance';

type Sb = SupabaseClient<Database>;

/** Rounded to the hundredth: the figure Roster shows and the precision the model can round down from. */
const mean2 = (xs: readonly number[]): number | null => (xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100);

/** The rounds a season average reads on Roster: full 18-hole countable rounds, practice left out. */
export const inSeasonAverage = (r: ChRound): boolean => isFull18(r) && countsForScoring(r);

function summarize(rounds: readonly ChRound[]) {
  const counted = rounds.filter(inSeasonAverage);
  const scores = counted.map((r) => r.total_score).filter((n): n is number => n != null);
  const toPars = counted.map((r) => r.score_to_par).filter((n): n is number => n != null);
  return {
    rounds: counted.length,
    avg_score: mean2(scores),
    avg_to_par: mean2(toPars),
    to_par_rounds: toPars.length,
    practice_left_out: rounds.filter((r) => isFull18(r) && !countsForScoring(r)).length,
    nine_holes_left_out: rounds.filter((r) => !isFull18(r)).length,
  };
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** One season's envelope from rounds already read by `loadSeasonRounds`. Pure, so the rule can be tested without a database. */
export function seasonScoringEnvelope(ctx: CoachChatContext, rounds: readonly ChRound[], player: { id: string; name: string } | null, season: { start: string; today: string }): ToolEnvelope {
  const people = player ? [player] : ctx.roster;
  const byPlayer = new Map<string, ChRound[]>();
  for (const r of rounds) byPlayer.set(r.player_id, [...(byPlayer.get(r.player_id) ?? []), r]);

  const asFigures = (entity: Measurement['entity'], s: ReturnType<typeof summarize>): Measurement[] => {
    const window = { entity, window_start: season.start, window_end: season.today, unit: 'score' as const, sample_unit: 'rounds' as const, direction: 'lower_better' as const, source: 'rounds' };
    return [
      ...(s.avg_score == null ? [] : [readFigure({ ...window, metric_id: 'season_scoring_average', metric_label: 'Scoring average, this season', value: s.avg_score, sample_size: s.rounds, method: 'mean_total_score_full_18_countable_rounds_no_practice' })]),
      ...(s.avg_to_par == null ? [] : [readFigure({ ...window, metric_id: 'season_scoring_to_par', metric_label: 'Scoring to par, this season', value: s.avg_to_par, sample_size: s.to_par_rounds, method: 'mean_score_to_par_full_18_countable_rounds_no_practice' })]),
    ];
  };

  const players = people.map((p) => ({ player_id: p.id, name: p.name, ...summarize(byPlayer.get(p.id) ?? []) }));
  const team = summarize(rounds);
  const withRounds = players.filter((p) => p.rounds > 0);
  const without = players.filter((p) => p.rounds === 0).map((p) => p.name);

  const measurements: Measurement[] = [
    ...(player ? [] : asFigures({ kind: 'team', id: ctx.team_id, label: ctx.team_name }, team)),
    ...withRounds.flatMap((p) => asFigures({ kind: 'player', id: p.player_id, label: p.name }, p)),
  ];

  const leftOut = [
    team.practice_left_out > 0 ? `${plural(team.practice_left_out, 'practice round')} left out` : null,
    team.nine_holes_left_out > 0 ? `${plural(team.nine_holes_left_out, '9-hole round')} left out` : null,
    without.length > 0 && !player ? `No counted rounds for ${without.join(', ')}` : null,
  ].filter(Boolean);

  const who = player?.name ?? ctx.team_name;
  return {
    summary: team.rounds === 0 ? `${who} has no counted rounds this season.` : `${who}: ${plural(team.rounds, 'counted round')} this season${player ? '' : `, ${plural(withRounds.length, 'player')} of ${people.length}`}.`,
    measurements,
    series: [],
    detail: {
      kind: 'season_scoring',
      season_start: season.start,
      rule: 'Full 18-hole countable rounds since 1 August in the team zone, practice left out. The same rounds Roster averages.',
      ...(player ? { player_id: player.id } : { team: { team_scope: true, ...team } }),
      players,
    },
    coverage: team.rounds === 0 ? 'empty' : coverageFor(withRounds.length, people.length),
    coverage_note: leftOut.length > 0 ? `${leftOut.join('. ')}.` : null,
    as_of: nowIso(),
  };
}

/**
 * This season's scoring, on Roster's rule (`loadSeasonRounds` is Roster's own reader): the stats cache's windows run across seasons,
 * so before this read "his scoring average this season" had no answer. No `player_id` is the team, pooled per round, and each player.
 */
export async function getSeasonScoring(sb: Sb, ctx: CoachChatContext, input: { player_id?: string }): Promise<ToolEnvelope> {
  const player = input.player_id ? requireRosterPlayer(ctx, input.player_id) : null;
  const ids = player ? [player.id] : ctx.roster.map((p) => p.id);
  const now = new Date();
  const season = { start: seasonStartDate(now, ctx.timezone), today: todayIsoInZone(ctx.timezone, now) };
  const { rounds, error } = await loadSeasonRounds(sb as never, ids, { surface: 'ask-season', since: season.start });
  if (error) return unavailableEnvelope('Could not read this season’s rounds.', 'The rounds query failed. This is not the same as having no rounds.');
  return seasonScoringEnvelope(ctx, rounds, player, season);
}
