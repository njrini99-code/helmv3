'use server';

/**
 * P-5 Tournaments from the calendar: the four server actions behind the calendar editor's tournament section, round
 * mode, cancel and restore, and stop tracking. Behind `golf_tournaments_v1` (off; not yet in config/feature-flags.yml,
 * so it evaluates off everywhere): with it off every action returns `flag_off` before any read.
 *
 * Gate order (4.33's): flag, signed in, zod, verifyTeamAccess, then the RPC through the request's RLS client. Every
 * RPC is SECURITY INVOKER and checks is_golf_team_coach itself. A failure comes back with the raised refusal as `code`
 * (TournamentRefusal) beside its copy, so callers branch on the code.
 *
 * Notifications follow today's rules: nothing unless the coach asked for replies (owner, 2026-10-08). A create with
 * RSVP on writes one invitation per player on R1 (owner call 6) and never touches attendance (the RPC wrote it); a
 * replayed create sends nothing. A round moved in round mode notifies as a plain move does (notifyEventUpdate, RSVP
 * gated). A cancel tells players once per tournament, or once for a single round, through the shared cancel fan-out.
 */
import { after } from 'next/server';
import { revalidatePath, updateTag } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { CACHE_TAGS } from '@/lib/cache/tags';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { verifyTeamAccess } from '@/lib/auth/verify-player-access';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { fanOutEventCancelled, fanOutEventInvitation } from '@/lib/calendar/fan-out';
import { tourRpc, tourTable, type CreateFromCalendarRpcArgs, type UpdateRoundRpcArgs } from '@/lib/golf/tournaments/db';
import { refusalCopy, refusalOf, type TournamentRefusal } from '@/lib/golf/tournaments/refusals';
import { rangeText } from '@/lib/golf/tournaments/dates';

const FLAG = 'golf_tournaments_v1';

export type TourActionResult<T> = { success: true; data: T } | { success: false; error: string; code: TournamentRefusal };

const uuid = z.string().uuid();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const startType = z.enum(['tee_times', 'shotgun', 'two_tees']);
const instant = z.string().datetime({ offset: true });

