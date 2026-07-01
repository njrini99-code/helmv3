'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/stat-visual-views.ts
//
// Packet: stat-visuals (BaseballHelm — stats-integrations)
//
// Server actions that WIRE the baseball_stat_visual_views table to the V10
// stat-visual gallery. They persist the "saved chart filter state + pinned
// charts" capability the visual contracts call for (v10_baseball_stat_visual_
// contracts.md §"Source-Linked Trend Ribbon" / §"Player DNA Panel").
//
// SCHEMA (the DEPLOYED table — verified against information_schema, NOT the
// never-applied scaffold migration):
//   id, team_id, player_id, created_by_coach_id (→ baseball_coaches.id),
//   view_name (text, NOT NULL — we store the stable chart key here),
//   view_type / period_type / visibility / stat_keys (defaulted),
//   config_json (jsonb — we store the serialized filter/tab state here),
//   is_pinned, is_template, created_at, updated_at.
//
// The earlier revision of this file queried a hypothetical `owner_user_id` /
// `visual_key` / `view_state` shape from a scaffold migration that was never
// applied, which threw `column baseball_stat_visual_views.owner_user_id does
// not exist` and broke the Stats Center gallery. This revision reads/writes the
// real columns and aliases them back to the gallery's contract (visual_key /
// view_state) via PostgREST column aliases, so the client contract is unchanged.
//
// SECURITY / CONTRACT
//   * Every action runs inside withBaseballAction so auth + the server-validated
//     active baseball team/role are resolved before any query. The wrapper
//     sanitizes thrown errors so raw DB internals never reach the client.
//   * The deployed table's RLS is STAFF-scoped for writes
//     (is_baseball_team_staff(team_id)); players may only SELECT player-visible
//     rows scoped to their own player_id. So writes require a resolved
//     activeCoachId — we fail closed with an honest message otherwise, and RLS
//     is the real enforcement boundary regardless.
//   * created_by_coach_id + team_id are stamped from the resolved server context
//     on every write (never trusted from the client), so a row can't be written
//     against another coach or team.
//   * NO destructive writes: the save/pin path is a non-destructive manual
//     upsert (SELECT the owning row → UPDATE in place, else INSERT). There is no
//     unique constraint on the deployed table to `onConflict` against, so we
//     never delete-then-insert.
//   * revalidatePath refreshes the two surfaces that mount the gallery.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { sanitizeDbError } from '@/lib/db-error';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import type { BaseballStatVisualView } from '@/lib/types/baseball-stat-visuals';
import type { Json } from '@/lib/types';

const FEATURE = { featureArea: 'baseball-stat-visuals' } as const;

const STATS_CENTER_PATH = '/baseball/dashboard/stats-center';
const PLAYER_STATS_PATH = '/baseball/dashboard/players';

const TABLE = 'baseball_stat_visual_views';

// The gallery's contract (visual_key / view_state) mapped onto the deployed
// columns via PostgREST aliases so callers keep the stable field names.
const SELECT_COLS =
  'id, team_id, player_id, created_by_coach_id, is_pinned, created_at, updated_at, visual_key:view_name, view_state:config_json';

type ActionResult<T = unknown> = { success: boolean; error?: string; data?: T };

/** Bound the visual_key to the column length (1..80 chars) before it hits the DB. */
function normalizeVisualKey(key: string): string | null {
  const trimmed = key.trim();
  if (trimmed.length < 1 || trimmed.length > 80) return null;
  return trimmed;
}

// -----------------------------------------------------------------------------
// READ — the saved views (and pins) the current coach owns, optionally scoped to
// a single player profile. RLS already restricts to team staff (or a player's
// own visible rows); the explicit filters keep payloads small and per-coach.
// -----------------------------------------------------------------------------

export const getStatVisualViews = withBaseballAction(
  'getStatVisualViews',
  FEATURE,
  async (
    ctx,
    input?: { playerId?: string | null },
  ): Promise<ActionResult<BaseballStatVisualView[]>> => {
    const supabase = await createClient();

    let query = fromUntyped(supabase, TABLE)
      .select(SELECT_COLS)
      .eq('team_id', ctx.targetTeamId);

    // Coaches see only their own saved views; a player (no activeCoachId) falls
    // back to what RLS exposes (their player-visible rows).
    if (ctx.activeCoachId) {
      query = query.eq('created_by_coach_id', ctx.activeCoachId);
    }

    // Player profile asks for its player-scoped rows; team Stats Center asks for
    // team-scoped rows (player_id IS NULL) so a player's pins don't bleed in.
    if (input?.playerId) {
      query = query.eq('player_id', input.playerId);
    } else {
      query = query.is('player_id', null);
    }

    const { data, error } = await query.order('updated_at', { ascending: false });
    if (error) return { success: false, error: sanitizeDbError(error, 'stats') };

    return { success: true, data: (data ?? []) as BaseballStatVisualView[] };
  },
);

// -----------------------------------------------------------------------------
// SAVE — non-destructive manual upsert of a coach's filter/tab state for one
// chart. There is no unique constraint on the deployed table, so we resolve the
// owning row first and UPDATE it in place (never delete-then-insert).
// -----------------------------------------------------------------------------

export interface SaveStatVisualViewInput {
  /** Stable chart key, e.g. 'family:hitting' or 'ev_la_matrix'. Stored in view_name. */
  visualKey: string;
  /** Serialized filter/tab state (context filter, pitch-type tab, date window). */
  viewState: Json;
  /** Optional player this saved view is scoped to (player-profile pins). */
  playerId?: string | null;
  /** Optionally set the pinned flag in the same write. */
  isPinned?: boolean;
}

/**
 * Find the coach's existing saved-view row id for (visual_key, player scope).
 * Returns null when none exists yet. Scoped to the resolved coach + team.
 */
