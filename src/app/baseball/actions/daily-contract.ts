'use server';

// =============================================================================
// src/app/baseball/actions/daily-contract.ts
//
// V5 Player Daily Contract — server actions for the daily commitment loop.
//
// The Daily Contract is a SELF mechanic: a player composes a few concrete daily
// intentions (draft), commits to them, toggles items honored/skipped through the
// day, and completes the day. Completing a COMMITTED day appends a player_only
// timeline event so the loop compounds into the Passport's development story.
//
// SECURITY:
//   - Every action runs inside withBaseballAction (auth + active-context +
//     Sentry scope + sanitized error logging).
//   - These are SELF actions — no staff capability is required, but the row is
//     always written for the CALLER's own player id (resolved server-side) and
//     RLS independently enforces player_id = get_my_baseball_player_id().
//   - A non-player (staff-only account) cannot file a contract: we resolve the
//     caller's player id and reject when absent.
//
// NON-DESTRUCTIVE WRITES: upsert on UNIQUE(player_id, team_id, contract_date).
// Item toggles read-modify-write the SAME row's items jsonb — never delete-then-
// reinsert. The timeline write is append-only and best-effort (it never rolls
// back the primary mutation).
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { appendSystemTimelineEvent } from '@/lib/baseball/timeline-writer';
import { appendNoteTimelineEvent } from '@/lib/baseball/timeline-writer';
import {
  todayIsoInTz,
  resolveTeamTimezone,
} from '@/lib/baseball/daily-contract/contract-day';
import { resolveAckNoteVisibility } from '@/lib/baseball/daily-contract/ack-visibility';
import type {
  BaseballPlayerDailyContractRow,
  DailyContractItem,
  DailyContractVisibility,
} from '@/lib/types/baseball-passport';

const PLAYER_TODAY_PATH = '/baseball/player/today';

// baseball_player_daily_contracts is created via migration 20260624000220 and is
// not in the generated database.ts. Use this loosely-typed accessor for that one
// table; RLS is the real boundary and the hand-written types document the shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = { from: (table: string) => any };

export interface DailyContractActionResult {
  success: boolean;
  error?: string;
  contractId?: string;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const MAX_ITEMS = 5;
const MAX_LABEL = 120;
const MAX_REFLECTION = 600;

/** Resolve the caller's OWN player id and assert membership of the active team. */
async function resolveSelfPlayer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  teamId: string,
): Promise<string | null> {
  const { data: player } = await supabase
    .from('baseball_players')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!player) return null;

  const { data: member } = await supabase
    .from('baseball_team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('player_id', player.id)
    .maybeSingle();
  return member ? player.id : null;
}

/** Sanitize + cap a list of incoming intentions. Each gets a stable id. */
function sanitizeItems(
  raw: Array<{ id?: string; label?: string; category?: string }>,
): DailyContractItem[] {
  const cleaned: DailyContractItem[] = [];
  for (const r of raw.slice(0, MAX_ITEMS)) {
    const label = (r.label ?? '').trim().slice(0, MAX_LABEL);
    if (!label) continue;
    cleaned.push({
      id: r.id && typeof r.id === 'string' ? r.id : crypto.randomUUID(),
      label,
      category: (r.category ?? 'general').trim().slice(0, 40) || 'general',
      done: false,
      skipped: false,
    });
  }
  return cleaned;
}

// -----------------------------------------------------------------------------
// saveDraftContract — create/replace today's DRAFT intentions (not committed).
// -----------------------------------------------------------------------------

/**
 * Save today's contract as a draft set of intentions. Idempotent upsert on
 * (player_id, team_id, contract_date). Does NOT mark committed — a draft earns
 * no streak credit (honesty). Preserves any existing done/skipped flags by id.
 */
