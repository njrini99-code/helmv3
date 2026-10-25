'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { describeError } from '@/lib/utils/describe-error';
import { isUuid } from '@/lib/utils/uuid';
import { TOUR_REFUSAL_COPY, tourRefusalOf, type TourRefusalCode } from '@/lib/golf/tournament-refusals';
import { isFlagEnabled } from '@/lib/flags';
import { resolveCoachActiveTeamForRequest } from '@/lib/golf/dashboard-request-cache';
import { tourTable } from '@/lib/golf/tournaments-tables';
import type { ActionResult } from './golf-action-shared';

/**
 * P016 Tournaments server actions. The writes are held migration 20261024100200's RPCs (SECURITY INVOKER, so the
 * 100100 policies decide every row) plus four plain writes the policies already allow a coach (link a round, enter a
 * score, dismiss a link candidate, save the review). Every action:
 *   - asks golf_tournaments_v1 and golf_clubhouse_ui first: an export is callable without its route, so with the
 *     flag off nothing reaches a tournament table;
 *   - is coach only (the player's writes, a reflection or a link of their own round, are held file 4's);
 *   - returns `{ success: false, error, code }` on a refusal, where `code` is a `TourRefusalCode`
 *     (`src/lib/golf/tournament-refusals.ts`: stale, round_order, round_started, not_set_up, …) and `error` its copy;
 *   - sends nothing to a player: publishing stamps a time, and any message is the coach's to send.
 */

const ROUTE = '/golf/dashboard/tournaments';
// The repo's id check (any well-formed uuid), not zod's version-strict one: seeded and demo ids are not all v4.
const uuid = z.string().refine((v) => isUuid(v), 'not an id');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const instant = z.string().datetime({ offset: true });

type Coach = { supabase: Awaited<ReturnType<typeof createClient>>; teamId: string };

function refuse<T>(code: TourRefusalCode): ActionResult<T> {
  return { success: false, error: TOUR_REFUSAL_COPY[code], code };
}

/** A database refusal: its code, and a report only for what is not an expected refusal. */
async function refused<T>(action: string, error: { code?: string | null; message?: string | null }): Promise<ActionResult<T>> {
  const code = tourRefusalOf(error);
  if (code === 'not_set_up') {
    await logServerEvent(`[tournaments] ${action}: the held Tournaments migrations are not applied`, { action, featureArea: 'calendar_events' });
  } else if (code === 'failed') {
    await logServerError(`[tournaments] ${action} failed: ${describeError(error)}`, { action, featureArea: 'calendar_events', errorCode: error.code ?? undefined });
  }
  return refuse(code);
}

/** The gate, the role and the team, before any read or write. */
async function asCoach<T>(run: (c: Coach) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  // The routes' gate is src/clubhouse/gate.ts (isTournamentsFor), which code outside src/clubhouse may not import: the
  // same two flags here; the Clubhouse team allowlist is the routes', and RLS admits only a coach of the team either way.
  if (!isFlagEnabled('golf_tournaments_v1') || !isFlagEnabled('golf_clubhouse_ui')) return refuse('off');
  const role = await getGolfDashboardRole();
  if (role !== 'coach') return refuse('not_coach');
  const session = await getGolfSessionProfile();
  if (!session) return refuse('not_signed_in');
  if (!session.coach) return refuse('not_coach');
  const team = await resolveCoachActiveTeamForRequest(session.coach.organization_id ?? null, session.coach.id);
  if (team.status !== 'ok') return team.status === 'failed' ? refuse('failed') : refuse('not_coach');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse('not_signed_in');
  return run({ supabase, teamId: team.teamId });
}

async function rpc<T>(c: Coach, action: string, fn: string, args: Record<string, unknown>, map: (data: unknown) => T): Promise<ActionResult<T>> {
  const { data, error } = await c.supabase.rpc(fn as never, args as never);
  if (error) return refused(action, error);
  revalidatePath(ROUTE, 'layout');
  return { success: true, data: map(data) };
}

// ── Inputs ──────────────────────────────────────────────────────────────────────────────────────────────────────

const roundInput = z.object({
  date: day,
  courseId: uuid.nullable().optional(),
  teeId: uuid.nullable().optional(),
  startType: z.enum(['tee_times', 'shotgun', 'two_tees']).optional(),
  firstTeeAt: instant.nullable().optional(),
});

