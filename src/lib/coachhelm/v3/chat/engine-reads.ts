import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { requireRosterPlayer, type CoachChatContext } from './context';
import { stripSelfReferences } from './knowledge/reference-plain';
import { storedInsightText } from './stored-text';
import { nowIso, readFigure, unavailableEnvelope, type ToolEnvelope } from './provenance';
import { attendanceByEvent, classConflicts } from './ask-reads';
import { inSeasonAverage, loadCountedRounds, seasonStartDate } from './season-rule';

type Sb = SupabaseClient<Database>;

/** The open causes the Board shows, read from stored evidence, never through `getInsightsForCoach`: a chat read isn't the coach seeing the Board (no exposure). */
export async function getRootCauses(sb: Sb, ctx: CoachChatContext, input: { player_id: string }): Promise<ToolEnvelope> {
  const player = requireRosterPlayer(ctx, input.player_id);
  const { data, error } = await applyInsightVisibility(sb.from('golf_coach_insights').select('id, title, category, evidence').eq('player_id', player.id).not('evidence', 'is', null)).limit(50);
  if (error) return unavailableEnvelope(`Could not read ${player.name}'s causes.`, 'The reads query failed.');
  const causes = (data ?? []).flatMap((r) => {
    const c = (r.evidence as { cause?: { state?: string; word?: string; text?: string } } | null)?.cause;
    return c && c.state ? [{ insight_id: r.id, title: stripSelfReferences(r.title ?? ''), category: r.category, state: c.state, word: c.word ?? null, text: storedInsightText(c.text) }] : [];
  });
  return { summary: `${player.name}: ${causes.length} open cause${causes.length === 1 ? '' : 's'}.`, measurements: [], series: [], detail: { player_id: player.id, player: player.name, causes }, coverage: causes.length ? 'complete' : 'empty', coverage_note: causes.length ? null : 'No stored cause for this player.', as_of: nowIso() };
}

/**
 * Events in a window on the team's clock, with who replied and checked in, and who is in class during each timed event. Class meetings themselves stay out
 * of the list (they are one player's semester); a class conflict is named on the event it overlaps.
 */
export async function getCalendar(sb: Sb, ctx: CoachChatContext, input: { from: string; to: string }): Promise<ToolEnvelope> {
  const zone = ctx.timezone;
  const { data, error } = await sb.from('golf_events').select('id, title, event_type, start_time, end_time, all_day, location, status, requires_rsvp').eq('team_id', ctx.team_id).neq('event_type', 'class').gte('start_time', input.from).lte('start_time', input.to).order('start_time').limit(200);
  if (error) return unavailableEnvelope('Could not read the calendar.', 'The events query failed. This is not the same as a free week.');
  const rows = data ?? [];
  const [attendance, conflicts] = rows.length ? await Promise.all([attendanceByEvent(sb, rows.map((e) => e.id)), classConflicts(sb, ctx, rows)]) : [null, null];
  const events = rows.map((e) => ({
    id: e.id,
    title: e.title,
    event_type: e.event_type,
    start_time: e.start_time,
    end_time: e.end_time,
    location: e.location,
    status: e.status,
    // Where a row has a screen of its own, the row carries its address (CAPABILITIES E-34). Never read out to the model.
    href: `/golf/dashboard/calendar?event=${e.id}`,
    ...(e.requires_rsvp === true && attendance && !attendance.failed ? { replies: attendance.counts.get(e.id) } : {}),
    ...(conflicts && !conflicts.failed ? { in_class: conflicts.byEvent.get(e.id) ?? [] } : {}),
  }));
  const notes = [
    attendance?.failed ? 'Replies could not be read, so none are shown.' : null,
    conflicts?.failed ? 'Class times could not be read for some days, so class conflicts are missing.' : null,
    conflicts?.capped ? 'Class conflicts are shown for the first 14 days with events only.' : null,
    rows.length >= 200 ? 'Only the first 200 events are listed.' : null,
  ].filter((n): n is string => !!n);
  return { summary: `${rows.length} events on the team calendar.`, measurements: [], series: [], detail: { zone, events, from: input.from, to: input.to }, coverage: notes.length ? 'partial' : 'complete', coverage_note: notes.length ? notes.join(' ') : null, as_of: nowIso() };
}