export const saveDraftContract = withBaseballAction(
  'saveDraftContract',
  { featureArea: 'baseball-player-today' },
  async (
    ctx,
    input: { items: Array<{ id?: string; label?: string; category?: string }> },
  ): Promise<DailyContractActionResult> => {
    const supabase = await createClient();
    const playerId = await resolveSelfPlayer(supabase, ctx.user.id, ctx.activeTeamId);
    if (!playerId) {
      return { success: false, error: 'Only roster players can set a daily contract.' };
    }

    const incoming = Array.isArray(input?.items) ? input.items : [];
    const items = sanitizeItems(incoming);
    if (items.length === 0) {
      return { success: false, error: 'Add at least one intention to commit to.' };
    }

    // The contract day is the player's LOCAL day in the TEAM tz, not server UTC —
    // a 9pm-ET commit on the 23rd writes '...-23', not the next UTC day.
    const tz = await resolveTeamTimezone(supabase, ctx.activeTeamId);
    const contractDate = todayIsoInTz(tz);

    // Preserve existing per-item done/skipped state by id (read-modify-write).
    const { data: existing } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .select('id, items, status')
      .eq('player_id', playerId)
      .eq('team_id', ctx.activeTeamId)
      .eq('contract_date', contractDate)
      .maybeSingle();

    const prior = (existing as Pick<
      BaseballPlayerDailyContractRow,
      'id' | 'items' | 'status'
    > | null) ?? null;
    const priorById = new Map(
      (Array.isArray(prior?.items) ? prior!.items : []).map((i) => [i.id, i]),
    );
    const merged = items.map((i) => {
      const was = priorById.get(i.id);
      return was ? { ...i, done: was.done, skipped: was.skipped } : i;
    });

    const { data, error } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .upsert(
        {
          player_id: playerId,
          team_id: ctx.activeTeamId,
          contract_date: contractDate,
          // Keep an already-committed/completed day in its status; only a fresh
          // or draft day stays 'draft'.
          status:
            prior?.status === 'committed' || prior?.status === 'completed'
              ? prior.status
              : 'draft',
          items: merged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'player_id,team_id,contract_date' },
      )
      .select('id')
      .maybeSingle();

    if (error) throw error;
    revalidatePath(PLAYER_TODAY_PATH);
    return { success: true, contractId: (data as { id: string } | null)?.id };
  },
);

// -----------------------------------------------------------------------------
// commitContract — lock in today's intentions (starts streak eligibility).
// -----------------------------------------------------------------------------

/**
 * Commit to today's contract. Requires at least one intention. Sets status =
 * 'committed' + committed_at. A committed day that is later completed counts
 * toward the streak. Idempotent: committing again only refreshes committed_at.
 */
