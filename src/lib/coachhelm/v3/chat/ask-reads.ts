import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { applyInsightVisibility } from '@/lib/coachhelm/v3/insight-visibility';
import { computeTeamPatterns, TEAM_PATTERN_MIN_ROUNDS } from '@/lib/coachhelm/v3/team-pattern/pattern';
import { toClassDay, type ChClassDay } from '@/lib/golf/class-day-shape';
import { practiceRpc, practiceTables } from '@/lib/golf/practice-db';
import { isPracticeMissing } from '@/lib/golf/practice-errors';
import { todayIsoInZone } from '@/lib/golf/timezone';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerError } from '@/lib/server-error-logger';
import type { CoachChatContext } from './context';
import { nowIso, unavailableEnvelope, type ToolEnvelope } from './provenance';
import { loadCountedRounds } from './season-rule';

type Sb = SupabaseClient<Database>;

const envelope = (summary: string, detail: Record<string, unknown>, coverage: ToolEnvelope['coverage'] = 'complete', note: string | null = null): ToolEnvelope => ({
  summary,
  measurements: [],
  series: [],
  detail,
  coverage,
  coverage_note: note,
  as_of: nowIso(),
});

const failed = async (what: string, action: string, ctx: CoachChatContext, err: unknown): Promise<void> => {
  await logServerError(`${what}: ${err instanceof Error ? err.message : JSON.stringify(err)}`, { action, feature: 'coachhelm_chat', userId: ctx.coach_id, handled: true });
};

/**
 * What several players share, from the reads the Board already shows: the same cause family in enough of the roster (`team-pattern/pattern.ts`). The tool is
 * registered only while `coachhelm_team_pattern_v1` is on, so Ask never says what the Board hides. Reads the stored evidence directly, like `get_root_causes`:
 * a chat read is not the coach seeing the Board, so no exposure is recorded.
 */
export async function getTeamPatterns(sb: Sb, ctx: CoachChatContext): Promise<ToolEnvelope> {
  const ids = ctx.roster.map((p) => p.id);
  if (ids.length === 0) return envelope('No players on the roster.', { patterns: [] }, 'empty');
  const reads: Array<{ id: string; player_id: string; insight_type: string; evidence: unknown }> = [];
  for (const chunk of chunkIds(ids)) {
    const { data, error } = await applyInsightVisibility(sb.from('golf_coach_insights').select('id, player_id, insight_type, evidence').in('player_id', chunk).not('evidence', 'is', null)).limit(500);
    if (error) {
      await failed('getTeamPatterns reads failed', 'coachhelm.ask.teamPatterns', ctx, error);
      return unavailableEnvelope('Could not read the team patterns.', 'The reads query failed.');
    }
    reads.push(...(data ?? []).flatMap((r) => (r.player_id ? [{ id: r.id, player_id: r.player_id, insight_type: r.insight_type ?? '', evidence: r.evidence }] : [])));
  }
  const counted = await loadCountedRounds(sb, ids, '1900-01-01');
  if (counted.error) {
    await failed('getTeamPatterns rounds failed', 'coachhelm.ask.teamPatterns', ctx, 'rounds');
    return unavailableEnvelope('Could not read the team patterns.', 'The rounds query failed.');
  }
  const per = new Map<string, number>();
  for (const r of counted.rounds) per.set(r.player_id, (per.get(r.player_id) ?? 0) + 1);
  const eligible = new Set([...per].filter(([, n]) => n >= TEAM_PATTERN_MIN_ROUNDS).map(([id]) => id));
  const result = computeTeamPatterns({ teamId: ctx.team_id, reads, rosterTotal: ids.length, eligiblePlayerIds: eligible });
  const names = new Map(ctx.roster.map((p) => [p.id, p.name]));
  const patterns = result.patterns.map((p) => ({
    label: p.label,
    players: p.members.map((m) => names.get(m) ?? 'A player'),
    member_count: p.members.length,
    roster_with_reads: p.roster_with_reads,
    strokes_a_round: p.strokes_sum,
    common_next: p.common_next,
    as_of_window_end: p.window_end,
  }));
  const note = `Players need ${TEAM_PATTERN_MIN_ROUNDS} counted rounds to be read; ${result.roster_with_reads} of ${result.roster_total} have them.`;
  if (patterns.length === 0) return envelope('No cause is shared by enough of the team yet.', { patterns: [], below_threshold: result.below_threshold }, 'empty', note);
  return envelope(`${patterns.length} shared pattern${patterns.length === 1 ? '' : 's'} across the team.`, { patterns, below_threshold: result.below_threshold }, result.roster_with_reads < result.roster_total ? 'partial' : 'complete', note);
}

