'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/passport-settings.ts
//
// V5 Player Passport — Visibility Controls WRITE actions.
//
// Spec: v5_player_passport_and_recruiting_showcase_system.md §"Visibility Controls"
//   "Every passport field needs visibility." + the Exposure section
//   (staff_only / player_visible / public_profile / scout_packet).
//
// This file closes the gap where baseball_player_passport_settings + its RLS were
// built but NOTHING ever wrote a row — so exposure could never be turned on and
// the per-field override mechanic was inert (the read model always fell back to
// staff_only + {} overrides). These actions are the missing WRITE half:
//
//   * updatePassportVisibility — upsert the (player, team) settings row:
//       visibility_state + headline + per-field override map. The ONE primary
//       action the Visibility Controls UI calls.
//   * setPassportFieldVisibility — narrow one field's override (granular toggle
//       from the field editor) without resubmitting the whole map.
//   * clearPassportFieldOverride — drop one field back to its base default.
//
// SECURITY (matches the table RLS exactly):
//   * Every action runs inside withBaseballAction (auth + active-context +
//     Sentry + sanitized errors). No requiredCapability — the SUBJECT PLAYER
//     must be allowed through (they hold no staff capability), so the self/staff
//     gate is enforced INSIDE the action and independently by RLS:
//       writer is the subject player  OR  staff (can_manage_roster) of the team.
//     RLS WITH CHECK = is_baseball_team_coach_v2(team) OR player_id = self.
//   * The honesty rule is enforced on the WAY IN: clampOverrideToBase() can
//     never widen a staff_only base. The read model applies the same floor again
//     defensively. Both halves share ONE catalog (passport-fields.ts) so they
//     cannot drift.
//
// NON-DESTRUCTIVE: upsert on UNIQUE(player_id, team_id). The override map is
// validated + rebuilt, never delete-then-reinsert; no-op overrides are dropped
// (absent keys fall back to the base in the read model).
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';
import {
  PASSPORT_FIELD_KEYS,
  clampOverrideToBase,
  isPassportFieldVisibility,
} from '@/lib/baseball/passport-fields';
import type {
  PassportVisibilityState,
  PassportFieldVisibility,
  PassportFieldVisibilityMap,
} from '@/lib/types/baseball-passport';

const PLAYER_TODAY_PATH = '/baseball/player/today';
const PLAYER_PASSPORT_PATH = '/baseball/player/passport';

const MAX_HEADLINE = 140;

const VALID_STATES: ReadonlySet<PassportVisibilityState> = new Set([
  'staff_only',
  'player_visible',
  'public_profile',
  'scout_packet',
]);

export interface PassportSettingsActionResult {
  success: boolean;
  error?: string;
  settingsId?: string;
  /** The override map actually persisted (post-clamp) so the UI can reconcile. */
  fieldVisibility?: PassportFieldVisibilityMap;
}

// -----------------------------------------------------------------------------
// Authorization — mirror the RLS gate (subject player OR team staff).
// -----------------------------------------------------------------------------

/**
 * Resolve the target player id AND assert the caller may write that player's
 * passport settings on the active team. Returns the validated target player id,
 * or null when the caller is neither the subject player nor team staff.
 *
 *   - When the caller IS the subject player (the self path), targetPlayerId is
 *     omitted/equals their own id → allowed.
 *   - When the caller is STAFF (can_manage_roster, the roster-evaluation
 *     capability — head/primary coach implicitly hold it), they may write any
 *     roster player's settings on the team.
 *
 * This intentionally mirrors the table policy WITH CHECK:
 *   is_baseball_team_coach_v2(team_id) OR player_id = get_my_baseball_player_id().
 */