export const commitContract = withBaseballAction(
  'commitContract',
  { featureArea: 'baseball-player-today' },
  async (ctx): Promise<DailyContractActionResult> => {
    const supabase = await createClient();
    const playerId = await resolveSelfPlayer(supabase, ctx.user.id, ctx.activeTeamId);
    if (!playerId) {
      return { success: false, error: 'Only roster players can commit a daily contract.' };
    }

    const tz = await resolveTeamTimezone(supabase, ctx.activeTeamId);
    const contractDate = todayIsoInTz(tz);
    const { data: existing } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .select('id, items, status, committed_at')
      .eq('player_id', playerId)
      .eq('team_id', ctx.activeTeamId)
      .eq('contract_date', contractDate)
      .maybeSingle();

    const prior = existing as Pick<
      BaseballPlayerDailyContractRow,
      'id' | 'items' | 'status' | 'committed_at'
    > | null;
    if (!prior || !Array.isArray(prior.items) || prior.items.length === 0) {
      return { success: false, error: 'Add your intentions before committing.' };
    }
    if (prior.status === 'completed') {
      return { success: true, contractId: prior.id };
    }

    const { error } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .update({
        status: 'committed',
        committed_at: prior.committed_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', prior.id)
      .eq('player_id', playerId);

    if (error) throw error;
    revalidatePath(PLAYER_TODAY_PATH);
    return { success: true, contractId: prior.id };
  },
);

// -----------------------------------------------------------------------------
// saveDraftAndCommit — atomic save + commit in a single server round-trip.
//
// The previous two-step client pattern (saveDraftContract → commitContract) had
// a phase-mismatch bug: if saveDraftContract succeeded but commitContract failed,
// the contract row stayed in status='draft' while the UI optimistically showed
// 'committed'. On refresh the read-model returned the un-committed draft.
//
// This action collapses both mutations into one server action so a partial
// failure cannot leave the row and UI in mismatched states. The caller's
// optimistic update can be safely reverted on a SINGLE error signal.
// -----------------------------------------------------------------------------

/**
 * Save today's contract items AND commit them in a single atomic server call.
 * Idempotent: committing again only refreshes committed_at and preserves any
 * existing done/skipped flags. Returns the contract id on success.
 */
export const saveDraftAndCommit = withBaseballAction(
  'saveDraftAndCommit',
  { featureArea: 'baseball-player-today' },
  async (
    ctx,
    input: { items: Array<{ id?: string; label?: string; category?: string }> },
  ): Promise<DailyContractActionResult> => {
    const supabase = await createClient();
    const playerId = await resolveSelfPlayer(supabase, ctx.user.id, ctx.activeTeamId);
    if (!playerId) {
      return { success: false, error: 'Only roster players can commit a daily contract.' };
    }

    const incoming = Array.isArray(input?.items) ? input.items : [];
    const items = sanitizeItems(incoming);
    if (items.length === 0) {
      return { success: false, error: 'Add at least one intention to commit to.' };
    }

    const tz = await resolveTeamTimezone(supabase, ctx.activeTeamId);
    const contractDate = todayIsoInTz(tz);

    // Read prior row to preserve done/skipped flags and avoid overwriting a
    // committed/completed status (idempotent guard identical to the two-step path).
    const { data: existing } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .select('id, items, status, committed_at')
      .eq('player_id', playerId)
      .eq('team_id', ctx.activeTeamId)
      .eq('contract_date', contractDate)
      .maybeSingle();

    const prior = (existing as Pick<
      BaseballPlayerDailyContractRow,
      'id' | 'items' | 'status' | 'committed_at'
    > | null) ?? null;

    // Already completed → nothing to do.
    if (prior?.status === 'completed') {
      return { success: true, contractId: prior.id };
    }

    const priorById = new Map(
      (Array.isArray(prior?.items) ? prior!.items : []).map((i) => [i.id, i]),
    );
    const merged = items.map((i) => {
      const was = priorById.get(i.id);
      return was ? { ...i, done: was.done, skipped: was.skipped } : i;
    });

    const { data, error } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .upsert(
        {
          player_id: playerId,
          team_id: ctx.activeTeamId,
          contract_date: contractDate,
          status: 'committed',
          committed_at: prior?.committed_at ?? new Date().toISOString(),
          items: merged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'player_id,team_id,contract_date' },
      )
      .select('id')
      .maybeSingle();

    if (error) throw error;
    revalidatePath(PLAYER_TODAY_PATH);
    return { success: true, contractId: (data as { id: string } | null)?.id };
  },
);

// -----------------------------------------------------------------------------
// toggleContractItem — mark a single intention honored or skipped.
// -----------------------------------------------------------------------------

/**
 * Toggle one item's done/skipped state inside today's contract. Read-modify-
 * write of the SAME row's items jsonb (never delete-then-reinsert). `state`
 * is one of 'done' | 'skipped' | 'reset'.
 */
export const toggleContractItem = withBaseballAction(
  'toggleContractItem',
  { featureArea: 'baseball-player-today' },
  async (
    ctx,
    input: { itemId: string; state: 'done' | 'skipped' | 'reset' },
  ): Promise<DailyContractActionResult> => {
    const supabase = await createClient();
    const playerId = await resolveSelfPlayer(supabase, ctx.user.id, ctx.activeTeamId);
    if (!playerId) {
      return { success: false, error: 'Only roster players can update a daily contract.' };
    }
    if (!input?.itemId) {
      return { success: false, error: 'An item is required.' };
    }

    const tz = await resolveTeamTimezone(supabase, ctx.activeTeamId);
    const contractDate = todayIsoInTz(tz);
    const { data: existing } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .select('id, items')
      .eq('player_id', playerId)
      .eq('team_id', ctx.activeTeamId)
      .eq('contract_date', contractDate)
      .maybeSingle();

    const prior = existing as Pick<BaseballPlayerDailyContractRow, 'id' | 'items'> | null;
    if (!prior) {
      return { success: false, error: "Today's contract hasn't been started yet." };
    }

    const items = (Array.isArray(prior.items) ? prior.items : []).map((i) =>
      i.id === input.itemId
        ? {
            ...i,
            done: input.state === 'done',
            skipped: input.state === 'skipped',
          }
        : i,
    );

    const { error } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .update({ items, updated_at: new Date().toISOString() })
      .eq('id', prior.id)
      .eq('player_id', playerId);

    if (error) throw error;
    revalidatePath(PLAYER_TODAY_PATH);
    return { success: true, contractId: prior.id };
  },
);

// -----------------------------------------------------------------------------
// completeContract — close out the day; compounds into the development story.
// -----------------------------------------------------------------------------

/**
 * Complete today's COMMITTED contract. Requires the day to be committed first
 * (honesty: you can't "complete" a day you never committed to). Stores an
 * optional reflection and appends a player_only timeline event so the loop
 * compounds into the Passport's development story.
 */
export const completeContract = withBaseballAction(
  'completeContract',
  { featureArea: 'baseball-player-today' },
  async (ctx, input?: { reflection?: string }): Promise<DailyContractActionResult> => {
    const supabase = await createClient();
    const playerId = await resolveSelfPlayer(supabase, ctx.user.id, ctx.activeTeamId);
    if (!playerId) {
      return { success: false, error: 'Only roster players can complete a daily contract.' };
    }

    const tz = await resolveTeamTimezone(supabase, ctx.activeTeamId);
    const contractDate = todayIsoInTz(tz);
    const { data: existing } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .select('id, items, status')
      .eq('player_id', playerId)
      .eq('team_id', ctx.activeTeamId)
      .eq('contract_date', contractDate)
      .maybeSingle();

    const prior = existing as Pick<
      BaseballPlayerDailyContractRow,
      'id' | 'items' | 'status'
    > | null;
    if (!prior) {
      return { success: false, error: "Today's contract hasn't been started yet." };
    }
    if (prior.status !== 'committed' && prior.status !== 'completed') {
      return { success: false, error: 'Commit to your contract before completing it.' };
    }

    const reflection =
      typeof input?.reflection === 'string'
        ? input.reflection.trim().slice(0, MAX_REFLECTION) || null
        : null;

    const items = Array.isArray(prior.items) ? prior.items : [];
    const honored = items.filter((i) => i.done).length;

    const { error } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        reflection,
        updated_at: new Date().toISOString(),
      })
      .eq('id', prior.id)
      .eq('player_id', playerId);

    if (error) throw error;

    // Compound into the development story — append-only, best-effort, player_only
    // so it stays private to the player + their staff (never widened). A failed
    // timeline write must NOT roll back the completion. We use the SYSTEM writer
    // because the timeline INSERT policy is coach-gated; a player-initiated
    // completion is a legitimate system/'self' provenance event, written via the
    // service-role path reserved for system/AI provenance.
    await appendSystemTimelineEvent({
      teamId: ctx.activeTeamId,
      playerId,
      kind: 'system',
      title: `Daily contract completed — ${honored}/${items.length} honored`,
      body: reflection,
      visibility: 'player_only',
      sourceId: prior.id,
      occurredAt: new Date().toISOString(),
      createdBy: ctx.user.id,
    });

    revalidatePath(PLAYER_TODAY_PATH);
    return { success: true, contractId: prior.id };
  },
);

