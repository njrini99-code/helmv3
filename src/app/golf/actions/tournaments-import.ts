'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { getGolfSessionProfile } from '@/lib/auth/session';
import { getGolfDashboardRole } from '@/lib/auth/get-golf-dashboard-role';
import { describeError } from '@/lib/utils/describe-error';
import { isUuid } from '@/lib/utils/uuid';
import { isFlagEnabled } from '@/lib/flags';
import { resolveCoachActiveTeamForRequest } from '@/lib/golf/dashboard-request-cache';
import { TOUR_REFUSAL_COPY, tourRefusalOf, type TourRefusalCode } from '@/lib/golf/tournament-refusals';
import { tourTable } from '@/lib/golf/tournaments-tables';
import type { ActionResult } from './golf-action-shared';

/**
 * Launch readiness F-01: a tournament's results, imported in one save (a Golf Genius export, any hole-by-hole or round
 * scores file, a pasted leaderboard, or the whole-round hole grid). The check step in Clubhouse decides each row
 * (`screens/tournaments/import/plan.ts`); this action re-checks what the policies cannot and writes:
 *
 *  - our players' rounds. Holes go where hole scoring puts them (owner answer B, 2026-11-07: one score store): the
 *    player's in-progress `golf_rounds` row linked to the tournament round, made here when there is none, with its
 *    `golf_holes`. A submitted round is never changed (D-82, `guard_golf_round_lifecycle`): its official score is
 *    entered as the event's score instead, and only when the coach chose it (`replace`). An entered total is replaced
 *    by holes only on `replace` too. Only a player who plays the round is written (the lineup snapshot, else the
 *    entries; never the alternate), as `enterTournamentScore` and `saveTournamentHole` refuse.
 *  - the other teams onto the field: rows the field lacks are added, round scores upserted, and the places saved when
 *    the file is a finished result. Our own row takes a place only: our scores are our players' cards.
 *
 * Nothing is deleted. Saving the same file twice writes the same rows. Row-level security decides every write (a
 * coach of the team writes its tournaments, field and rounds).
 */

const uuid = z.string().refine((v) => isUuid(v), 'not an id');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const cardInput = z
  .object({
    roundEventId: uuid,
    playerId: uuid,
    date: day,
    holes: z.array(z.number().int().min(1).max(15).nullable()).min(9).max(18).nullable(),
    pars: z.array(z.number().int().min(3).max(6)).min(9).max(18).nullable(),
    total: z.number().int().min(20).max(200).nullable(),
    status: z.enum(['ok', 'wd', 'dq']),
    replace: z.boolean(),
  })
  .refine((c) => (c.holes == null) === (c.pars == null) && (c.holes == null || c.holes.length === c.pars!.length), 'holes need their pars');

const teamInput = z.object({
  fieldTeamId: uuid.nullable(),
  name: z.string().trim().min(1).max(80),
  us: z.boolean(),
  bTeam: z.boolean(),
  rounds: z.array(z.object({ n: z.number().int().min(1).max(6), total: z.number().int().min(60).max(800) })).max(6),
  place: z.object({ n: z.number().int().min(1).max(80), tied: z.boolean() }).nullable(),
  total: z.number().int().min(60).max(4800).nullable(),
});

const importInput = z.object({
  tournamentId: uuid,
  cards: z.array(cardInput).max(150),
  teams: z.array(teamInput).max(40),
});
export type TourImportInput = z.infer<typeof importInput>;

/** Why a row was left as it was. */
export type TourImportKept = 'submitted' | 'entered' | 'card' | 'not_in_lineup' | 'failed';

export interface TourImportResult {
  /** Rounds written: cards made or corrected, and scores entered. */
  cards: number;
  kept: Array<{ playerId: string; roundEventId: string; why: TourImportKept }>;
  /** Field teams whose scores or place were written. */
  teams: number;
  /** Field teams added. */
  added: number;
  places: boolean;
}

function refuse<T>(code: TourRefusalCode): ActionResult<T> {
  return { success: false, error: TOUR_REFUSAL_COPY[code], code };
}

type Db = Awaited<ReturnType<typeof createClient>>;

async function inBatches<T, R>(items: readonly T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(run))));
  return out;
}

