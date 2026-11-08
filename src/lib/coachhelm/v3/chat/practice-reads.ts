import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { CoachChatContext } from './context';
import { nowIso, readFigure, unavailableEnvelope, type ToolEnvelope } from './provenance';
import { practiceTables, type TeamDrillRow } from '@/lib/golf/practice-db';
import { isPracticeMissing } from '@/lib/golf/practice-errors';
import { toClassDay } from '@/lib/golf/class-day-shape';
import { LIBRARY_DRILL_KINDS } from '@/lib/coachhelm/v3/practice-plan/library-kinds';
import { getShotPattern } from './shot-reads';

type Sb = SupabaseClient<Database>;
const env = (summary: string, detail: Record<string, unknown>, coverage: ToolEnvelope['coverage'] = 'complete', note: string | null = null): ToolEnvelope => ({ summary, measurements: [], series: [], detail, coverage, coverage_note: note, as_of: nowIso() });

export async function getClassTimes(sb: Sb, ctx: CoachChatContext, input: { date: string }): Promise<ToolEnvelope> {
  const { data, error } = await sb.rpc('golf_team_class_day' as never, { p_team_id: ctx.team_id, p_on: input.date } as never);
  if (error) return unavailableEnvelope('Could not read class times.', 'The class day read failed.');
  const day = toClassDay(data);
  if (!day) return unavailableEnvelope('Class times aren’t set up for this team.', 'No class day data.');
  return env(`Class times on ${input.date}.`, { day });
}

/** The one bank: team drills once `golf_team_drills` exists, then the GolfHelm library. A drill is never invented. */
export async function getDrillBank(sb: Sb, ctx: CoachChatContext, input: { category?: string }): Promise<ToolEnvelope> {
  const team = await practiceTables(sb).from('golf_team_drills').select('id, name, area, kind, minutes').eq('team_id', ctx.team_id).is('archived_at', null).limit(60);
  const teamRows = team.error ? [] : ((team.data ?? []) as Array<Pick<TeamDrillRow, 'id' | 'name' | 'area' | 'kind' | 'minutes'>>);
  if (team.error && !isPracticeMissing(team.error.code)) return unavailableEnvelope('Could not read the drill bank.', 'The team drill read failed.');
  let q = sb.from('golf_drills').select('id, title, category, duration_min').limit(60);
  if (input.category) q = q.eq('category', input.category);
  const lib = await q;
  if (lib.error) return unavailableEnvelope('Could not read the drill bank.', 'The library read failed.');
  const drills = [...teamRows.map((d) => ({ ref: `team:${d.id}`, title: d.name, category: d.area, minutes: d.minutes, kind: d.kind })), ...(lib.data ?? []).map((d) => ({ ref: `lib:${d.id}`, title: d.title, category: d.category, minutes: d.duration_min, kind: d.category ? LIBRARY_DRILL_KINDS[d.category]?.kind : undefined }))];
  if (!drills.length) return env('No drills in the bank yet.', { drills: [] }, 'empty');
  return env(`${drills.length} drills in the bank.`, { drills, ids: drills.map((d) => d.ref) });
}

/** The team's plan format: its sections' names and order. The sheet lays out to it; a draft's wording follows it. */
export async function getPlanFormat(sb: Sb, ctx: CoachChatContext): Promise<ToolEnvelope> {
  const { data, error } = await practiceTables(sb).from('golf_practice_plan_formats').select('name, sections').eq('team_id', ctx.team_id).maybeSingle();
  if (error && !isPracticeMissing(error.code)) return unavailableEnvelope('Could not read the plan format.', 'The format read failed.');
  if (!data) return env('No format set: plans use the standard sheet.', { sections: [] }, 'empty');
  const format = data as { name: string; sections: Array<{ key: string; name: string }> };
  return env(`Plans follow ${format.name}.`, { name: format.name, sections: format.sections });
}

/** The windows Team Stats' range switch offers (`ChRange`): the newest 5, 10 or 20 rounds of each player, or this season. */
export const TEAM_SG_WINDOWS = ['last5', 'last10', 'last20', 'season'] as const;
export type TeamSgWindow = (typeof TEAM_SG_WINDOWS)[number];

