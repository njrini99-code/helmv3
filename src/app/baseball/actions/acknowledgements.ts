'use server';

// =============================================================================
// src/app/baseball/actions/acknowledgements.ts
//
// Wave 4 / P4.3 — Event acknowledgement server actions.
//
// "Acknowledging" a baseball_events row is a read-receipt / RSVP-ack: it records
// that the CURRENT user has seen the event. It is a SELF action — any
// authenticated team member (player or staff) may acknowledge as themselves, so
// it carries NO required staff capability. The single security invariant is
// `user_id = auth.uid()`, enforced both here and by RLS
// (baseball_event_acknowledgements_insert WITH CHECK user_id = auth.uid()).
//
// Every action runs inside withBaseballAction (Wave 2) for:
//   - auth resolution (401 if signed out)
//   - active-baseball-context resolution
//   - Sentry scope tags { sport:'baseball', feature:'command_center', action }
//   - centralized error logging (error_logs + Sentry) with sanitized rethrow
//
// NON-DESTRUCTIVE WRITES: acknowledge uses UPSERT on the UNIQUE(event_id,
// user_id) constraint (idempotent re-ack bumps acknowledged_at) — never
// delete-then-reinsert. Withdraw is an explicit, scoped DELETE of the caller's
// own single row (a user-initiated removal of their own receipt, not a
// save/sync rebuild).
//
// DEFENSE IN DEPTH: before writing we confirm the target event exists and
// belongs to the caller's active baseball team. RLS is the real boundary; this
// is a friendly, early, non-leaking guard so a cross-team event id can't be
// acked through a stale context.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import type { BaseballEventAcknowledgementRow } from '@/lib/types/baseball-acknowledgements';

// -----------------------------------------------------------------------------
// Result envelope (matches the other baseball actions' ActionResult shape).
// withBaseballAction rethrows a sanitized error on unexpected failure; we also
// return a typed { success:false, error } for expected/validation outcomes so
// the client can branch without try/catch.
// -----------------------------------------------------------------------------

export interface AcknowledgementResult {
  success: boolean;
  error?: string;
  acknowledgedAt?: string | null;
}

const COMMAND_CENTER_PATH = '/baseball/dashboard/command-center';
const PLAYER_TODAY_PATH = '/baseball/player/today';

// baseball_event_acknowledgements is created via migration 20260624000040 and is
// not in the generated database.ts (we cannot regen against the shared DB). Use
// this loosely-typed accessor for that one table; RLS is the real boundary and
// our hand-written types in '@/lib/types/baseball-acknowledgements' document the
// shape. All OTHER tables (baseball_events) keep full generated typing.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = { from: (table: string) => any };

// -----------------------------------------------------------------------------
// acknowledgeEvent — record/refresh the caller's acknowledgement of an event.
// -----------------------------------------------------------------------------

/**
 * Acknowledge a baseball event as the current user. Idempotent: re-acking an
 * already-acked event upserts (bumps acknowledged_at). Returns the stored
 * acknowledged_at on success.
 */
export const acknowledgeEvent = withBaseballAction(
  'acknowledgeEvent',
  { featureArea: 'command_center' },
  async (ctx, eventId: string): Promise<AcknowledgementResult> => {
    if (!eventId || typeof eventId !== 'string') {
      return { success: false, error: 'An event is required to acknowledge.' };
    }

    const supabase = await createClient();

    // Defense in depth: the event must exist and belong to the active team.
    const { data: event, error: eventErr } = await supabase
      .from('baseball_events')
      .select('id, team_id')
      .eq('id', eventId)
      .maybeSingle();

    if (eventErr) {
      // Unexpected read failure — let the wrapper capture + sanitize.
      throw eventErr;
    }
    if (!event || event.team_id !== ctx.activeTeamId) {
      return { success: false, error: 'That event is not available on this team.' };
    }

    const acknowledgedAt = new Date().toISOString();

    // UPSERT on UNIQUE(event_id, user_id) — never delete-then-reinsert.
    const { data, error } = await (supabase as unknown as UntypedClient)
      .from('baseball_event_acknowledgements')
      .upsert(
        {
          event_id: eventId,
          user_id: ctx.user.id,
          acknowledged_at: acknowledgedAt,
        },
        { onConflict: 'event_id,user_id' },
      )
      .select('acknowledged_at')
      .maybeSingle();

    if (error) throw error;

    revalidatePath(COMMAND_CENTER_PATH);
    revalidatePath(PLAYER_TODAY_PATH);

    return {
      success: true,
      acknowledgedAt:
        (data as { acknowledged_at: string } | null)?.acknowledged_at ?? acknowledgedAt,
    };
  },
);

// -----------------------------------------------------------------------------
// withdrawAcknowledgement — remove the caller's own acknowledgement.
// -----------------------------------------------------------------------------

/**
 * Withdraw (un-acknowledge) the caller's own acknowledgement of an event. This
 * is a user-initiated removal of a single self-owned receipt row — scoped to
 * (event_id, user_id = me). RLS DELETE policy independently enforces ownership.
 */
export const withdrawAcknowledgement = withBaseballAction(
  'withdrawAcknowledgement',
  { featureArea: 'command_center' },
  async (ctx, eventId: string): Promise<AcknowledgementResult> => {
    if (!eventId || typeof eventId !== 'string') {
      return { success: false, error: 'An event is required.' };
    }

    const supabase = await createClient();

    const { error } = await (supabase as unknown as UntypedClient)
      .from('baseball_event_acknowledgements')
      .delete()
      .eq('event_id', eventId)
      .eq('user_id', ctx.user.id);

    if (error) throw error;

    revalidatePath(COMMAND_CENTER_PATH);
    revalidatePath(PLAYER_TODAY_PATH);

    return { success: true, acknowledgedAt: null };
  },
);

// -----------------------------------------------------------------------------
// getMyEventAcknowledgements — the caller's acknowledged event ids.
// -----------------------------------------------------------------------------

/**
 * Return the set of event ids the current user has acknowledged, for the given
 * candidate event ids. Used to seed the Command Center / Player Today ack UI so
 * already-acked events render in the acknowledged state. Self-scoped; returns an
 * empty array on any read failure (honest, never throws to the UI).
 */
export const getMyEventAcknowledgements = withBaseballAction(
  'getMyEventAcknowledgements',
  { featureArea: 'command_center' },
  async (ctx, eventIds: string[]): Promise<{ acknowledgedEventIds: string[] }> => {
    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      return { acknowledgedEventIds: [] };
    }

    const supabase = await createClient();
    const { data, error } = await (supabase as unknown as UntypedClient)
      .from('baseball_event_acknowledgements')
      .select('event_id')
      .eq('user_id', ctx.user.id)
      .in('event_id', eventIds);

    if (error) {
      // Degrade honestly — the UI just shows nothing acknowledged yet.
      return { acknowledgedEventIds: [] };
    }

    const rows = (data ?? []) as Pick<BaseballEventAcknowledgementRow, 'event_id'>[];
    return { acknowledgedEventIds: rows.map((r) => r.event_id) };
  },
);
