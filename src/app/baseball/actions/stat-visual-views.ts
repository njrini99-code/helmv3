'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/stat-visual-views.ts
//
// Packet: stat-visuals (BaseballHelm — stats-integrations)
//
// Server actions that WIRE the additive baseball_stat_visual_views table
// (migration 20260624000091) to the V10 stat-visual gallery. They persist the
// "saved chart filter state + pinned charts" capability the visual contracts
// call for (v10_baseball_stat_visual_contracts.md §"Source-Linked Trend Ribbon"
// / §"Player DNA Panel" + v10_premium_ui_system_by_tab.md §"Stats Lab" and
// §"Player Profile / Snapshot Cards") — until now the table/type/RLS were
// scaffolded but no code read or wrote them.
//
// SECURITY / CONTRACT
//   * Every action runs inside withBaseballAction so auth + the server-validated
//     active baseball team/role are resolved before any query. The wrapper
//     sanitizes thrown errors so raw DB internals never reach the client.
//   * Authorization for THIS table is per-user personalization, not a staff
//     capability: saved views/pins must work for BOTH staff (Stats Center) AND
//     players (player-profile pins, who hold no staff capability). So we set NO
//     requiredCapability and rely on the table's OWNER-scoped + team-scoped RLS
//     (owner_user_id = auth.uid() AND is_baseball_team_member(team_id)) for
//     server-side enforcement — a user can only ever read/write their OWN rows
//     on a team they belong to.
//   * owner_user_id + team_id are stamped from the resolved server context on
//     every write (never trusted from the client), so a row can't be written
//     against another user or team.
//   * NO destructive writes: the save path UPSERTs on the
//     (owner_user_id, visual_key, player_id) UNIQUE constraint; pin/unpin and
//     delete are explicit in-place operations a user performs on their own row.
//   * revalidatePath refreshes the two surfaces that mount the gallery.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { sanitizeDbError } from '@/lib/db-error';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import type { BaseballStatVisualView } from '@/lib/types/baseball-stat-visuals';
import type { Json } from '@/lib/types';

const FEATURE = { featureArea: 'baseball-stat-visuals' } as const;

const STATS_CENTER_PATH = '/baseball/dashboard/stats';
const PLAYER_STATS_PATH = '/baseball/dashboard/players';

type ActionResult<T = unknown> = { success: boolean; error?: string; data?: T };

/** Bound the visual_key to the table CHECK (1..80 chars) before it hits the DB. */
function normalizeVisualKey(key: string): string | null {
  const trimmed = key.trim();
  if (trimmed.length < 1 || trimmed.length > 80) return null;
  return trimmed;
}

// -----------------------------------------------------------------------------
// READ — the saved views (and pins) the current user owns, optionally scoped to
// a single player profile. RLS already restricts to owner + team; the explicit
// filters keep payloads small and let the player profile ask only for its pins.
// -----------------------------------------------------------------------------

export const getStatVisualViews = withBaseballAction(
  'getStatVisualViews',
  FEATURE,
  async (
    ctx,
    input?: { playerId?: string | null },
  ): Promise<ActionResult<BaseballStatVisualView[]>> => {
    const supabase = await createClient();

    let query = fromUntyped(supabase, 'baseball_stat_visual_views')
      .select(
        'id, team_id, owner_user_id, visual_key, player_id, view_state, is_pinned, created_at, updated_at',
      )
      .eq('owner_user_id', ctx.user.id)
      .eq('team_id', ctx.targetTeamId);

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
// SAVE — upsert a user's filter/tab state for one chart (no delete-then-insert).
// -----------------------------------------------------------------------------

export interface SaveStatVisualViewInput {
  /** Stable chart key, e.g. 'ev_la_matrix', 'player_dna', or a family tab key. */
  visualKey: string;
  /** Serialized filter/tab state (context filter, pitch-type tab, date window). */
  viewState: Json;
  /** Optional player this saved view is scoped to (player-profile pins). */
  playerId?: string | null;
  /** Optionally set the pinned flag in the same write. */
  isPinned?: boolean;
}

export const saveStatVisualView = withBaseballAction(
  'saveStatVisualView',
  FEATURE,
  async (
    ctx,
    input: SaveStatVisualViewInput,
  ): Promise<ActionResult<{ viewId: string }>> => {
    const supabase = await createClient();

    const visualKey = normalizeVisualKey(input.visualKey);
    if (!visualKey) return { success: false, error: 'Invalid chart key.' };

    const nowIso = new Date().toISOString();
    const row = {
      team_id: ctx.targetTeamId,
      owner_user_id: ctx.user.id,
      visual_key: visualKey,
      player_id: input.playerId ?? null,
      view_state: input.viewState ?? {},
      ...(input.isPinned !== undefined ? { is_pinned: input.isPinned } : {}),
      updated_at: nowIso,
    };

    const { data, error } = await fromUntyped(supabase, 'baseball_stat_visual_views')
      .upsert(row, {
        onConflict: 'owner_user_id,visual_key,player_id',
        ignoreDuplicates: false,
      })
      .select('id')
      .single();
    if (error) return { success: false, error: sanitizeDbError(error, 'stats') };

    revalidatePath(STATS_CENTER_PATH);
    if (input.playerId) revalidatePath(`${PLAYER_STATS_PATH}/${input.playerId}`);

    return { success: true, data: { viewId: (data as { id: string }).id } };
  },
);

// -----------------------------------------------------------------------------
// PIN — flip whether a chart is pinned to the owner's snapshot. Upserts so a
// pin can be set even before any filter state was saved (no destructive write).
// -----------------------------------------------------------------------------

export const setStatVisualPinned = withBaseballAction(
  'setStatVisualPinned',
  FEATURE,
  async (
    ctx,
    input: { visualKey: string; isPinned: boolean; playerId?: string | null },
  ): Promise<ActionResult> => {
    const supabase = await createClient();

    const visualKey = normalizeVisualKey(input.visualKey);
    if (!visualKey) return { success: false, error: 'Invalid chart key.' };

    const { error } = await fromUntyped(supabase, 'baseball_stat_visual_views')
      .upsert(
        {
          team_id: ctx.targetTeamId,
          owner_user_id: ctx.user.id,
          visual_key: visualKey,
          player_id: input.playerId ?? null,
          is_pinned: input.isPinned,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'owner_user_id,visual_key,player_id', ignoreDuplicates: false },
      );
    if (error) return { success: false, error: sanitizeDbError(error, 'stats') };

    revalidatePath(STATS_CENTER_PATH);
    if (input.playerId) revalidatePath(`${PLAYER_STATS_PATH}/${input.playerId}`);

    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// DELETE — drop a user's own saved view (explicit user action on their own row).
// -----------------------------------------------------------------------------

export const deleteStatVisualView = withBaseballAction(
  'deleteStatVisualView',
  FEATURE,
  async (
    ctx,
    input: { visualKey: string; playerId?: string | null },
  ): Promise<ActionResult> => {
    const supabase = await createClient();

    const visualKey = normalizeVisualKey(input.visualKey);
    if (!visualKey) return { success: false, error: 'Invalid chart key.' };

    let query = fromUntyped(supabase, 'baseball_stat_visual_views')
      .delete()
      .eq('owner_user_id', ctx.user.id)
      .eq('team_id', ctx.targetTeamId)
      .eq('visual_key', visualKey);
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