/** What the team's strokes-gained source answers (Clubhouse's `teamStrokesGainedOver`): the four legs per round, and the rounds they rest on. */
export type TeamSgFigures = {
  legs: { tee: number | null; approach: number | null; around: number | null; putting: number | null };
  /** The rounds the legs rest on: those with their holes, pooled across players. */
  rounds: number;
  /** Players with at least one such round. */
  players: number;
  /** Oldest and newest round date among them. */
  window_start: string | null;
  window_end: string | null;
};
/** Reads the team's figures for a window; null when the rounds could not be read. Handed in by the route, which may import Clubhouse. */
export type TeamSgSource = (window: TeamSgWindow) => Promise<TeamSgFigures | null>;

const WINDOW_WORDS: Record<TeamSgWindow, string> = {
  last5: 'each player’s newest five rounds',
  last10: 'each player’s newest ten rounds',
  last20: 'each player’s newest twenty rounds',
  season: 'this season',
};

/**
 * The team's strokes gained per area, from the one source Team Stats, Home and the Team view read (`teamStrokesGainedOver`, QA-1):
 * Ask quoting a figure the Stats page does not show for the same window is worse than no figure. `detail.areas` and the
 * measurements are the same four numbers from the same rounds.
 */
export async function getTeamStrokesGained(source: TeamSgSource | undefined, team: { id: string; name: string }, input: { window?: TeamSgWindow } = {}): Promise<ToolEnvelope> {
  const window = input.window ?? 'last10';
  const sg = source ? await source(window) : null;
  if (!sg) return unavailableEnvelope('Could not read strokes gained.', 'The rounds read failed.');
  const hundredth = (v: number | null) => (v === null ? null : Number(v.toFixed(2)));
  const areas = { tee: hundredth(sg.legs.tee), approach: hundredth(sg.legs.approach), short: hundredth(sg.legs.around), putting: hundredth(sg.legs.putting) };
  const detail = { areas, sample_size: sg.rounds, players_with_rounds: sg.players, window, window_start: sg.window_start, window_end: sg.window_end };
  if (Object.values(areas).every((v) => v === null)) return env('No rounds with strokes gained yet.', { ...detail, areas }, 'empty');
  const entity = { kind: 'team' as const, id: team.id, label: team.name };
  // The four areas as measurements, not only `detail.areas`: a composed visual draws figures from `measurements` and nothing else,
  // so a read with an empty list could never be charted (staging, 2026-11-07: "a split needs at least two signed figures").
  // Same ids and labels as a player's strokes-gained legs, so one split draws either.
  const leg = (metric_id: string, metric_label: string, value: number | null) =>
    value === null
      ? []
      : [readFigure({ metric_id, metric_label, unit: 'strokes', value, entity, window_start: sg.window_start, window_end: sg.window_end, sample_size: sg.rounds, sample_unit: 'rounds', direction: 'higher_better', source: 'rounds', method: 'mean_sg_per_round_per_18_over_hole_rounds' })];
  const measurements = [
    ...leg('sg_tee', 'Strokes gained off the tee', areas.tee),
    ...leg('sg_approach', 'Strokes gained approach', areas.approach),
    ...leg('sg_around_green', 'Strokes gained around the green', areas.short),
    ...leg('sg_putting', 'Strokes gained putting', areas.putting),
  ];
  // One player's rounds are not the team's: a season that has only just begun reads as the team and is one person.
  const lean = sg.rounds < 5 || sg.players < 3;
  const from = `${sg.rounds} ${sg.rounds === 1 ? 'round' : 'rounds'} by ${sg.players} ${sg.players === 1 ? 'player' : 'players'}`;
  return {
    ...env(`Team strokes gained, the average per round over ${WINDOW_WORDS[window]}, from ${from}.`, detail, lean ? 'partial' : 'complete', lean ? `Only ${from}, so this is a lean read.` : null),
    measurements,
  };
}

export async function getTeamPuttingProfile(sb: Sb, ctx: CoachChatContext, input: { rounds: number }): Promise<ToolEnvelope> {
  return getShotPattern(sb, ctx, { mode: 'putting', since_days: Math.max(14, input.rounds * 7) });
}