const createSchema = z
  .object({
    teamId: uuid,
    requestId: uuid,
    fromEventId: uuid.optional(),
    name: z.string().trim().min(1).max(120),
    courseId: uuid.optional(),
    courseLabel: z.string().trim().min(1).max(120).optional(),
    format: z.enum(['5c4', '6c5', '6c4', 'custom', 'match', 'medal_match', 'individual']),
    playersPerTeam: z.number().int().min(1).max(9).optional(),
    counting: z.number().int().min(1).max(9).optional(),
    holesPerRound: z.union([z.literal(9), z.literal(18)]),
    eventKind: z.enum(['regular', 'conference', 'ncaa_regional', 'ncaa_championship', 'exhibition']).optional(),
    fieldSize: z.number().int().min(1).max(40).optional(),
    host: z.string().trim().max(120).optional(),
    resultsUrl: z.string().trim().regex(/^https:\/\//).max(500).optional(),
    rounds: z
      .array(
        z.object({
          date: day,
          startAt: instant,
          endAt: instant.nullable().optional(),
          allDay: z.boolean(),
          startType,
          courseId: uuid.nullable().optional(),
          courseLabel: z.string().trim().min(1).max(120).nullable().optional(),
          teeId: uuid.nullable().optional(),
          eventId: uuid.nullable().optional(),
        }),
      )
      .min(1)
      .max(6),
    description: z.string().max(5000).optional(),
    requiresRsvp: z.boolean(),
    rsvpDeadline: instant.optional(),
    attendeeIds: z.array(uuid).max(200),
    qualifierId: uuid.optional(),
    itineraryId: uuid.optional(),
    entries: z.array(z.object({ playerId: uuid, role: z.enum(['lineup', 'alternate', 'individual']), slot: z.number().int().min(1).max(9).nullable() })).max(20).optional(),
  })
  // CH-6140: one of the two, unless every round names its own.
  .refine((v) => v.courseId || v.courseLabel || v.rounds.every((r) => r.courseId || r.courseLabel), { message: 'course' });

export type CreateFromCalendarInput = z.input<typeof createSchema>;

const patchSchema = z.object({
  startAt: instant.optional(),
  endAt: instant.nullable().optional(),
  allDay: z.boolean().optional(),
  startType: startType.optional(),
  description: z.string().max(5000).nullable().optional(),
  requiresRsvp: z.boolean().optional(),
  rsvpDeadline: instant.nullable().optional(),
  shiftTeeSheet: z.boolean().optional(),
  attendeeIds: z.array(uuid).max(200).optional(),
});
export type TournamentRoundPatch = z.input<typeof patchSchema>;
const versionSchema = z.number().int().min(1);

type Client = Awaited<ReturnType<typeof createClient>>;
type RpcError = { code?: string; message: string } | null;

function refused<T>(code: TournamentRefusal, ctx: Parameters<typeof refusalCopy>[1] = {}): TourActionResult<T> {
  return { success: false, error: refusalCopy(code, ctx).text, code };
}

/** One retry on a deadlock (40P01): two coaches saving the same tournament at once. */
async function withDeadlockRetry<R extends { error: RpcError }>(call: () => Promise<R>): Promise<R> {
  const first = await call();
  return first.error?.code === '40P01' ? call() : first;
}

function revalidate(tournamentId?: string) {
  revalidatePath('/golf/dashboard/calendar');
  revalidatePath('/golf/dashboard/tournaments');
  if (tournamentId) revalidatePath(`/golf/dashboard/tournaments/${tournamentId}`);
  updateTag(CACHE_TAGS.CALENDAR);
  updateTag(CACHE_TAGS.DASHBOARD);
}

async function gate(): Promise<{ supabase: Client; userId: string } | TournamentRefusal> {
  if (!isFlagEnabled(FLAG)) return 'flag_off';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'not_coach';
  return { supabase, userId: user.id };
}

/** Players on an event, as user ids, for its Bell rows (the request's client: the coach reads their own event). */
async function eventUserIds(supabase: Client, eventId: string, playerIds?: string[]): Promise<string[]> {
  let q = supabase.from('golf_event_attendance').select('player_id').eq('event_id', eventId);
  if (playerIds) q = q.in('player_id', playerIds);
  const { data: rows, error } = await q;
  if (error) throw new Error(`attendance read failed: ${error.message}`);
  const ids = [...new Set((rows ?? []).map((r) => r.player_id).filter(Boolean))];
  if (!ids.length) return [];
  const { data: players, error: playersError } = await supabase.from('golf_players').select('id, user_id').in('id', ids);
  if (playersError) throw new Error(`player read failed: ${playersError.message}`);
  return (players ?? []).map((p) => p.user_id).filter((id): id is string => Boolean(id));
}

// ── Create ──

async function createTournamentFromCalendarImpl(input: CreateFromCalendarInput): Promise<TourActionResult<{ tournamentId: string; version: number; replayed: boolean; rounds: { roundNumber: number; eventId: string }[] }>> {
  const g = await gate();
  if (typeof g === 'string') return refused(g);
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return refused(parsed.error.issues.some((i) => i.path[0] === 'name') ? 'bad_name' : parsed.error.issues.some((i) => i.path[0] === 'rounds' && i.code === 'too_big') ? 'round_count' : 'bad_input');
  const v = parsed.data;
  const access = await verifyTeamAccess(v.teamId, g.userId, g.supabase);
  if (!access.allowed) return refused('not_coach');

  const args: CreateFromCalendarRpcArgs = {
    p: {
      team_id: v.teamId,
      request_id: v.requestId,
      name: v.name,
      ...(v.fromEventId ? { from_event_id: v.fromEventId } : {}),
      ...(v.courseId ? { course_id: v.courseId } : {}),
      ...(v.courseLabel ? { course_label: v.courseLabel } : {}),
      format: v.format,
      ...(v.playersPerTeam != null ? { players_per_team: v.playersPerTeam } : {}),
      ...(v.counting != null ? { counting: v.counting } : {}),
      holes_per_round: v.holesPerRound,
      ...(v.eventKind ? { event_kind: v.eventKind } : {}),
      ...(v.fieldSize != null ? { field_size: v.fieldSize } : {}),
      ...(v.host ? { host: v.host } : {}),
      ...(v.resultsUrl ? { results_url: v.resultsUrl } : {}),
      rounds: v.rounds.map((r) => ({
        date: r.date,
        start_at: r.startAt,
        ...(r.endAt ? { end_at: r.endAt } : {}),
        all_day: r.allDay,
        start_type: r.startType,
        ...(r.courseId ? { course_id: r.courseId } : {}),
        ...(r.courseLabel ? { course_label: r.courseLabel } : {}),
        ...(r.teeId ? { tee_id: r.teeId } : {}),
        ...(r.eventId ? { event_id: r.eventId } : {}),
      })),
      event: {
        ...(v.description ? { description: v.description } : {}),
        requires_rsvp: v.requiresRsvp,
        ...(v.rsvpDeadline ? { rsvp_deadline: v.rsvpDeadline } : {}),
        attendee_ids: v.attendeeIds,
      },
      ...(v.qualifierId ? { qualifier_id: v.qualifierId } : {}),
      ...(v.itineraryId ? { itinerary_id: v.itineraryId } : {}),
      ...(v.entries?.length ? { entries: v.entries.map((e) => ({ player_id: e.playerId, role: e.role, slot: e.slot })) } : {}),
    },
  };

  const res = await withDeadlockRetry(() => tourRpc(g.supabase, 'golf_tournament_create_from_calendar', args));
  let out = res.data;
  if (res.error) {
    const code = refusalOf(res.error);
    // A concurrent double submit loses on the request id's unique index: read the winner back once. Found on this
    // team, it is this save (success, sending nothing); otherwise the save failed.
    if (code === 'request_conflict' && res.error.code === '23505') {
      const { data: won } = await tourTable(g.supabase, 'golf_tournaments').select('id, version, team_id').eq('request_id', v.requestId).maybeSingle();
      if (won && won.team_id === v.teamId) {
        const { data: rounds } = await tourTable(g.supabase, 'golf_tournament_rounds').select('round_number, round_event_id').eq('tournament_id', won.id).order('round_number');
        out = { tournament_id: won.id, version: won.version, replayed: true, rounds: ((rounds ?? []) as Array<{ round_number: number; round_event_id: string }>).map((r) => ({ round_number: r.round_number, event_id: r.round_event_id })) };
      } else return refused('failed', { save: 'create' });
    } else {
      if (code === 'failed') await logServerError(`createTournamentFromCalendar failed: ${describeError(res.error)}`, { action: 'golf.createTournamentFromCalendar', featureArea: 'calendar' }, 'warning');
      return refused(code, { save: 'create', name: v.name });
    }
  }
  if (!out) return refused('failed', { save: 'create' });

  const rounds = out.rounds.map((r) => ({ roundNumber: r.round_number, eventId: r.event_id }));
  const r1 = rounds[0]?.eventId;
  // A replay (the double tap, a Retry after a lost reply, or the 23505 re-read) already told everyone the first time.
  if (!out.replayed && v.requiresRsvp && r1) {
    const dates = v.rounds.map((r) => r.date).sort();
    const range = rangeText(dates[0]!, dates[dates.length - 1]!);
    const { data: r1Row } = await g.supabase.from('golf_events').select('location').eq('id', r1).maybeSingle();
    const where = r1Row?.location ?? v.courseLabel ?? null;
    const message = `${range}${where ? ` at ${where}` : ''}. Reply for each round.`;
    try {
      const { writeEventInvitationNotices } = await import('@/lib/calendar/rsvp');
      const userIds = await eventUserIds(g.supabase, r1);
      await writeEventInvitationNotices({ eventId: r1, userIds, title: `You’re invited: ${v.name}`, message, refresh: !!v.fromEventId });
    } catch (err) {
      await logServerError(`createTournamentFromCalendar invitation rows failed: ${describeError(err)}`, { action: 'golf.createTournamentFromCalendar.notices', featureArea: 'calendar', extra: { eventId: r1 } }, 'error');
    }
    const fan = { eventId: r1, teamId: v.teamId, title: v.name, dateLabel: range, location: where ?? '', inviteeIds: new Set(v.attendeeIds), inAppTitle: `You’re invited: ${v.name}`, inAppMessage: message };
    after(() => fanOutEventInvitation(fan));
  }

  revalidate(out.tournament_id);
  return { success: true, data: { tournamentId: out.tournament_id, version: out.version, replayed: out.replayed, rounds } };
}

// ── Round mode and the drag ──

async function updateTournamentRoundImpl(roundEventId: string, patch: TournamentRoundPatch, expectedVersion: number): Promise<TourActionResult<{ version: number; teeTimesShifted: number }>> {
  const g = await gate();
  if (typeof g === 'string') return refused(g);
  const id = uuid.safeParse(roundEventId);
  const p = patchSchema.safeParse(patch);
  const ver = versionSchema.safeParse(expectedVersion);
  if (!id.success || !p.success || !ver.success) return refused('bad_input', { save: 'round' });
  const { data: round, error: readError } = await tourTable(g.supabase, 'golf_tournament_rounds').select('team_id, tournament_id, round_number').eq('round_event_id', id.data).maybeSingle();
  if (readError) return refused('failed', { save: 'round' });
  if (!round) return refused('not_found', { save: 'round' });
  const access = await verifyTeamAccess(round.team_id, g.userId, g.supabase);
  if (!access.allowed) return refused('not_coach');

  const q = p.data;
  const args: UpdateRoundRpcArgs = {
    p_round_event_id: id.data,
    p: {
      ...(q.startAt ? { start_at: q.startAt } : {}),
      ...(q.endAt !== undefined ? { end_at: q.endAt } : {}),
      ...(q.allDay !== undefined ? { all_day: q.allDay } : {}),
      ...(q.startType ? { start_type: q.startType } : {}),
      ...(q.description !== undefined ? { description: q.description } : {}),
      ...(q.requiresRsvp !== undefined ? { requires_rsvp: q.requiresRsvp } : {}),
      ...(q.rsvpDeadline !== undefined ? { rsvp_deadline: q.rsvpDeadline } : {}),
      ...(q.shiftTeeSheet !== undefined ? { shift_tee_sheet: q.shiftTeeSheet } : {}),
      ...(q.attendeeIds ? { attendee_ids: q.attendeeIds } : {}),
    },
    p_expected_version: ver.data,
  };
  const res = await withDeadlockRetry(() => tourRpc(g.supabase, 'golf_tournament_update_round', args));
  if (res.error || !res.data) {
    const code = refusalOf(res.error);
    if (code === 'failed') await logServerError(`updateTournamentRound failed: ${describeError(res.error)}`, { action: 'golf.updateTournamentRound', featureArea: 'calendar' }, 'warning');
    return refused(code, { save: 'round', round: round.round_number });
  }
  const moved = q.startAt !== undefined || q.allDay !== undefined;
  const added = res.data.added_player_ids ?? [];
  if (moved || added.length) {
    try {
      const rsvp = await import('@/lib/calendar/rsvp');
      // A day or time change tells players as a plain move does (notifyEventUpdate returns early unless RSVP is on).
      if (moved) await rsvp.notifyEventUpdate(id.data, g.supabase);
      if (added.length) {
        const { data: ev } = await g.supabase.from('golf_events').select('title, requires_rsvp').eq('id', id.data).maybeSingle();
        if (ev?.requires_rsvp) await rsvp.writeEventInvitationNotices({ eventId: id.data, userIds: await eventUserIds(g.supabase, id.data, added), title: `You’re invited: ${ev.title}`, message: 'Reply for each round.' });
      }
    } catch (err) {
      await logServerError(`updateTournamentRound notices failed: ${describeError(err)}`, { action: 'golf.updateTournamentRound.notices', featureArea: 'calendar', extra: { roundEventId: id.data } }, 'warning');
    }
  }
  revalidate(round.tournament_id);
  return { success: true, data: { version: res.data.version, teeTimesShifted: res.data.tee_times_shifted ?? 0 } };
}

// ── Cancel and restore ──

async function setTournamentCancelledImpl(tournamentId: string, roundEventId: string | null, cancelled: boolean, reason: string | null, expectedVersion: number): Promise<TourActionResult<{ version: number; changedEventIds: string[] }>> {
  const g = await gate();
  if (typeof g === 'string') return refused(g);
  const tid = uuid.safeParse(tournamentId);
  const rid = roundEventId == null ? null : uuid.safeParse(roundEventId);
  const ver = versionSchema.safeParse(expectedVersion);
  const why = z.string().trim().max(120).nullable().safeParse(reason);
  if (!tid.success || (rid && !rid.success) || !ver.success || !why.success || typeof cancelled !== 'boolean') return refused('bad_input', { save: 'cancel' });
  const { data: t, error: readError } = await tourTable(g.supabase, 'golf_tournaments').select('id, team_id, name').eq('id', tid.data).maybeSingle();
  if (readError) return refused('failed', { save: 'cancel' });
  if (!t) return refused('not_found', { save: 'cancel' });
  const access = await verifyTeamAccess(t.team_id, g.userId, g.supabase);
  if (!access.allowed) return refused('not_coach');

  const res = await withDeadlockRetry(() => tourRpc(g.supabase, 'golf_tournament_set_cancelled', { p_tournament_id: tid.data, p_round_event_id: rid?.data ?? null, p_cancelled: cancelled, p_reason: why.data || null, p_expected_version: ver.data }));
  if (res.error || !res.data) {
    const code = refusalOf(res.error);
    if (code === 'failed') await logServerError(`setTournamentCancelled failed: ${describeError(res.error)}`, { action: 'golf.setTournamentCancelled', featureArea: 'calendar' }, 'warning');
    let roundNo: number | null = null;
    if (rid?.data) {
      const { data: r } = await tourTable(g.supabase, 'golf_tournament_rounds').select('round_number').eq('round_event_id', rid.data).maybeSingle();
      roundNo = r?.round_number ?? null;
    }
    return refused(code, { save: 'cancel', name: t.name, round: roundNo });
  }
  const changed = res.data.changed_event_ids ?? [];
  // Owner call 12.8 default (b): one notice per tournament, or one for a single round, only when RSVP is on, and only
  // for rounds that actually changed. A restore notifies nobody.
  if (cancelled && changed.length) {
    const noticeOn = rid?.data && changed.includes(rid.data) ? rid.data : changed[0]!;
    const { data: ev } = await g.supabase.from('golf_events').select('title, start_time, location, requires_rsvp').eq('id', noticeOn).maybeSingle();
    if (ev) {
      const notice = { eventId: noticeOn, teamId: t.team_id, title: rid ? ev.title : t.name, startTime: ev.start_time, location: ev.location, reason: why.data ?? '', notifies: ev.requires_rsvp === true };
      after(() => fanOutEventCancelled(notice));
    }
  }
  revalidate(tid.data);
  return { success: true, data: { version: res.data.version, changedEventIds: changed } };
}

// ── Stop tracking ──

async function untrackTournamentImpl(tournamentId: string, expectedVersion: number): Promise<TourActionResult<null>> {
  const g = await gate();
  if (typeof g === 'string') return refused(g);
  const tid = uuid.safeParse(tournamentId);
  const ver = versionSchema.safeParse(expectedVersion);
  if (!tid.success || !ver.success) return refused('bad_input', { save: 'untrack' });
  const { data: t, error: readError } = await tourTable(g.supabase, 'golf_tournaments').select('id, team_id, name').eq('id', tid.data).maybeSingle();
  if (readError) return refused('failed', { save: 'untrack' });
  if (!t) return refused('not_found', { save: 'untrack' });
  const access = await verifyTeamAccess(t.team_id, g.userId, g.supabase);
  if (!access.allowed) return refused('not_coach');
  const res = await withDeadlockRetry(() => tourRpc(g.supabase, 'golf_tournament_untrack', { p_tournament_id: tid.data, p_expected_version: ver.data }));
  if (res.error) {
    const code = refusalOf(res.error);
    if (code === 'failed') await logServerError(`untrackTournament failed: ${describeError(res.error)}`, { action: 'golf.untrackTournament', featureArea: 'calendar' }, 'warning');
    return refused(code, { save: 'untrack', name: t.name });
  }
  revalidate();
  return { success: true, data: null };
}

const observedCreate = withAdminObserved('createTournamentFromCalendar', { demoSafe: true, sport: 'golf', feature: 'calendar_events' }, createTournamentFromCalendarImpl);
const observedUpdate = withAdminObserved('updateTournamentRound', { demoSafe: true, sport: 'golf', feature: 'calendar_events' }, updateTournamentRoundImpl);
const observedCancel = withAdminObserved('setTournamentCancelled', { demoSafe: true, sport: 'golf', feature: 'calendar_events' }, setTournamentCancelledImpl);
const observedUntrack = withAdminObserved('untrackTournament', { demoSafe: true, sport: 'golf', feature: 'calendar_events' }, untrackTournamentImpl);

export async function createTournamentFromCalendar(input: CreateFromCalendarInput) {
  return observedCreate(input);
}
export async function updateTournamentRound(roundEventId: string, patch: TournamentRoundPatch, expectedVersion: number) {
  return observedUpdate(roundEventId, patch, expectedVersion);
}
export async function setTournamentCancelled(tournamentId: string, roundEventId: string | null, cancelled: boolean, reason: string | null, expectedVersion: number) {
  return observedCancel(tournamentId, roundEventId, cancelled, reason, expectedVersion);
}
export async function untrackTournament(tournamentId: string, expectedVersion: number) {
  return observedUntrack(tournamentId, expectedVersion);
}
