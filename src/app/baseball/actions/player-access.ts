'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/player-access.ts
//
// Wave 4 / packet: qa-screens (player-access enforcement remediation)
//
// Server actions for player self-service behaviors that the Settings-OS
// player-access toggles must GATE. These replace direct-from-client Supabase
// writes that bypassed any server-side policy check, and they make the toggles
// load-bearing via withBaseballAction({ requiredPlayerAccess }):
//
//   * activateRecruitingExposure — a player opts into recruiting exposure.
//       GATED on recruiting_exposure_enabled. Previously done as a raw client
//       write in /dashboard/activate (no policy check at all).
//   * deactivateRecruitingExposure — symmetric opt-out (always allowed; a player
//       may always withdraw — turning a toggle OFF must not trap an activated
//       player, but it DOES block re-activation).
//   * updateMyPlayerProfile — a player edits their own profile fields.
//       GATED on can_edit_profile (coaches bypass via the resolver).
//
// Every mutation is server-side, capability/access-enforced, audited via the
// wrapper's Sentry+error pipeline, revalidates the affected paths, and never
// trusts a client-supplied player_id (identity comes from the resolved active
// context; RLS backstops ownership). No destructive writes.
// =============================================================================

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { withBaseballAction, BaseballActionError } from '@/lib/baseball/with-baseball-action';

const ACTIVATE_PATH = '/baseball/dashboard/activate';
const DASHBOARD_PATH = '/baseball/dashboard';
const PROFILE_PATH = '/baseball/dashboard/profile';

export interface PlayerAccessActionResult {
  success: boolean;
  error?: string;
}

// -----------------------------------------------------------------------------
// activateRecruitingExposure — GATED on recruiting_exposure_enabled
// -----------------------------------------------------------------------------

/**
 * A player opts into recruiting exposure for the active team. Enforced
 * server-side: if the team has recruiting_exposure_enabled = false the action
 * throws (PlayerAccessError -> sanitized 403 message), so flipping that toggle
 * actually prevents activation rather than only hiding a button. College
 * players can never activate (DB column + product rule); we additionally check
 * the player's own type to fail fast with a clear message.
 */