/** Par, yardage and handicap by hole, and this team's scoring to par by hole from its rounds. */
export async function getCourse(sb: Sb, ctx: CoachChatContext, input: { course_id: string }): Promise<ToolEnvelope> {
  const tee = await sb.from('golf_course_tees').select('id').eq('course_id', input.course_id).limit(1).maybeSingle();
  if (tee.error) return unavailableEnvelope('Could not read that course.', 'The course query failed.');
  const holes = tee.data ? await sb.from('golf_course_tee_holes').select('hole_number, par, yardage, handicap_index').eq('tee_id', tee.data.id).order('hole_number') : { data: [], error: null };
  if (holes.error) return unavailableEnvelope('Could not read that course.', 'The holes query failed.');
  const rounds = await sb.from('golf_rounds').select('id').eq('team_id', ctx.team_id).eq('course_id', input.course_id).eq('status', 'completed').eq('is_test', false).limit(200);
  if (rounds.error) return unavailableEnvelope('Could not read that course.', 'The rounds query failed.');
  const ids = (rounds.data ?? []).map((r) => r.id);
  const scored = ids.length ? await sb.from('golf_holes').select('hole_number, par, score').in('round_id', ids) : { data: [], error: null };
  const by = new Map<number, { sum: number; n: number }>();
  for (const h of scored.data ?? []) {
    if (h.score == null) continue;
    const e = by.get(h.hole_number) ?? { sum: 0, n: 0 };
    e.sum += h.score - h.par;
    e.n++;
    by.set(h.hole_number, e);
  }
  // A hole's par and yardage are facts about the course and stand beside anyone's name; only the scoring is this team's.
  const list = (holes.data ?? []).map((h) => ({ ...h, team: { team_scope: true as const, to_par: by.get(h.hole_number) ? Math.round((by.get(h.hole_number)!.sum / by.get(h.hole_number)!.n) * 100) / 100 : null, rounds: by.get(h.hole_number)?.n ?? 0 } }));
  const entity = { kind: 'team' as const, id: ctx.team_id, label: ctx.team_name };
  const points = list.flatMap((h) => (h.team.to_par == null ? [] : [{ at: `Hole ${h.hole_number}`, value: h.team.to_par, bucket: `Hole ${h.hole_number}`, sample_size: h.team.rounds }]));
  const series = points.length ? [{ metric_id: 'team_to_par_by_hole', metric_label: 'Team scoring to par by hole', unit: 'score' as const, entity, points, window_start: null, window_end: null, as_of: nowIso(), coverage: 'complete' as const, coverage_note: null, source: 'rounds', method: 'mean_hole_score_minus_par', benchmark: null, direction: 'lower_better' as const }] : [];
  return { summary: `Course read: ${list.length} holes, ${ids.length} team rounds.`, measurements: [], series, detail: { kind: 'hole_strip', holes: list }, coverage: list.length ? 'complete' : 'empty', coverage_note: list.length ? null : 'No hole data for this course.', as_of: nowIso() };
}

/** This season against last, with last season's usual range: mean plus or minus one standard deviation of round values. The method is in the note. */
export function seasonBand(values: readonly number[]): { mean: number; lo: number; hi: number; n: number } | null {
  if (values.length === 0) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  const r = (v: number) => Math.round(v * 100) / 100;
  return { mean: r(mean), lo: r(mean - sd), hi: r(mean + sd), n: values.length };
}

export async function compareSeasons(sb: Sb, ctx: CoachChatContext, input: { player_id?: string }): Promise<ToolEnvelope> {
  const player = input.player_id ? requireRosterPlayer(ctx, input.player_id) : null;
  const seasonStart = seasonStartDate(new Date(), ctx.timezone);
  const start = Number(seasonStart.slice(0, 4));
  // Roster's rule, like get_season_scoring and get_team_rounds: a full 18-hole round that counts, practice left out, the active roster.
  const { rounds, error } = await loadCountedRounds(sb, player ? [player.id] : ctx.roster.map((p) => p.id), `${start - 1}-08-01`);
  if (error) return unavailableEnvelope('Could not compare the seasons.', 'The rounds query failed.');
  const counted = rounds.filter((r) => inSeasonAverage(r) && r.score_to_par != null);
  const split = (y: number) => counted.filter((r) => (y === start ? r.round_date >= seasonStart : r.round_date < seasonStart)).map((r) => r.score_to_par as number);
  const thisYear = seasonBand(split(start));
  const last = seasonBand(split(start - 1));
  const entity = player ? { kind: 'player' as const, id: player.id, label: player.name } : { kind: 'team' as const, id: ctx.team_id, label: ctx.team_name };
  const seasonFigure = (band: { mean: number; n: number } | null, from: number, label: string) => (band ? [readFigure({ metric_id: 'score_to_par_per_18', metric_label: `Score to par per 18, ${label}`, unit: 'score', value: band.mean, entity, window_start: `${from}-08-01`, window_end: `${from + 1}-07-31`, sample_size: band.n, sample_unit: 'rounds', direction: 'lower_better', source: 'rounds', method: 'mean_round_to_par_scaled_to_18' })] : []);
  const measurements = [...seasonFigure(thisYear, start, 'this season'), ...seasonFigure(last, start - 1, 'last season')];
  return { summary: `${player?.name ?? ctx.team_name}: this season against last.`, measurements, series: [], detail: { ...(player ? { player_id: player.id } : { team_scope: true }), metric_scope: 'score_to_par', kind: 'season_compare', metric: 'Score to par per 18', this_season: thisYear, last_season: last, method: 'Usual range is last season’s mean plus or minus one standard deviation of round values.' }, coverage: thisYear && last ? 'complete' : 'partial', coverage_note: thisYear && last ? null : 'One of the seasons has no rounds yet.', as_of: nowIso() };
}