async function authorizeTarget(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: { teamId: string; callerPlayerId: string | null; requestedPlayerId?: string },
): Promise<{ ok: boolean; targetPlayerId: string | null; error?: string }> {
  const { teamId, callerPlayerId, requestedPlayerId } = args;

  // Self path: no explicit target, or target is the caller's own player id.
  const isSelfTarget =
    !requestedPlayerId || (callerPlayerId != null && requestedPlayerId === callerPlayerId);

  if (isSelfTarget) {
    if (!callerPlayerId) {
      // Caller has no player identity on this team and didn't name a target →
      // they must be staff to act; fall through to the staff check below with no
      // self target. If they're not staff either, reject.
      const staff = await hasBaseballCapability(teamId, 'can_manage_roster');
      if (!staff) {
        return { ok: false, targetPlayerId: null, error: 'You can only manage your own passport.' };
      }
      // Staff with no named target is a programming error from the UI.
      return { ok: false, targetPlayerId: null, error: 'A player is required.' };
    }
    return { ok: true, targetPlayerId: callerPlayerId };
  }

  // Cross-player path: caller is editing someone else → must be team staff.
  const staff = await hasBaseballCapability(teamId, 'can_manage_roster');
  if (!staff) {
    return {
      ok: false,
      targetPlayerId: null,
      error: 'You can only manage your own passport.',
    };
  }

  // Confirm the target is actually a roster player on this team (RLS would also
  // reject, but this gives an honest error instead of a silent 0-row write).
  const { data: member } = await supabase
    .from('baseball_team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('player_id', requestedPlayerId)
    .maybeSingle();
  if (!member) {
    return { ok: false, targetPlayerId: null, error: 'That player is not on this team.' };
  }
  return { ok: true, targetPlayerId: requestedPlayerId };
}

/**
 * Validate + clamp an incoming override map. Unknown keys are dropped (a forged
 * key can never widen anything), bad values are dropped, and every kept override
 * is run through the honesty floor (clampOverrideToBase) so a staff_only base can
 * never be widened — even if the client tries. No-op overrides (== base) are
 * dropped so the stored map stays clean.
 */
function sanitizeFieldVisibility(
  raw: unknown,
): PassportFieldVisibilityMap {
  const out: PassportFieldVisibilityMap = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!PASSPORT_FIELD_KEYS.has(key)) continue;
    if (!isPassportFieldVisibility(value)) continue;
    const clamped = clampOverrideToBase(key, value as PassportFieldVisibility);
    if (clamped) out[key] = clamped;
  }
  return out;
}

// -----------------------------------------------------------------------------
// updatePassportVisibility — the primary write (state + headline + overrides).
// -----------------------------------------------------------------------------

/**
 * Upsert the passport settings row for the target player on the active team.
 * The ONE action the Visibility Controls form submits. Idempotent on the
 * UNIQUE(player_id, team_id) key. Honesty rule enforced on the way in.
 */
export const updatePassportVisibility = withBaseballAction(
  'updatePassportVisibility',
  { featureArea: 'player_today' },
  async (
    ctx,
    input: {
      /** Omit for the self path; staff pass the target roster player's id. */
      playerId?: string;
      visibilityState: PassportVisibilityState;
      headline?: string | null;
      fieldVisibility?: PassportFieldVisibilityMap;
    },
  ): Promise<PassportSettingsActionResult> => {
    const supabase = await createClient();

    if (!input?.visibilityState || !VALID_STATES.has(input.visibilityState)) {
      return { success: false, error: 'Choose a valid exposure level.' };
    }

    const auth = await authorizeTarget(supabase, {
      teamId: ctx.activeTeamId,
      callerPlayerId: ctx.activePlayerId,
      requestedPlayerId: input.playerId,
    });
    if (!auth.ok || !auth.targetPlayerId) {
      return { success: false, error: auth.error ?? 'Not authorized.' };
    }

    const headline =
      typeof input.headline === 'string'
        ? input.headline.trim().slice(0, MAX_HEADLINE) || null
        : input.headline === null
          ? null
          : undefined;

    const fieldVisibility = sanitizeFieldVisibility(input.fieldVisibility ?? {});

    const row: Record<string, unknown> = {
      player_id: auth.targetPlayerId,
      team_id: ctx.activeTeamId,
      visibility_state: input.visibilityState,
      field_visibility: fieldVisibility,
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    };
    // Only touch headline when the caller intended to (undefined = leave as-is on
    // an existing row; upsert would otherwise null an existing headline).
    if (headline !== undefined) row.headline = headline;

    const { data, error } = await fromUntyped(supabase, 'baseball_player_passport_settings')
      .upsert(row, { onConflict: 'player_id,team_id' })
      .select('id, field_visibility')
      .maybeSingle();

    if (error) throw error;

    revalidatePath(PLAYER_TODAY_PATH);
    revalidatePath(PLAYER_PASSPORT_PATH);

    return {
      success: true,
      settingsId: (data as { id: string } | null)?.id,
      fieldVisibility:
        ((data as { field_visibility?: PassportFieldVisibilityMap } | null)
          ?.field_visibility) ?? fieldVisibility,
    };
  },
);

// -----------------------------------------------------------------------------
// setPassportFieldVisibility — granular toggle of ONE field's override.
// -----------------------------------------------------------------------------

/**
 * Narrow/expose ONE passport field without resubmitting the whole map. Read-
 * modify-write of the SAME row's field_visibility jsonb. Creates the settings
 * row (default staff_only state) when none exists yet, so a player can start
 * from the field editor. The honesty floor still applies.
 */