/** Practice as the app can see it: plans (a table that may not exist yet), practices held, and the sessions players logged. No shot data. */
export async function getPractice(sb: Sb, ctx: CoachChatContext, input: { since_days: number }): Promise<ToolEnvelope> {
  const days = Math.min(Math.max(input.since_days, 1), 180);
  const since = new Date(Date.now() - days * 86_400_000);
  const sinceDay = todayIsoInZone(ctx.timezone, since);
  const [events, sessions, plans] = await Promise.all([
    sb.from('golf_events').select('id, title, start_time, status').eq('team_id', ctx.team_id).eq('event_type', 'practice').gte('start_time', since.toISOString()).order('start_time', { ascending: false }).limit(60),
    fetchAllRowsResult<{ player_id: string; session_date: string }>((from, to) => sb.from('golf_practice_sessions').select('player_id, session_date').in('player_id', ctx.roster.map((p) => p.id)).gte('session_date', sinceDay).order('id', { ascending: true }).range(from, to)),
    practiceTables(sb).from('golf_practice_plans').select('id, event_id, title, step, status, version, published_version, updated_at').eq('team_id', ctx.team_id).order('updated_at', { ascending: false }).limit(20),
  ]);
  if (events.error || sessions.error) {
    await failed('getPractice failed', 'coachhelm.ask.practice', ctx, events.error ?? sessions.error);
    return unavailableEnvelope('Could not read practice.', 'The practice query failed. This is not the same as no practice.');
  }
  const plansMissing = !!plans.error && isPracticeMissing(plans.error.code);
  if (plans.error && !plansMissing) {
    await failed('getPractice plans failed', 'coachhelm.ask.practice', ctx, plans.error);
    return unavailableEnvelope('Could not read practice plans.', 'The plans query failed.');
  }
  const held = (events.data ?? []).filter((e) => e.status !== 'cancelled');
  const planRows = plansMissing ? [] : ((plans.data ?? []) as Array<{ id: string; event_id: string | null; title: string | null; status: string; step: string; version: number; published_version: number | null; updated_at: string }>);
  const planFor = new Map(planRows.filter((p) => p.event_id).map((p) => [p.event_id as string, p]));
  const names = new Map(ctx.roster.map((p) => [p.id, p.name]));
  const logged = new Map<string, number>();
  for (const s of sessions.data ?? []) logged.set(s.player_id, (logged.get(s.player_id) ?? 0) + 1);
  const detail = {
    window_days: days,
    practices: held.map((e) => {
      const plan = planFor.get(e.id);
      return { event_id: e.id, title: e.title, starts_at: e.start_time, plan: plan ? { title: plan.title, status: plan.status, published: plan.published_version != null } : null };
    }),
    plans: planRows.map((p) => ({ plan_id: p.id, title: p.title, status: p.status, published: p.published_version != null, updated_at: p.updated_at })),
    sessions_logged: { total: (sessions.data ?? []).length, by_player: [...logged].map(([id, n]) => ({ player: names.get(id) ?? 'A player', sessions: n })).sort((a, b) => b.sessions - a.sessions) },
  };
  const note = plansMissing ? 'Practice plans are not set up for this team yet, so only practices and logged sessions are shown.' : null;
  const none = held.length === 0 && planRows.length === 0 && (sessions.data ?? []).length === 0;
  return envelope(none ? `Nothing practice-related in the last ${days} days.` : `${held.length} practice${held.length === 1 ? '' : 's'} and ${planRows.length} plan${planRows.length === 1 ? '' : 's'} in the last ${days} days.`, detail, none ? 'empty' : plansMissing ? 'partial' : 'complete', note);
}