const eventInput = z.object({
  name: z.string().trim().min(1).max(120),
  startDate: day,
  endDate: day,
  courseId: uuid.nullable().optional(),
  format: z.enum(['5c4', '6c5', '6c4', 'custom', 'match', 'medal_match', 'individual']).optional(),
  playersPerTeam: z.number().int().min(1).max(9).optional(),
  counting: z.number().int().min(1).max(9).optional(),
  holesPerRound: z.union([z.literal(9), z.literal(18)]).optional(),
  kind: z.enum(['regular', 'conference', 'ncaa_regional', 'ncaa_championship', 'exhibition']).optional(),
  tiebreak: z.enum(['ties_stand', 'ncaa', 'playoff', 'card_playoff']).optional(),
  fieldSize: z.number().int().min(1).max(40).nullable().optional(),
  line: z.object({ kind: z.enum(['advance', 'cut', 'match_play']), places: z.number().int().min(1).max(40) }).nullable().optional(),
  substitutions: z.boolean().optional(),
  lockMinutes: z.number().int().min(0).max(1440).optional(),
  resultsUrl: z.string().url().startsWith('https://').nullable().optional(),
  host: z.string().max(120).nullable().optional(),
  rounds: z.array(roundInput).min(1).max(6),
});
export type TourEventInput = z.infer<typeof eventInput>;

const createInput = eventInput.extend({
  fromEventId: uuid.nullable().optional(),
  fieldTeams: z.array(z.object({ name: z.string().trim().min(1).max(80), sameDivision: z.boolean().optional(), bTeam: z.boolean().optional() })).max(40).optional(),
  adviceGivers: z.array(uuid).max(4).optional(),
});
export type TourCreateInput = z.infer<typeof createInput>;

/** The RPC payload (snake case, as 100200 reads it); only the keys the input set, so an edit leaves the rest alone. */
function payloadOf(i: Partial<TourEventInput>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  const set = (k: string, v: unknown) => {
    if (v !== undefined) p[k] = v;
  };
  set('name', i.name);
  set('start_date', i.startDate);
  set('end_date', i.endDate);
  set('course_id', i.courseId);
  set('format', i.format);
  set('players_per_team', i.playersPerTeam);
  set('counting', i.counting);
  set('holes_per_round', i.holesPerRound);
  set('event_kind', i.kind);
  set('tiebreak', i.tiebreak);
  set('field_size', i.fieldSize);
  if (i.line !== undefined) {
    p.line_kind = i.line?.kind ?? null;
    p.line_value = i.line?.places ?? null;
  }
  set('substitutions', i.substitutions);
  set('lock_minutes', i.lockMinutes);
  set('results_url', i.resultsUrl);
  set('host', i.host);
  if (i.rounds) p.rounds = i.rounds.map((r) => ({ date: r.date, course_id: r.courseId ?? null, tee_id: r.teeId ?? null, start_type: r.startType ?? 'tee_times', first_tee_at: r.firstTeeAt ?? null }));
  return p;
}

// ── The RPC actions ─────────────────────────────────────────────────────────────────────────────────────────────

async function createTournamentImpl(input: TourCreateInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createInput.safeParse(input);
  if (!parsed.success) return refuse('invalid');
  const i = parsed.data;
  return asCoach((c) =>
    rpc(
      c,
      'createTournament',
      'golf_tournament_create',
      {
        p_payload: {
          ...payloadOf(i),
          team_id: c.teamId,
          from_event_id: i.fromEventId ?? null,
          field_teams: (i.fieldTeams ?? []).map((f) => ({ name: f.name, same_division: f.sameDivision ?? true, is_b_team: f.bTeam ?? false })),
          advice_givers: i.adviceGivers ?? [],
        },
      },
      (d) => ({ id: String(d) }),
    ),
  );
}

async function updateTournamentImpl(id: string, input: Partial<TourEventInput>, version: number): Promise<ActionResult<{ version: number }>> {
  const parsed = eventInput.partial().safeParse(input);
  if (!uuid.safeParse(id).success || !parsed.success || !Number.isInteger(version)) return refuse('invalid');
  return asCoach((c) => rpc(c, 'updateTournament', 'golf_tournament_update', { p_id: id, p_payload: payloadOf(parsed.data), p_version: version }, (d) => ({ version: Number(d) })));
}