export const setPassportFieldVisibility = withBaseballAction(
  'setPassportFieldVisibility',
  { featureArea: 'player_today' },
  async (
    ctx,
    input: {
      playerId?: string;
      fieldKey: string;
      visibility: PassportFieldVisibility;
    },
  ): Promise<PassportSettingsActionResult> => {
    const supabase = await createClient();

    if (!input?.fieldKey || !PASSPORT_FIELD_KEYS.has(input.fieldKey)) {
      return { success: false, error: 'Unknown passport field.' };
    }
    if (!isPassportFieldVisibility(input.visibility)) {
      return { success: false, error: 'Choose a valid visibility level.' };
    }

    const auth = await authorizeTarget(supabase, {
      teamId: ctx.activeTeamId,
      callerPlayerId: ctx.activePlayerId,
      requestedPlayerId: input.playerId,
    });
    if (!auth.ok || !auth.targetPlayerId) {
      return { success: false, error: auth.error ?? 'Not authorized.' };
    }

    const { data: existing } = await fromUntyped(supabase, 'baseball_player_passport_settings')
      .select('id, field_visibility, visibility_state')
      .eq('player_id', auth.targetPlayerId)
      .eq('team_id', ctx.activeTeamId)
      .maybeSingle();

    const prior = (existing as {
      id: string;
      field_visibility: PassportFieldVisibilityMap | null;
      visibility_state: PassportVisibilityState;
    } | null) ?? null;

    const map: PassportFieldVisibilityMap = {
      ...(prior?.field_visibility && typeof prior.field_visibility === 'object'
        ? prior.field_visibility
        : {}),
    };

    const clamped = clampOverrideToBase(input.fieldKey, input.visibility);
    if (clamped) {
      map[input.fieldKey] = clamped;
    } else {
      // The requested visibility equals the base → store no override (clean map).
      delete map[input.fieldKey];
    }

    const row: Record<string, unknown> = {
      player_id: auth.targetPlayerId,
      team_id: ctx.activeTeamId,
      // Preserve the existing exposure state; default staff_only when creating.
      visibility_state: prior?.visibility_state ?? 'staff_only',
      field_visibility: map,
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await fromUntyped(supabase, 'baseball_player_passport_settings')
      .upsert(row, { onConflict: 'player_id,team_id' })
      .select('id, field_visibility')
      .maybeSingle();

    if (error) throw error;

    revalidatePath(PLAYER_TODAY_PATH);
    revalidatePath(PLAYER_PASSPORT_PATH);

    return {
      success: true,
      settingsId: (data as { id: string } | null)?.id,
      fieldVisibility:
        ((data as { field_visibility?: PassportFieldVisibilityMap } | null)
          ?.field_visibility) ?? map,
    };
  },
);

// -----------------------------------------------------------------------------
// clearPassportFieldOverride — drop one field back to its base default.
// -----------------------------------------------------------------------------

/**
 * Remove a single field's override so it falls back to the section base in the
 * read model. No-op (success:true) when there is no settings row or no override
 * for that field — clearing a default is always honest.
 */
export const clearPassportFieldOverride = withBaseballAction(
  'clearPassportFieldOverride',
  { featureArea: 'player_today' },
  async (
    ctx,
    input: { playerId?: string; fieldKey: string },
  ): Promise<PassportSettingsActionResult> => {
    const supabase = await createClient();

    if (!input?.fieldKey || !PASSPORT_FIELD_KEYS.has(input.fieldKey)) {
      return { success: false, error: 'Unknown passport field.' };
    }

    const auth = await authorizeTarget(supabase, {
      teamId: ctx.activeTeamId,
      callerPlayerId: ctx.activePlayerId,
      requestedPlayerId: input.playerId,
    });
    if (!auth.ok || !auth.targetPlayerId) {
      return { success: false, error: auth.error ?? 'Not authorized.' };
    }

    const { data: existing } = await fromUntyped(supabase, 'baseball_player_passport_settings')
      .select('id, field_visibility')
      .eq('player_id', auth.targetPlayerId)
      .eq('team_id', ctx.activeTeamId)
      .maybeSingle();

    const prior = (existing as {
      id: string;
      field_visibility: PassportFieldVisibilityMap | null;
    } | null) ?? null;

    if (!prior || !prior.field_visibility || !(input.fieldKey in prior.field_visibility)) {
      return { success: true, settingsId: prior?.id, fieldVisibility: prior?.field_visibility ?? {} };
    }

    const map: PassportFieldVisibilityMap = { ...prior.field_visibility };
    delete map[input.fieldKey];

    const { error } = await fromUntyped(supabase, 'baseball_player_passport_settings')
      .update({ field_visibility: map, updated_by: ctx.user.id, updated_at: new Date().toISOString() })
      .eq('id', prior.id);

    if (error) throw error;

    revalidatePath(PLAYER_TODAY_PATH);
    revalidatePath(PLAYER_PASSPORT_PATH);

    return { success: true, settingsId: prior.id, fieldVisibility: map };
  },
);