async function importTournamentResultsImpl(raw: TourImportInput): Promise<ActionResult<TourImportResult>> {
  const parsed = importInput.safeParse(raw);
  if (!parsed.success) return refuse('invalid');
  const input = parsed.data;
  if (!isFlagEnabled('golf_tournaments_v1')) return refuse('off');
  const role = await getGolfDashboardRole();
  if (role !== 'coach') return refuse('not_coach');
  const session = await getGolfSessionProfile();
  if (!session) return refuse('not_signed_in');
  if (!session.coach) return refuse('not_coach');
  const team = await resolveCoachActiveTeamForRequest(session.coach.organization_id ?? null, session.coach.id);
  if (team.status !== 'ok') return team.status === 'failed' ? refuse('failed') : refuse('not_coach');
  const teamId = team.teamId;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return refuse('not_signed_in');

    const tour = await tourTable(supabase, 'golf_tournaments').select('id, team_id, holes_per_round, course_id, official_at').eq('id', input.tournamentId).maybeSingle();
    if (tour.error) return refuse(tourRefusalOf(tour.error));
    const t = tour.data as { id: string; team_id: string; holes_per_round: number; course_id: string | null; official_at: string | null } | null;
    if (!t || t.team_id !== teamId) return refuse('not_found');
    if (t.official_at) return { success: false, error: 'The results are official, so scores can’t change. Reopen the results first.', code: 'invalid' };

    const rounds = await tourTable(supabase, 'golf_tournament_rounds').select('round_event_id, round_number, course_id').eq('tournament_id', t.id);
    if (rounds.error) return refuse(tourRefusalOf(rounds.error));
    const roundRows = (rounds.data ?? []) as Array<{ round_event_id: string; round_number: number; course_id: string | null }>;
    const roundById = new Map(roundRows.map((r) => [r.round_event_id, r]));
    if (input.cards.some((c) => !roundById.has(c.roundEventId))) return refuse('not_found');
    if (input.cards.some((c) => c.holes && c.holes.length !== t.holes_per_round)) return refuse('invalid');

    const cards = await writeCards(supabase, { teamId, userId: user.id, tour: t, roundById, cards: input.cards });
    if ('refused' in cards) return refuse(cards.refused);
    const field = await writeField(supabase, { teamId, tournamentId: t.id, roundCount: roundRows.length, teams: input.teams });
    if ('refused' in field) return refuse(field.refused);

    revalidatePath('/golf/dashboard/tournaments', 'layout');
    return { success: true, data: { cards: cards.written, kept: cards.kept, teams: field.teams, added: field.added, places: field.places } };
  } catch (err) {
    await logServerError(`[tournaments] importTournamentResults threw: ${describeError(err)}`, { action: 'importTournamentResults', featureArea: 'calendar_events' });
    return refuse('failed');
  }
}

// ── Our players ─────────────────────────────────────────────────────────────────────────────────────────────────

type CardIn = z.infer<typeof cardInput>;
type Row = { round_event_id: string; player_id: string; round_id: string | null; entered_total: number | null };