async function deleteTournamentImpl(id: string, unlink = false): Promise<ActionResult<null>> {
  if (!uuid.safeParse(id).success) return refuse('invalid');
  return asCoach((c) => rpc(c, 'deleteTournament', 'golf_tournament_delete', { p_id: id, p_unlink: unlink === true }, () => null));
}

const entriesInput = z
  .array(z.object({ playerId: uuid, role: z.enum(['lineup', 'alternate', 'individual']), slot: z.number().int().min(1).max(9).nullable().optional(), reasoning: z.string().max(500).optional() }))
  .max(20);
export type TourEntriesInput = z.infer<typeof entriesInput>;

async function setTournamentEntriesImpl(id: string, entries: TourEntriesInput, version: number | null): Promise<ActionResult<{ version: number }>> {
  const parsed = entriesInput.safeParse(entries);
  if (!uuid.safeParse(id).success || !parsed.success) return refuse('invalid');
  const rows = parsed.data.map((e) => ({ player_id: e.playerId, role: e.role, slot: e.role === 'lineup' ? (e.slot ?? null) : null, ...(e.reasoning !== undefined ? { reasoning: e.reasoning } : {}) }));
  return asCoach((c) => rpc(c, 'setTournamentEntries', 'golf_tournament_set_entries', { p_id: id, p_entries: rows, p_version: version }, (d) => ({ version: Number(d) })));
}

async function lockTournamentLineupImpl(id: string): Promise<ActionResult<{ lockedAt: string }>> {
  if (!uuid.safeParse(id).success) return refuse('invalid');
  return asCoach((c) => rpc(c, 'lockTournamentLineup', 'golf_tournament_lock_lineup', { p_id: id }, (d) => ({ lockedAt: String(d) })));
}

async function substituteTournamentPlayerImpl(roundEventId: string, outId: string, inId: string): Promise<ActionResult<null>> {
  if (![roundEventId, outId, inId].every((x) => uuid.safeParse(x).success)) return refuse('invalid');
  return asCoach((c) => rpc(c, 'substituteTournamentPlayer', 'golf_tournament_substitute', { p_round_event_id: roundEventId, p_out: outId, p_in: inId }, () => null));
}

const roundStatus = z.enum(['live', 'suspended_weather', 'suspended_other', 'final']);
export type TourRoundStatusInput = z.infer<typeof roundStatus>;

async function setTournamentRoundStatusImpl(roundEventId: string, status: TourRoundStatusInput, reason: string | null = null): Promise<ActionResult<null>> {
  if (!uuid.safeParse(roundEventId).success || !roundStatus.safeParse(status).success || (reason != null && reason.length > 280)) return refuse('invalid');
  return asCoach((c) => rpc(c, 'setTournamentRoundStatus', 'golf_tournament_set_round_status', { p_round_event_id: roundEventId, p_status: status, p_reason: reason }, () => null));
}

async function markTournamentImpl(id: string, state: 'official' | 'reopened', reason: string | null = null): Promise<ActionResult<null>> {
  if (!uuid.safeParse(id).success || (state !== 'official' && state !== 'reopened') || (reason != null && reason.length > 280)) return refuse('invalid');
  return asCoach((c) => rpc(c, 'markTournament', 'golf_tournament_mark', { p_id: id, p_state: state, p_reason: reason }, () => null));
}

async function publishTournamentLineupImpl(id: string, at: string | null = null): Promise<ActionResult<{ publishedAt: string }>> {
  if (!uuid.safeParse(id).success || (at != null && !instant.safeParse(at).success)) return refuse('invalid');
  return asCoach((c) => rpc(c, 'publishTournamentLineup', 'golf_tournament_publish', { p_id: id, p_at: at }, (d) => ({ publishedAt: String(d) })));
}

// ── Plain writes the 100100 policies allow a coach ──────────────────────────────────────────────────────────────

/**
 * A score belongs to a player who plays the round: in the round's lineup snapshot once it is locked, else in the
 * entries (lineup or individual, never the alternate). The event's team math reads exactly that set, so a row for
 * anyone else would be saved and never shown: refused as not_in_lineup instead.
 */