// -----------------------------------------------------------------------------
// setContractVisibility — player share-control (player_only | team | staff_only)
// -----------------------------------------------------------------------------

const VALID_VISIBILITY: readonly DailyContractVisibility[] = [
  'player_only',
  'team',
  'staff_only',
];

/**
 * Set today's contract visibility. THIS is the missing player→coach bridge: the
 * row defaults to 'player_only' (private), and the coach SELECT policy only ever
 * returns rows with visibility <> 'player_only'. So a coach can see a day ONLY
 * after the player opts in here by choosing 'team' or 'staff_only'.
 *
 * HONESTY / PRIVACY:
 *   - Default stays private. Sharing is an explicit, reversible player choice.
 *   - Re-setting to 'player_only' RE-PRIVATIZES the day and CLEARS any coach
 *     acknowledgement (a coach can't keep an ack on a day the player un-shared).
 *   - The private reflection is never copied anywhere; the coach read-model
 *     deliberately omits it. Only the items/honored counts are exposed.
 */
export const setContractVisibility = withBaseballAction(
  'setContractVisibility',
  { featureArea: 'baseball-player-today' },
  async (
    ctx,
    input: { visibility: DailyContractVisibility },
  ): Promise<DailyContractActionResult> => {
    const supabase = await createClient();
    const playerId = await resolveSelfPlayer(supabase, ctx.user.id, ctx.activeTeamId);
    if (!playerId) {
      return { success: false, error: 'Only roster players can change sharing.' };
    }
    const visibility = input?.visibility;
    if (!visibility || !VALID_VISIBILITY.includes(visibility)) {
      return { success: false, error: 'Pick a valid sharing option.' };
    }

    const tz = await resolveTeamTimezone(supabase, ctx.activeTeamId);
    const contractDate = todayIsoInTz(tz);
    const { data: existing } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .select('id')
      .eq('player_id', playerId)
      .eq('team_id', ctx.activeTeamId)
      .eq('contract_date', contractDate)
      .maybeSingle();

    const prior = existing as { id: string } | null;
    if (!prior) {
      return { success: false, error: "Start today's contract before sharing it." };
    }

    // Re-privatizing clears the coach ack so a stale "coach saw this" can't linger
    // on a now-private day. The player-owned UPDATE policy authorizes this write.
    const reprivatizing = visibility === 'player_only';
    const { error } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .update({
        visibility,
        ...(reprivatizing
          ? { coach_acknowledged_at: null, coach_acknowledged_by: null }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', prior.id)
      .eq('player_id', playerId);

    if (error) throw error;
    revalidatePath(PLAYER_TODAY_PATH);
    return { success: true, contractId: prior.id };
  },
);

// -----------------------------------------------------------------------------
// acknowledgeDailyContract — COACH side: react to a shared day.
// -----------------------------------------------------------------------------

const COMMAND_CENTER_PATH = '/baseball/dashboard/command-center';
const MAX_COACH_NOTE = 400;

/**
 * A coach acknowledges a player's SHARED daily contract (and optionally leaves a
 * short note). This closes the source→signal→action loop for staff:
 *   source : the player's shared committed/completed day
 *   signal : it surfaces in the coach roster read-model
 *   action : the coach acks (+ optional note)
 *   outcome: ack stamped on the row AND a coach→player timeline note appended,
 *            so the player sees the recognition in their development story.
 *
 * SECURITY:
 *   - withBaseballAction resolves auth + active team server-side.
 *   - The ack UPDATE is authorized by the coach-ack RLS policy, which only
 *     permits SHARED rows (visibility <> 'player_only') on a team the caller
 *     coaches. A coach therefore cannot ack a private day, nor a day on a team
 *     they don't staff — RLS rejects it and we return an honest failure.
 *   - The timeline note is written through the caller's RLS-scoped client (the
 *     timeline INSERT policy is is_baseball_team_coach_v2-gated), with HONEST
 *     'manual' coach provenance. It is best-effort: a failed note never rolls
 *     back the ack.
 *   - Visibility of the note (Gap 2): defaults to 'player_only' (a private coach→
 *     player recognition). It is widened to 'team' ONLY when the coach explicitly
 *     opts in (`recognizeToTeam`) on a day the PLAYER already shared team-wide
 *     (visibility === 'team'). A staff_only/player_only day can NEVER produce a
 *     team-visible note — privacy is never widened past what the player chose.
 *     The widen-only path is gated by resolveAckNoteVisibility (pure + tested).
 */
export const acknowledgeDailyContract = withBaseballAction(
  'acknowledgeDailyContract',
  { featureArea: 'baseball-coach-command-center' },
  async (
    ctx,
    input: { contractId: string; note?: string; recognizeToTeam?: boolean },
  ): Promise<DailyContractActionResult> => {
    const supabase = await createClient();
    const contractId = input?.contractId;
    if (!contractId) {
      return { success: false, error: 'A contract is required.' };
    }

    // Load the target row scoped to the active team. RLS already restricts a
    // coach to SHARED rows; we still re-read to resolve the subject player + to
    // fail honestly (not silently) if the row isn't ackable by this caller.
    const { data: existing } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .select('id, player_id, team_id, visibility, contract_date, items')
      .eq('id', contractId)
      .eq('team_id', ctx.activeTeamId)
      .maybeSingle();

    const row = existing as Pick<
      BaseballPlayerDailyContractRow,
      'id' | 'player_id' | 'team_id' | 'visibility' | 'contract_date' | 'items'
    > | null;
    if (!row) {
      return { success: false, error: 'That contract is no longer available.' };
    }
    if (row.visibility === 'player_only') {
      // Defense in depth: the player un-shared it between read and write.
      return { success: false, error: 'This contract is private.' };
    }

    const note =
      typeof input?.note === 'string'
        ? input.note.trim().slice(0, MAX_COACH_NOTE) || null
        : null;

    // Stamp the ack (ack-only coach UPDATE policy authorizes these columns).
    const { error } = await (supabase as unknown as UntypedClient)
      .from('baseball_player_daily_contracts')
      .update({
        coach_acknowledged_at: new Date().toISOString(),
        coach_acknowledged_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('team_id', ctx.activeTeamId);

    if (error) throw error;

    // Append a private coach→player recognition note (best-effort, append-only).
    // Coach-authored → caller's RLS-scoped client, honest 'manual' provenance.
    const honored = (Array.isArray(row.items) ? row.items : []).filter(
      (i) => i.done,
    ).length;
    const total = Array.isArray(row.items) ? row.items.length : 0;

    // Compute (never default) the note visibility. The only widening path is a
    // deliberate coach opt-in on a player-chosen team-shared day; staff_only stays
    // private. A team-visible recognition note honestly lands in the team feed —
    // exactly what the player already opted into by sharing at 'team'.
    const noteVisibility = resolveAckNoteVisibility(
      row.visibility,
      input?.recognizeToTeam === true,
    );
    const recognizedToTeam = noteVisibility === 'team';

    await appendNoteTimelineEvent({
      teamId: ctx.activeTeamId,
      playerId: row.player_id,
      title: recognizedToTeam
        ? `Coach recognized your daily contract to the team — ${honored}/${total} honored`
        : note
          ? `Coach acknowledged your daily contract (${honored}/${total})`
          : `Coach saw your daily contract — ${honored}/${total} honored`,
      body: note,
      visibility: noteVisibility,
      sourceId: row.id,
      occurredAt: new Date().toISOString(),
      createdBy: ctx.user.id,
    });

    revalidatePath(COMMAND_CENTER_PATH);
    revalidatePath(`/baseball/dashboard/players/${row.player_id}`);
    return { success: true, contractId: row.id };
  },
);
