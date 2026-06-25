'use server';

// =============================================================================
// src/app/baseball/actions/timeline-acks.ts
//
// Player TIMELINE event acknowledgement server actions — the OUTCOME step of the
// source -> signal -> action -> timeline -> outcome loop. "Acknowledging" a
// baseball_player_timeline_events row records that the CURRENT user has seen it
// (a coach acking a stat milestone / AI insight, or a player acking a note that
// is visible to them).
//
// SELF action: any authenticated team member who can SEE the event may
// acknowledge it as themselves, so it carries NO required staff capability. The
// single security invariant is `user_id = auth.uid()`, enforced here AND by RLS
// (baseball_timeline_event_acks INSERT WITH CHECK user_id = auth.uid() AND the
// event is visible to me). A player therefore can never ack a staff_only row.
//
// Every action runs inside withBaseballAction (Wave 2) for auth + active-context
// resolution, Sentry scoping, and centralized error logging with a sanitized
// rethrow. Capability enforcement is server-side; the client cannot assert it.
//
// NON-DESTRUCTIVE WRITES: acknowledge UPSERTs on UNIQUE(timeline_event_id,
// user_id) (idempotent re-ack bumps acknowledged_at) — never delete-then-insert.
// Withdraw is an explicit, scoped DELETE of the caller's OWN single row.
//
// DEFENSE IN DEPTH: before writing we confirm the timeline event exists and
// belongs to the caller's active baseball team. RLS is the real boundary; this
// is a friendly, early, non-leaking guard against a stale-context cross-team id.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import type { BaseballTimelineEventAckRow } from '@/lib/types/baseball-acknowledgements';

export interface TimelineAckResult {
  success: boolean;
  error?: string;
  acknowledgedAt?: string | null;
}

const PLAYER_PROFILE_PATH = '/baseball/dashboard/players';
// The player's own timeline surface must also be invalidated when they ack/un-ack
// a row so the next visit reflects the current state without a hard reload.
const PLAYER_TIMELINE_PATH = '/baseball/player/timeline';

// baseball_timeline_event_acks (migration 20260624000430) and
// baseball_player_timeline_events (20260624000040) are not in the generated
// database.ts (we cannot regen against the shared DB). Use this loosely-typed
// accessor for those tables; RLS is the real boundary and the hand-written types
// document the shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UntypedClient = { from: (table: string) => any };

// -----------------------------------------------------------------------------
// acknowledgeTimelineEvent — record/refresh the caller's ack of a timeline event.
// -----------------------------------------------------------------------------

/**
 * Acknowledge a player timeline event as the current user. Idempotent: re-acking
 * upserts (bumps acknowledged_at). Returns the stored acknowledged_at on success.
 */
export const acknowledgeTimelineEvent = withBaseballAction(
  'acknowledgeTimelineEvent',
  { featureArea: 'baseball-timeline' },
  async (ctx, timelineEventId: string): Promise<TimelineAckResult> => {
    if (!timelineEventId || typeof timelineEventId !== 'string') {
      return { success: false, error: 'An event is required to acknowledge.' };
    }

    const supabase = await createClient();

    // Defense in depth: the event must exist and belong to the active team. The
    // SELECT itself is RLS-gated, so a non-visible (e.g. staff_only-to-a-player)
    // row returns null here too.
    const { data: event, error: eventErr } = await (
      supabase as unknown as UntypedClient
    )
      .from('baseball_player_timeline_events')
      .select('id, team_id')
      .eq('id', timelineEventId)
      .maybeSingle();

    if (eventErr) throw eventErr;
    if (!event || event.team_id !== ctx.activeTeamId) {
      return { success: false, error: 'That event is not available on this team.' };
    }

    const acknowledgedAt = new Date().toISOString();

    // UPSERT on UNIQUE(timeline_event_id, user_id) — never delete-then-reinsert.
    const { data, error } = await (supabase as unknown as UntypedClient)
      .from('baseball_timeline_event_acks')
      .upsert(
        {
          timeline_event_id: timelineEventId,
          user_id: ctx.user.id,
          acknowledged_at: acknowledgedAt,
        },
        { onConflict: 'timeline_event_id,user_id' },
      )
      .select('acknowledged_at')
      .maybeSingle();

    if (error) throw error;

    revalidatePath(PLAYER_PROFILE_PATH);
    revalidatePath(PLAYER_TIMELINE_PATH);

    return {
      success: true,
      acknowledgedAt:
        (data as { acknowledged_at: string } | null)?.acknowledged_at ?? acknowledgedAt,
    };
  },
);

// -----------------------------------------------------------------------------
// withdrawTimelineAcknowledgement — remove the caller's own ack.
// -----------------------------------------------------------------------------

/**
 * Withdraw (un-acknowledge) the caller's own ack of a timeline event. Scoped to
 * (timeline_event_id, user_id = me). RLS DELETE independently enforces ownership.
 */
export const withdrawTimelineAcknowledgement = withBaseballAction(
  'withdrawTimelineAcknowledgement',
  { featureArea: 'baseball-timeline' },
  async (ctx, timelineEventId: string): Promise<TimelineAckResult> => {
    if (!timelineEventId || typeof timelineEventId !== 'string') {
      return { success: false, error: 'An event is required.' };
    }

    const supabase = await createClient();

    const { error } = await (supabase as unknown as UntypedClient)
      .from('baseball_timeline_event_acks')
      .delete()
      .eq('timeline_event_id', timelineEventId)
      .eq('user_id', ctx.user.id);

    if (error) throw error;

    revalidatePath(PLAYER_PROFILE_PATH);
    revalidatePath(PLAYER_TIMELINE_PATH);

    return { success: true, acknowledgedAt: null };
  },
);

// -----------------------------------------------------------------------------
// getMyTimelineAcknowledgements — the caller's acknowledged timeline event ids.
// -----------------------------------------------------------------------------

/**
 * Return which of the candidate timeline event ids the current user has
 * acknowledged. Used by the client to optimistically re-seed ack state after a
 * mutation without a full reload. Self-scoped; returns [] on any read failure.
 */
export const getMyTimelineAcknowledgements = withBaseballAction(
  'getMyTimelineAcknowledgements',
  { featureArea: 'baseball-timeline' },
  async (
    ctx,
    timelineEventIds: string[],
  ): Promise<{ acknowledgedEventIds: string[] }> => {
    if (!Array.isArray(timelineEventIds) || timelineEventIds.length === 0) {
      return { acknowledgedEventIds: [] };
    }

    const supabase = await createClient();
    const { data, error } = await (supabase as unknown as UntypedClient)
      .from('baseball_timeline_event_acks')
      .select('timeline_event_id')
      .eq('user_id', ctx.user.id)
      .in('timeline_event_id', timelineEventIds);

    if (error) {
      return { acknowledgedEventIds: [] };
    }

    const rows = (data ?? []) as Pick<
      BaseballTimelineEventAckRow,
      'timeline_event_id'
    >[];
    return { acknowledgedEventIds: rows.map((r) => r.timeline_event_id) };
  },
);