async function playsRound(c: Coach, action: string, roundEventId: string, playerId: string): Promise<ActionResult<null> | null> {
  const round = await tourTable(c.supabase, 'golf_tournament_rounds').select('tournament_id').eq('round_event_id', roundEventId).maybeSingle();
  if (round.error) return refused(action, round.error);
  if (!round.data) return refuse('not_found');
  const [snap, entries] = await Promise.all([
    tourTable(c.supabase, 'golf_tournament_round_lineups').select('player_id, role').eq('round_event_id', roundEventId),
    tourTable(c.supabase, 'golf_tournament_entries').select('player_id, role').eq('tournament_id', (round.data as { tournament_id: string }).tournament_id),
  ]);
  if (snap.error) return refused(action, snap.error);
  if (entries.error) return refused(action, entries.error);
  const rows = ((snap.data as Array<{ player_id: string; role: string }> | null)?.length ? snap.data : entries.data) as Array<{ player_id: string; role: string }> | null;
  return (rows ?? []).some((r) => r.player_id === playerId && r.role !== 'alternate') ? null : refuse('not_in_lineup');
}

/** Links a player's GolfHelm round to a tournament round (the golf_rounds row itself is never changed, D-82). */
async function linkTournamentRoundImpl(roundEventId: string, playerId: string, roundId: string): Promise<ActionResult<null>> {
  if (![roundEventId, playerId, roundId].every((x) => uuid.safeParse(x).success)) return refuse('invalid');
  return asCoach(async (c) => {
    const plays = await playsRound(c, 'linkTournamentRound', roundEventId, playerId);
    if (plays) return plays;
    const { error } = await tourTable(c.supabase, 'golf_tournament_player_rounds').upsert(
      { round_event_id: roundEventId, team_id: c.teamId, player_id: playerId, round_id: roundId, entered_total: null, entered_front: null, entered_back: null, link_source: 'coach' },
      { onConflict: 'round_event_id,player_id' },
    );
    if (error) return refused('linkTournamentRound', error);
    revalidatePath(ROUTE, 'layout');
    return { success: true, data: null };
  });
}

const scoreInput = z.object({
  total: z.number().int().min(20).max(200).nullable(),
  front: z.number().int().min(10).max(100).nullable().optional(),
  back: z.number().int().min(10).max(100).nullable().optional(),
  status: z.enum(['ok', 'wd', 'dq', 'dq_pending']).optional(),
  wdAfterHole: z.number().int().min(0).max(18).nullable().optional(),
  note: z.string().max(280).nullable().optional(),
});
export type TourScoreInput = z.infer<typeof scoreInput>;

/** Enters (or clears) a player's score for a round when there is no GolfHelm round to link: it replaces a link. */
async function enterTournamentScoreImpl(roundEventId: string, playerId: string, score: TourScoreInput): Promise<ActionResult<null>> {
  const parsed = scoreInput.safeParse(score);
  if (![roundEventId, playerId].every((x) => uuid.safeParse(x).success) || !parsed.success) return refuse('invalid');
  const s = parsed.data;
  return asCoach(async (c) => {
    const plays = await playsRound(c, 'enterTournamentScore', roundEventId, playerId);
    if (plays) return plays;
    const {
      data: { user },
    } = await c.supabase.auth.getUser();
    const { error } = await tourTable(c.supabase, 'golf_tournament_player_rounds').upsert(
      {
        round_event_id: roundEventId,
        team_id: c.teamId,
        player_id: playerId,
        round_id: null,
        entered_total: s.total,
        entered_front: s.front ?? null,
        entered_back: s.back ?? null,
        status: s.status ?? 'ok',
        wd_after_hole: s.wdAfterHole ?? null,
        link_source: null,
        note: s.note ?? null,
        updated_by: user?.id ?? null,
      },
      { onConflict: 'round_event_id,player_id' },
    );
    if (error) return refused('enterTournamentScore', error);
    revalidatePath(ROUTE, 'layout');
    return { success: true, data: null };
  });
}

/** "Not a tournament round": the link inbox stops offering it (remembered per team). */
async function dismissTournamentLinkImpl(roundId: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(roundId).success) return refuse('invalid');
  return asCoach(async (c) => {
    const {
      data: { user },
    } = await c.supabase.auth.getUser();
    const { error } = await tourTable(c.supabase, 'golf_tournament_link_dismissals').upsert(
      { team_id: c.teamId, round_id: roundId, dismissed_by: user?.id ?? null },
      { onConflict: 'team_id,round_id', ignoreDuplicates: true },
    );
    if (error) return refused('dismissTournamentLink', error);
    revalidatePath(`${ROUTE}/links`);
    return { success: true, data: null };
  });
}