async function writeCards(
  supabase: Db,
  ctx: { teamId: string; userId: string; tour: { id: string; holes_per_round: number; course_id: string | null }; roundById: Map<string, { course_id: string | null }>; cards: readonly CardIn[] },
): Promise<{ written: number; kept: TourImportResult['kept'] } | { refused: TourRefusalCode }> {
  if (!ctx.cards.length) return { written: 0, kept: [] };
  const roundIds = [...new Set(ctx.cards.map((c) => c.roundEventId))];
  // Who plays each round: its lineup snapshot once locked, else the entries; never the alternate.
  const [snap, entries, existing] = await Promise.all([
    tourTable(supabase, 'golf_tournament_round_lineups').select('round_event_id, player_id, role').in('round_event_id', roundIds),
    tourTable(supabase, 'golf_tournament_entries').select('player_id, role').eq('tournament_id', ctx.tour.id),
    tourTable(supabase, 'golf_tournament_player_rounds').select('round_event_id, player_id, round_id, entered_total').in('round_event_id', roundIds),
  ]);
  for (const r of [snap, entries, existing]) if (r.error) return { refused: tourRefusalOf(r.error) };
  const snapRows = (snap.data ?? []) as Array<{ round_event_id: string; player_id: string; role: string }>;
  const entryRows = (entries.data ?? []) as Array<{ player_id: string; role: string }>;
  const plays = (c: CardIn) => {
    const own = snapRows.filter((s) => s.round_event_id === c.roundEventId);
    return (own.length ? own : entryRows).some((f) => f.player_id === c.playerId && f.role !== 'alternate');
  };
  const rows = new Map(((existing.data ?? []) as Row[]).map((r) => [`${r.round_event_id}|${r.player_id}`, r]));
  const linkedIds = [...rows.values()].map((r) => r.round_id).filter((x): x is string => !!x);
  const linked = linkedIds.length ? await supabase.from('golf_rounds').select('id, status').in('id', linkedIds) : { data: [], error: null };
  if (linked.error) return { refused: tourRefusalOf(linked.error) };
  const submitted = new Set(((linked.data ?? []) as Array<{ id: string; status: string | null }>).filter((r) => r.status === 'completed').map((r) => r.id));

  const kept: TourImportResult['kept'] = [];
  const outcomes = await inBatches(ctx.cards, 4, async (c): Promise<boolean> => {
    const keep = (why: TourImportKept) => {
      kept.push({ playerId: c.playerId, roundEventId: c.roundEventId, why });
      return false;
    };
    if (!plays(c)) return keep('not_in_lineup');
    const row = rows.get(`${c.roundEventId}|${c.playerId}`);
    if (c.holes && c.pars) {
      if (row?.round_id) {
        // A submitted round is never changed; an open card is corrected hole by hole, as hole scoring does.
        if (submitted.has(row.round_id)) return keep('submitted');
        return (await writeHoles(supabase, row.round_id, c)) && (await setStatus(supabase, c)) ? true : keep('failed');
      }
      if (row?.entered_total != null && !c.replace) return keep('entered');
      return (await makeCard(supabase, ctx, c)) ? true : keep('failed');
    }
    if (row?.round_id && !c.replace) return keep('card');
    const { error } = await tourTable(supabase, 'golf_tournament_player_rounds').upsert(
      { round_event_id: c.roundEventId, team_id: ctx.teamId, player_id: c.playerId, round_id: null, entered_total: c.total, entered_front: null, entered_back: null, status: c.status, link_source: null, updated_by: ctx.userId },
      { onConflict: 'round_event_id,player_id' },
    );
    if (error) {
      await logServerError(`[tournaments] importTournamentResults score failed: ${describeError(error)}`, { action: 'importTournamentResults', featureArea: 'calendar_events', errorCode: error.code ?? undefined });
      return keep('failed');
    }
    return true;
  });
  return { written: outcomes.filter(Boolean).length, kept };
}

async function writeHoles(supabase: Db, roundId: string, c: CardIn): Promise<boolean> {
  const holes = (c.holes ?? []).flatMap((s, i) => (s == null ? [] : [{ round_id: roundId, hole_number: i + 1, par: c.pars![i]!, score: s }]));
  if (!holes.length) return true;
  const { error } = await supabase.from('golf_holes').upsert(holes, { onConflict: 'round_id,hole_number' });
  if (error) await logServerError(`[tournaments] importTournamentResults holes failed: ${describeError(error)}`, { action: 'importTournamentResults', featureArea: 'calendar_events', errorCode: error.code ?? undefined });
  return !error;
}

async function setStatus(supabase: Db, c: CardIn): Promise<boolean> {
  const { error } = await tourTable(supabase, 'golf_tournament_player_rounds').update({ status: c.status }).eq('round_event_id', c.roundEventId).eq('player_id', c.playerId);
  return !error;
}

/** A tournament card for a player with none: an in-progress round, its link (replacing an entered total), its holes. */
async function makeCard(supabase: Db, ctx: { teamId: string; tour: { holes_per_round: number; course_id: string | null }; roundById: Map<string, { course_id: string | null }> }, c: CardIn): Promise<boolean> {
  const made = await supabase
    .from('golf_rounds')
    .insert({
      player_id: c.playerId,
      team_id: ctx.teamId,
      round_date: c.date,
      round_type: 'tournament',
      holes_played: ctx.tour.holes_per_round,
      course_id: ctx.roundById.get(c.roundEventId)?.course_id ?? ctx.tour.course_id,
      status: 'in_progress',
    })
    .select('id')
    .single();
  if (made.error || !made.data) {
    await logServerError(`[tournaments] importTournamentResults round failed: ${describeError(made.error)}`, { action: 'importTournamentResults', featureArea: 'calendar_events', errorCode: made.error?.code ?? undefined });
    return false;
  }
  const roundId = made.data.id as string;
  const link = await tourTable(supabase, 'golf_tournament_player_rounds').upsert(
    { round_event_id: c.roundEventId, team_id: ctx.teamId, player_id: c.playerId, round_id: roundId, entered_total: null, entered_front: null, entered_back: null, status: c.status, link_source: 'coach' },
    { onConflict: 'round_event_id,player_id' },
  );
  if (link.error) {
    // Nothing half-made: the round that could not be linked goes again (it has no holes yet).
    await supabase.from('golf_rounds').delete().eq('id', roundId);
    await logServerError(`[tournaments] importTournamentResults link failed: ${describeError(link.error)}`, { action: 'importTournamentResults', featureArea: 'calendar_events', errorCode: link.error.code ?? undefined });
    return false;
  }
  return writeHoles(supabase, roundId, c);
}