export const activateRecruitingExposure = withBaseballAction(
  'activateRecruitingExposure',
  { featureArea: 'baseball-recruiting', requiredPlayerAccess: 'recruiting_exposure_enabled' },
  async (ctx): Promise<PlayerAccessActionResult> => {
    if (!ctx.activePlayerId) {
      throw new BaseballActionError('Only a player can activate recruiting exposure.');
    }
    const supabase = await createClient();

    // College players never activate (product rule). Read the player's type and
    // current activation state (RLS scopes this to the player's own row).
    const { data: player } = await fromUntyped(supabase, 'baseball_players')
      .select('id, player_type, recruiting_activated')
      .eq('id', ctx.activePlayerId)
      .maybeSingle();

    const p = (player ?? {}) as Record<string, unknown>;
    if ((p.player_type as string) === 'college') {
      throw new BaseballActionError('Recruiting features are not available for college players.');
    }
    if (p.recruiting_activated === true) {
      // Idempotent — already active.
      revalidatePath(DASHBOARD_PATH);
      return { success: true };
    }

    // Trigger 20260709010200 blocks authenticated-role writes to
    // recruiting_activated (closes the raw-browser RLS bypass), so this fully
    // gated action performs the write via the service-role client. All
    // authorization above (withBaseballAction gate on
    // recruiting_exposure_enabled + college check + self-row read via RLS)
    // has already passed by this point.
    const admin = createAdminClient();
    const { error } = await fromUntyped(admin, 'baseball_players')
      .update({
        recruiting_activated: true,
        recruiting_activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', ctx.activePlayerId);
    if (error) throw error;

    revalidatePath(ACTIVATE_PATH);
    revalidatePath(DASHBOARD_PATH);
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// deactivateRecruitingExposure — always allowed (withdrawal is never trapped)
// -----------------------------------------------------------------------------

/**
 * A player withdraws from recruiting exposure. Intentionally NOT gated on the
 * toggle: a player must always be able to opt OUT, even after the program turns
 * exposure off (the gate only blocks turning exposure ON). Self-write only.
 */
export const deactivateRecruitingExposure = withBaseballAction(
  'deactivateRecruitingExposure',
  { featureArea: 'baseball-recruiting' },
  async (ctx): Promise<PlayerAccessActionResult> => {
    if (!ctx.activePlayerId) {
      throw new BaseballActionError('Only a player can change recruiting exposure.');
    }
    // Same service-role requirement as activation (trigger 20260709010200);
    // withdrawal stays ungated by policy — a player can always opt out.
    const admin = createAdminClient();
    const { error } = await fromUntyped(admin, 'baseball_players')
      .update({ recruiting_activated: false, updated_at: new Date().toISOString() })
      .eq('id', ctx.activePlayerId);
    if (error) throw error;
    revalidatePath(DASHBOARD_PATH);
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// updateMyPlayerProfile — GATED on can_edit_profile (coaches bypass)
// -----------------------------------------------------------------------------

const profilePatchSchema = z.object({
  bio: z.string().max(2000).optional(),
  primary_position: z.string().max(40).optional(),
  secondary_position: z.string().max(40).optional(),
  height_inches: z.number().int().min(36).max(96).optional().nullable(),
  weight_lbs: z.number().int().min(60).max(400).optional().nullable(),
  bats: z.enum(['L', 'R', 'S']).optional(),
  throws: z.enum(['L', 'R']).optional(),
  hometown: z.string().max(120).optional(),
  grad_year: z.number().int().min(2000).max(2100).optional().nullable(),
});

/** Fields a player may write to their own row. Anything else is dropped. */
const EDITABLE_PROFILE_FIELDS = new Set(Object.keys(profilePatchSchema.shape));

/**
 * A player edits their own profile. GATED on can_edit_profile: when the program
 * turns player profile editing off, this throws server-side regardless of what
 * the UI renders. A coach with staff capability bypasses the toggle (the
 * resolver's staff bypass), so coaches can always maintain a player's profile.
 * Self-write only; identity from active context; RLS backstops ownership.
 */
export const updateMyPlayerProfile = withBaseballAction(
  'updateMyPlayerProfile',
  { featureArea: 'baseball-profile', requiredPlayerAccess: 'can_edit_profile' },
  async (ctx, raw: z.input<typeof profilePatchSchema>): Promise<PlayerAccessActionResult> => {
    if (!ctx.activePlayerId) {
      throw new BaseballActionError('Only a player can edit their own profile.');
    }
    const input = profilePatchSchema.parse(raw);

    // Whitelist + strip undefined.
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (EDITABLE_PROFILE_FIELDS.has(k) && v !== undefined) patch[k] = v;
    }
    if (Object.keys(patch).length === 0) {
      return { success: true };
    }
    patch.updated_at = new Date().toISOString();

    const supabase = await createClient();
    const { error } = await fromUntyped(supabase, 'baseball_players')
      .update(patch)
      .eq('id', ctx.activePlayerId);
    if (error) throw error;

    revalidatePath(PROFILE_PATH);
    revalidatePath(DASHBOARD_PATH);
    return { success: true };
  },
);

// -----------------------------------------------------------------------------
// getTeamSeasonStatsForViewer — GATED on can_view_team_stats
// -----------------------------------------------------------------------------

export interface ViewerTeamSeasonStatsResult {
  success: boolean;
  /** baseball_player_season_stats rows for the active team's current season. */
  data?: Array<Record<string, unknown>>;
  error?: string;
}

/**
 * Player-facing team-wide season stats read. GATED on can_view_team_stats: when
 * the program turns team-stats sharing off for players, this throws server-side
 * (a player cannot read team stats by calling the action directly, not just by a
 * hidden tab). Coaches bypass the toggle via the resolver's staff bypass, so
 * staff always retain access. RLS still scopes rows to the team the viewer
 * belongs to. This is the canonical consumer a player-facing team-stats surface
 * must call (the coach Stats Center remains separately gated on can_manage_stats).
 */
export const getTeamSeasonStatsForViewer = withBaseballAction(
  'getTeamSeasonStatsForViewer',
  { featureArea: 'baseball-stats', requiredPlayerAccess: 'can_view_team_stats' },
  async (ctx, opts?: { seasonYear?: number }): Promise<ViewerTeamSeasonStatsResult> => {
    const supabase = await createClient();
    const year = opts?.seasonYear ?? new Date().getFullYear();

    const { data, error } = await fromUntyped(supabase, 'baseball_player_season_stats')
      .select(
        '*, player:baseball_players!player_id(first_name, last_name, primary_position)',
      )
      .eq('team_id', ctx.targetTeamId)
      .eq('season_year', year);

    if (error) {
      // Surface a sanitized envelope rather than throwing for an empty read.
      return { success: false, error: 'Could not load team stats.' };
    }
    return { success: true, data: (data ?? []) as Array<Record<string, unknown>> };
  },
);