async function findOwnedRowId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coachId: string,
  teamId: string,
  visualKey: string,
  playerId: string | null,
): Promise<{ id: string | null; error: unknown }> {
  let q = fromUntyped(supabase, TABLE)
    .select('id')
    .eq('created_by_coach_id', coachId)
    .eq('team_id', teamId)
    .eq('view_name', visualKey);
  q = playerId ? q.eq('player_id', playerId) : q.is('player_id', null);

  const { data, error } = await q.maybeSingle();
  return { id: (data as { id: string } | null)?.id ?? null, error };
}

export const saveStatVisualView = withBaseballAction(
  'saveStatVisualView',
  FEATURE,
  async (
    ctx,
    input: SaveStatVisualViewInput,
  ): Promise<ActionResult<{ viewId: string }>> => {
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Only coaching staff can save chart views.' };
    }

    const visualKey = normalizeVisualKey(input.visualKey);
    if (!visualKey) return { success: false, error: 'Invalid chart key.' };

    const supabase = await createClient();
    const playerId = input.playerId ?? null;
    const nowIso = new Date().toISOString();

    const { id: existingId, error: findErr } = await findOwnedRowId(
      supabase,
      coachId,
      ctx.targetTeamId,
      visualKey,
      playerId,
    );
    if (findErr) return { success: false, error: sanitizeDbError(findErr, 'stats') };

    if (existingId) {
      const { error } = await fromUntyped(supabase, TABLE)
        .update({
          config_json: input.viewState ?? {},
          ...(input.isPinned !== undefined ? { is_pinned: input.isPinned } : {}),
          updated_at: nowIso,
        })
        .eq('id', existingId);
      if (error) return { success: false, error: sanitizeDbError(error, 'stats') };

      revalidatePath(STATS_CENTER_PATH);
      if (playerId) revalidatePath(`${PLAYER_STATS_PATH}/${playerId}`);
      return { success: true, data: { viewId: existingId } };
    }

    const { data, error } = await fromUntyped(supabase, TABLE)
      .insert({
        team_id: ctx.targetTeamId,
        created_by_coach_id: coachId,
        view_name: visualKey,
        config_json: input.viewState ?? {},
        player_id: playerId,
        is_pinned: input.isPinned ?? false,
        updated_at: nowIso,
      })
      .select('id')
      .single();
    if (error) return { success: false, error: sanitizeDbError(error, 'stats') };

    revalidatePath(STATS_CENTER_PATH);
    if (playerId) revalidatePath(`${PLAYER_STATS_PATH}/${playerId}`);

    return { success: true, data: { viewId: (data as { id: string }).id } };
  },
);

// -----------------------------------------------------------------------------
// PIN — flip whether a chart is pinned to the coach's snapshot. Non-destructive
// upsert so a pin can be set even before any filter state was saved.
// -----------------------------------------------------------------------------

export const setStatVisualPinned = withBaseballAction(
  'setStatVisualPinned',
  FEATURE,
  async (
    ctx,
    input: { visualKey: string; isPinned: boolean; playerId?: string | null },
  ): Promise<ActionResult> => {
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Only coaching staff can pin chart views.' };
    }

    const visualKey = normalizeVisualKey(input.visualKey);
    if (!visualKey) return { success: false, error: 'Invalid chart key.' };

    const supabase = await createClient();
    const playerId = input.playerId ?? null;
    const nowIso = new Date().toISOString();

    const { id: existingId, error: findErr } = await findOwnedRowId(
      supabase,
      coachId,
      ctx.targetTeamId,
      visualKey,
      playerId,
    );
    if (findErr) return { success: false, error: sanitizeDbError(findErr, 'stats') };

    if (existingId) {
      const { error } = await fromUntyped(supabase, TABLE)
        .update({ is_pinned: input.isPinned, updated_at: nowIso })
        .eq('id', existingId);
      if (error) return { success: false, error: sanitizeDbError(error, 'stats') };
    } else {
      const { error } = await fromUntyped(supabase, TABLE).insert({
        team_id: ctx.targetTeamId,
        created_by_coach_id: coachId,
        view_name: visualKey,
        player_id: playerId,
        is_pinned: input.isPinned,
        updated_at: nowIso,
      });
      if (error) return { success: false, error: sanitizeDbError(error, 'stats') };
    }

    revalidatePath(STATS_CENTER_PATH);
    if (playerId) revalidatePath(`${PLAYER_STATS_PATH}/${playerId}`);

    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// DELETE — drop a coach's own saved view (explicit action on their own row).
// -----------------------------------------------------------------------------

export const deleteStatVisualView = withBaseballAction(
  'deleteStatVisualView',
  FEATURE,
  async (
    ctx,
    input: { visualKey: string; playerId?: string | null },
  ): Promise<ActionResult> => {
    const coachId = ctx.activeCoachId;
    if (!coachId) {
      return { success: false, error: 'Only coaching staff can remove chart views.' };
    }

    const visualKey = normalizeVisualKey(input.visualKey);
    if (!visualKey) return { success: false, error: 'Invalid chart key.' };

    const supabase = await createClient();

    let query = fromUntyped(supabase, TABLE)
      .delete()
      .eq('created_by_coach_id', coachId)
      .eq('team_id', ctx.targetTeamId)
      .eq('view_name', visualKey);
    query = input.playerId
      ? query.eq('player_id', input.playerId)
      : query.is('player_id', null);

    const { error } = await query;
    if (error) return { success: false, error: sanitizeDbError(error, 'stats') };

    revalidatePath(STATS_CENTER_PATH);
    if (input.playerId) revalidatePath(`${PLAYER_STATS_PATH}/${input.playerId}`);

    return { success: true };
  },
);