// ── The field ───────────────────────────────────────────────────────────────────────────────────────────────────

type TeamIn = z.infer<typeof teamInput>;

async function writeField(
  supabase: Db,
  ctx: { teamId: string; tournamentId: string; roundCount: number; teams: readonly TeamIn[] },
): Promise<{ teams: number; added: number; places: boolean } | { refused: TourRefusalCode }> {
  if (!ctx.teams.length) return { teams: 0, added: 0, places: false };
  if (ctx.teams.some((x) => x.rounds.some((r) => r.n > ctx.roundCount))) return { refused: 'invalid' };
  const current = await tourTable(supabase, 'golf_tournament_field_teams').select('id, name, is_us').eq('tournament_id', ctx.tournamentId);
  if (current.error) return { refused: tourRefusalOf(current.error) };
  const rows = (current.data ?? []) as Array<{ id: string; name: string; is_us: boolean }>;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const byName = new Map(rows.map((r) => [r.name.trim().toLowerCase(), r]));
  const usRow = rows.find((r) => r.is_us) ?? null;
  // A team id the field doesn't hold, or our own row given scores, is not this import's to write.
  if (ctx.teams.some((x) => x.fieldTeamId != null && (!byId.has(x.fieldTeamId) || byId.get(x.fieldTeamId)!.is_us !== x.us))) return { refused: 'invalid' };
  if (ctx.teams.filter((x) => x.us).length > 1) return { refused: 'invalid' };

  const idOf = new Map<TeamIn, string>();
  const toAdd: TeamIn[] = [];
  for (const x of ctx.teams) {
    const found = x.fieldTeamId ? byId.get(x.fieldTeamId) : x.us ? usRow : byName.get(x.name.trim().toLowerCase());
    if (found && found.is_us === x.us) idOf.set(x, found.id);
    else toAdd.push(x);
  }
  if (toAdd.length) {
    const added = await tourTable(supabase, 'golf_tournament_field_teams')
      .insert(toAdd.map((x) => ({ tournament_id: ctx.tournamentId, team_id: ctx.teamId, name: x.name, is_us: x.us, is_b_team: x.bTeam })))
      .select('id, name, is_us');
    if (added.error) return { refused: tourRefusalOf(added.error) };
    const made = (added.data ?? []) as Array<{ id: string; name: string; is_us: boolean }>;
    toAdd.forEach((x, i) => {
      const m = made.find((r) => r.name === x.name && r.is_us === x.us) ?? made[i];
      if (m) idOf.set(x, m.id);
    });
  }

  const scores = ctx.teams.flatMap((x) => (x.us || !idOf.has(x) ? [] : x.rounds.map((r) => ({ field_team_id: idOf.get(x)!, team_id: ctx.teamId, round_number: r.n, total: r.total, thru: null, entered_at: new Date().toISOString() }))));
  if (scores.length) {
    const { error } = await tourTable(supabase, 'golf_tournament_field_scores').upsert(scores, { onConflict: 'field_team_id,round_number' });
    if (error) return { refused: tourRefusalOf(error) };
  }
  const placed = ctx.teams.filter((x) => x.place && idOf.has(x));
  const results = await inBatches(placed, 8, async (x) => {
    const { error } = await tourTable(supabase, 'golf_tournament_field_teams')
      .update({ final_place: x.place!.n, final_place_tied: x.place!.tied, ...(x.us ? {} : { final_total: x.total }) })
      .eq('id', idOf.get(x)!);
    return !error;
  });
  if (results.some((ok) => !ok)) return { refused: 'failed' };
  return { teams: ctx.teams.filter((x) => idOf.has(x) && (x.place || (!x.us && x.rounds.length))).length, added: toAdd.length, places: placed.length > 0 };
}

const observed = withAdminObserved('importTournamentResults', { sport: 'golf', feature: 'calendar_events', demoSafe: true, observeSoftFailures: false }, importTournamentResultsImpl);
export async function importTournamentResults(input: TourImportInput) {
  return observed(input);
}