const reviewInput = z.object({ observation: z.string().max(4000).nullable(), hypothesis: z.string().max(4000).nullable() });
export type TourReviewInput = z.infer<typeof reviewInput>;

/** The coach-only review (D-85): never readable by a player. */
async function saveTournamentReviewImpl(id: string, review: TourReviewInput): Promise<ActionResult<null>> {
  const parsed = reviewInput.safeParse(review);
  if (!uuid.safeParse(id).success || !parsed.success) return refuse('invalid');
  return asCoach(async (c) => {
    const {
      data: { user },
    } = await c.supabase.auth.getUser();
    const { error } = await tourTable(c.supabase, 'golf_tournament_reviews').upsert(
      { tournament_id: id, team_id: c.teamId, observation: parsed.data.observation, hypothesis: parsed.data.hypothesis, updated_by: user?.id ?? null },
      { onConflict: 'tournament_id' },
    );
    if (error) return refused('saveTournamentReview', error);
    revalidatePath(ROUTE, 'layout');
    return { success: true, data: null };
  });
}

// ── Exports (each observed; refusals are expected answers, so only thrown errors and `failed` are reported) ────

const OBSERVE = { sport: 'golf', feature: 'calendar_events', demoSafe: true, observeSoftFailures: false } as const;

const observedCreate = withAdminObserved('createTournament', OBSERVE, createTournamentImpl);
export async function createTournament(input: TourCreateInput) {
  return observedCreate(input);
}
const observedUpdate = withAdminObserved('updateTournament', OBSERVE, updateTournamentImpl);
export async function updateTournament(id: string, input: Partial<TourEventInput>, version: number) {
  return observedUpdate(id, input, version);
}
const observedDelete = withAdminObserved('deleteTournament', OBSERVE, deleteTournamentImpl);
export async function deleteTournament(id: string, unlink = false) {
  return observedDelete(id, unlink);
}
const observedEntries = withAdminObserved('setTournamentEntries', OBSERVE, setTournamentEntriesImpl);
export async function setTournamentEntries(id: string, entries: TourEntriesInput, version: number | null) {
  return observedEntries(id, entries, version);
}
const observedLock = withAdminObserved('lockTournamentLineup', OBSERVE, lockTournamentLineupImpl);
export async function lockTournamentLineup(id: string) {
  return observedLock(id);
}
const observedSubstitute = withAdminObserved('substituteTournamentPlayer', OBSERVE, substituteTournamentPlayerImpl);
export async function substituteTournamentPlayer(roundEventId: string, outId: string, inId: string) {
  return observedSubstitute(roundEventId, outId, inId);
}
const observedRoundStatus = withAdminObserved('setTournamentRoundStatus', OBSERVE, setTournamentRoundStatusImpl);
export async function setTournamentRoundStatus(roundEventId: string, status: TourRoundStatusInput, reason: string | null = null) {
  return observedRoundStatus(roundEventId, status, reason);
}
const observedMark = withAdminObserved('markTournament', OBSERVE, markTournamentImpl);
export async function markTournament(id: string, state: 'official' | 'reopened', reason: string | null = null) {
  return observedMark(id, state, reason);
}
const observedPublish = withAdminObserved('publishTournamentLineup', OBSERVE, publishTournamentLineupImpl);
export async function publishTournamentLineup(id: string, at: string | null = null) {
  return observedPublish(id, at);
}
const observedLink = withAdminObserved('linkTournamentRound', OBSERVE, linkTournamentRoundImpl);
export async function linkTournamentRound(roundEventId: string, playerId: string, roundId: string) {
  return observedLink(roundEventId, playerId, roundId);
}
const observedScore = withAdminObserved('enterTournamentScore', OBSERVE, enterTournamentScoreImpl);
export async function enterTournamentScore(roundEventId: string, playerId: string, score: TourScoreInput) {
  return observedScore(roundEventId, playerId, score);
}
const observedDismiss = withAdminObserved('dismissTournamentLink', OBSERVE, dismissTournamentLinkImpl);
export async function dismissTournamentLink(roundId: string) {
  return observedDismiss(roundId);
}
const observedReview = withAdminObserved('saveTournamentReview', OBSERVE, saveTournamentReviewImpl);
export async function saveTournamentReview(id: string, review: TourReviewInput) {
  return observedReview(id, review);
}