/** Titles, folders and whether players can see each: never a file's contents. */
export async function getDocuments(sb: Sb, ctx: CoachChatContext, input: { folder?: string; limit: number }): Promise<ToolEnvelope> {
  const limit = Math.min(Math.max(input.limit, 1), 60);
  let q = sb.from('golf_documents').select('id, title, folder, category, is_public, updated_at').eq('team_id', ctx.team_id).eq('is_test', false).order('updated_at', { ascending: false }).limit(limit);
  if (input.folder) q = q.eq('folder', input.folder);
  const { data, error } = await q;
  if (error) {
    await failed('getDocuments failed', 'coachhelm.ask.documents', ctx, error);
    return unavailableEnvelope('Could not read Documents.', 'The documents query failed.');
  }
  const docs = (data ?? []).map((d) => ({ document_id: d.id, title: d.title, folder: d.folder, category: d.category, players_can_see: d.is_public === true, updated_at: d.updated_at }));
  const folders = [...new Set(docs.map((d) => d.folder).filter((f): f is string => !!f))];
  if (docs.length === 0) return envelope(input.folder ? `Nothing in ${input.folder}.` : 'No documents yet.', { documents: [], folders }, 'empty');
  return envelope(`${docs.length} document${docs.length === 1 ? '' : 's'}${input.folder ? ` in ${input.folder}` : ''}.`, { documents: docs, folders }, docs.length >= limit ? 'partial' : 'complete', docs.length >= limit ? `Only the ${limit} most recently changed are listed.` : null);
}

const DAYS_CAP = 14;
/** The replies the calendar counts, legacy column values included (kept in step with `replyOf` in read-tools). */
function reply(status: string | null | undefined): 'accepted' | 'maybe' | 'declined' | 'pending' {
  if (status === 'accepted' || status === 'attending') return 'accepted';
  if (status === 'tentative' || status === 'maybe') return 'maybe';
  if (status === 'declined' || status === 'not_attending' || status === 'excused' || status === 'unexcused') return 'declined';
  return 'pending';
}

export interface CalendarEventRow {
  id: string;
  title: string;
  event_type: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  status: string | null;
  all_day?: boolean | null;
}

/** Who is in class during each timed event, from the class-day read for each team-local date (at most {@link DAYS_CAP} dates; the note says when it stopped). */
export async function classConflicts(sb: Sb, ctx: CoachChatContext, events: readonly CalendarEventRow[]): Promise<{ byEvent: Map<string, string[]>; capped: boolean; failed: boolean }> {
  const dates = [...new Set(events.filter((e) => e.all_day !== true).map((e) => todayIsoInZone(ctx.timezone, new Date(e.start_time))))].sort();
  const days = new Map<string, ChClassDay | null>();
  let failedDay = false;
  for (const date of dates.slice(0, DAYS_CAP)) {
    const res = await practiceRpc(sb, 'golf_team_class_day', { p_team_id: ctx.team_id, p_on: date });
    if (res.error) {
      failedDay = true;
      days.set(date, null);
    } else days.set(date, toClassDay(res.data));
  }
  const names = new Map(ctx.roster.map((p) => [p.id, p.name]));
  const byEvent = new Map<string, string[]>();
  for (const e of events) {
    if (e.all_day === true) continue;
    const day = days.get(todayIsoInZone(ctx.timezone, new Date(e.start_time)));
    if (!day) continue;
    const start = Date.parse(e.start_time);
    const end = e.end_time ? Date.parse(e.end_time) : start + 3_600_000;
    const inClass = day.players.filter((p) => p.tracked && p.blocks.some((b) => Date.parse(b.startsAt) < end && Date.parse(b.endsAt) > start)).map((p) => names.get(p.playerId) ?? 'A player');
    if (inClass.length) byEvent.set(e.id, inClass);
  }
  return { byEvent, capped: dates.length > DAYS_CAP, failed: failedDay };
}

/** Replies and check-ins per event; "pending" is everyone on the event with no reply yet. */
export async function attendanceByEvent(sb: Sb, eventIds: readonly string[]): Promise<{ counts: Map<string, { accepted: number; maybe: number; declined: number; pending: number; checked_in: number }>; failed: boolean }> {
  const counts = new Map<string, { accepted: number; maybe: number; declined: number; pending: number; checked_in: number }>();
  for (const id of eventIds) counts.set(id, { accepted: 0, maybe: 0, declined: 0, pending: 0, checked_in: 0 });
  for (const chunk of chunkIds(eventIds)) {
    const { data, error } = await fetchAllRowsResult<{ event_id: string; status: string | null; checked_in: boolean | null }>((from, to) => sb.from('golf_event_attendance').select('event_id, status, checked_in').in('event_id', chunk).order('id', { ascending: true }).range(from, to));
    if (error) return { counts, failed: true };
    for (const a of data ?? []) {
      const c = counts.get(a.event_id);
      if (!c) continue;
      c[reply(a.status)] += 1;
      if (a.checked_in) c.checked_in += 1;
    }
  }
  return { counts, failed: false };
}
