/**
 * CoachHelm V2 Gate
 *
 * Controls access to CoachHelm features based on user and team settings.
 * Provides functions to check if CoachHelm is enabled for a user.
 *
 * Fail-closed contract (LIVE-17): when the coach/player record cannot be
 * loaded due to a DB error, the gate returns `effectivelyEnabled=false`
 * rather than the prior behavior of treating transient errors as "enabled".
 * A missing row (data=null, error=null) still falls back to the enabled
 * default — only DB-level errors trigger the fail-closed path.
 *
 * The same holds for every other read the answer rests on (Q-146, 2026-10-01):
 * the coach's settings, their staffed teams, a player's active memberships and
 * the teams' settings. Each used to read a failure as "no row", so a transient
 * error turned CoachHelm on for a team that had switched it off. A failed read
 * now answers `effectivelyEnabled=false` with `SETTINGS_LOOKUP_FAILED_REASON`.
 *
 * Reads that do not depend on each other start together (perf, 2026-10-01): a
 * gate was four round trips for a coach (the coach row, their settings, their
 * staffed teams, then each team's settings in turn) and is two now (the row,
 * the settings and the staffed teams; then every team's settings in one read).
 * The answer is unchanged in every case, which `gate-batching.test.ts` checks
 * against a frozen copy of the serial version: a read that is not needed for
 * the answer (the settings of a coach whose row is missing, say) is started
 * anyway and its result, or its failure, is dropped unseen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import type { CoachHelmSettings, CoachHelmStatus } from './types';

const LOOKUP_FAILED_REASON = 'Coach record lookup failed';
const PLAYER_LOOKUP_FAILED_REASON = 'Player record lookup failed';
const SETTINGS_LOOKUP_FAILED_REASON = 'CoachHelm settings lookup failed';

/** A read whose failure is an answer of its own: the gate fails closed on it (Q-146). */
const READ_FAILED = Symbol('read failed');

function settingsLookupFailed(): CoachHelmStatus {
  return {
    userEnabled: false,
    teamEnabled: false,
    effectivelyEnabled: false,
    disabledReason: SETTINGS_LOOKUP_FAILED_REASON,
    disabledBy: null,
  };
}

async function logReadFailed(action: string, metadata: Record<string, unknown>): Promise<void> {
  await logServerError(`gate.${action} read failed`, {
    action: `gate.${action}`,
    featureArea: 'coachhelm.gate',
    metadata,
  });
}

/**
 * Checks if CoachHelm is enabled globally (feature flag)
 *
 * @returns Whether CoachHelm V2 is enabled globally
 */
function isCoachHelmEnabled(): boolean {
  const envFlag = process.env.NEXT_PUBLIC_COACHHELM_ENABLED;
  return envFlag !== 'false';
}

/**
 * Gets CoachHelm settings for a coach: null when the coach has no row, READ_FAILED when the read failed.
 */
async function getCoachHelmCoachSettings(
  coachId: string,
  supabase: SupabaseClient,
): Promise<CoachHelmSettings | null | typeof READ_FAILED> {
  try {
    const { data, error } = await supabase
      .from('golf_coachhelm_settings')
      .select('enabled, disabled_at, disabled_reason')
      .eq('coach_id', coachId)
      .maybeSingle();

    if (error) {
      await logReadFailed('getCoachHelmCoachSettings', { coachId, dbError: error });
      return READ_FAILED;
    }
    if (!data) return null;

    return {
      // DB column is `boolean | null`; default null/undefined to true
      // (the legacy local type narrowed this to `boolean`).
      enabled: data.enabled ?? true,
      disabledAt: data.disabled_at ?? null,
      disabledReason: data.disabled_reason ?? null,
    };
  } catch (err) {
    await logServerError('gate.getCoachHelmCoachSettings threw', {
      action: 'gate.getCoachHelmCoachSettings',
      featureArea: 'coachhelm.gate',
      metadata: { coachId, error: String(err) },
    });
    return READ_FAILED;
  }
}

/**
 * Starts a read now and marks it handled, so an early return on another read cannot leave a rejection nobody awaits. Awaiting it later
 * still throws what it threw, at the point the serial version would have thrown it.
 */
function startedHandled<T>(make: () => PromiseLike<T>): Promise<T> {
  let started: Promise<T>;
  try {
    started = Promise.resolve(make());
  } catch (err) {
    // Building a query that throws is the same as the read failing: it surfaces where the result is awaited, as the serial version's did.
    started = Promise.reject(err);
  }
  started.catch(() => undefined);
  return started;
}

/**
 * Gets CoachHelm settings for several teams in one read. A team with no row, or (never, `team_id` is unique) more than one row, is
 * simply absent from the map, which the caller reads as "enabled": what the single-team read did with `!data` (`maybeSingle` fails on
 * two rows). A failed read is READ_FAILED, and the gate fails closed on it (Q-146).
 */
async function getTeamCoachHelmSettings(
  teamIds: string[],
  supabase: SupabaseClient,
): Promise<Map<string, { enabled: boolean; disabledReason: string | null }> | typeof READ_FAILED> {
  const byTeam = new Map<string, { enabled: boolean; disabledReason: string | null }>();
  try {
    const { data, error } = await supabase
      .from('golf_team_coachhelm_settings')
      .select('team_id, enabled, disabled_reason, disabled_at')
      .in('team_id', teamIds);

    if (error) {
      await logReadFailed('getTeamCoachHelmSettings', { teamIds, dbError: error });
      return READ_FAILED;
    }
    if (!data) return byTeam;

    const seen = new Set<string>();
    const duplicated = new Set<string>();
    for (const row of data) {
      if (seen.has(row.team_id)) duplicated.add(row.team_id);
      seen.add(row.team_id);
    }
    for (const row of data) {
      if (duplicated.has(row.team_id)) continue;
      byTeam.set(row.team_id, {
        // DB column is `boolean | null`; default null/undefined to true
        // (callers already use `?? true` downstream — preserves runtime behavior).
        enabled: row.enabled ?? true,
        disabledReason: row.disabled_reason,
      });
    }
    return byTeam;
  } catch (err) {
    await logServerError('gate.getTeamCoachHelmSettings threw', {
      action: 'gate.getTeamCoachHelmSettings',
      featureArea: 'coachhelm.gate',
      metadata: { teamIds, error: String(err) },
    });
    return READ_FAILED;
  }
}

/**
 * Checks if CoachHelm is enabled for a specific coach
 *
 * This checks the global feature flag, coach settings, and team settings.
 * On DB error during the primary coach lookup, returns `effectivelyEnabled=false`
 * (fail-closed) — LIVE-17 — and the same on a failed settings, staff or team
 * settings read (Q-146).
 *
 * @param coachId          The coach's UUID (from golf_coaches table)
 * @param supabaseOverride Optional injected client (tests)
 */
export async function isCoachHelmEnabledForCoach(
  coachId: string,
  supabaseOverride?: SupabaseClient,
): Promise<CoachHelmStatus> {
  if (!isCoachHelmEnabled()) {
    return {
      userEnabled: false,
      teamEnabled: false,
      effectivelyEnabled: false,
      disabledReason: 'CoachHelm is disabled globally',
      disabledBy: null,
    };
  }

  const supabase = (supabaseOverride ?? (createAdminClient())) as SupabaseClient;

  // The coach's own reads do not depend on each other: the row says whether the others count, and they start with it.
  const coachRead = startedHandled(() => supabase.from('golf_coaches').select('user_id, organization_id').eq('id', coachId).single());
  const settingsRead = startedHandled(() => getCoachHelmCoachSettings(coachId, supabase));
  const staffRead = startedHandled(() => supabase.from('golf_team_coach_staff').select('team_id').eq('coach_id', coachId));

  // Get coach record with team via organization
  const { data: coach, error: coachError } = await coachRead;

  if (coachError) {
    await logServerError('gate.isCoachHelmEnabledForCoach lookup failed', {
      action: 'gate.isCoachHelmEnabledForCoach',
      featureArea: 'coachhelm.gate',
      metadata: { coachId, dbError: coachError },
    });
    return {
      userEnabled: false,
      teamEnabled: false,
      effectivelyEnabled: false,
      disabledReason: LOOKUP_FAILED_REASON,
      disabledBy: null,
    };
  }

  if (!coach) {
    // No error, just no row — fall back to enabled default for backward
    // compatibility (prior behavior for missing records).
    return {
      userEnabled: true,
      teamEnabled: true,
      effectivelyEnabled: true,
      disabledReason: null,
      disabledBy: null,
    };
  }

  // Check coach-level settings
  const coachSettings = await settingsRead;
  if (coachSettings === READ_FAILED) return settingsLookupFailed();
  const userEnabled = coachSettings?.enabled ?? true;

  if (!userEnabled) {
    return {
      userEnabled: false,
      teamEnabled: true,
      effectivelyEnabled: false,
      disabledReason: coachSettings?.disabledReason ?? 'Disabled by user',
      disabledBy: 'user',
    };
  }

  // Check team-level settings across every team the coach staffs. A coach is
  // gated as disabled only when ALL staffed teams have CoachHelm disabled —
  // otherwise CoachHelm runs for the still-enabled team. Resolving via
  // golf_team_coach_staff avoids the old "pick first team in the org" bug
  // that silently misread the wrong team's settings in multi-team orgs.
  let staffedTeams: { team_id: string | null }[] | null;
  try {
    const { data, error } = await staffRead;
    if (error) {
      await logReadFailed('isCoachHelmEnabledForCoach.staff', { coachId, dbError: error });
      return settingsLookupFailed();
    }
    staffedTeams = data;
  } catch (err) {
    await logReadFailed('isCoachHelmEnabledForCoach.staff', { coachId, error: String(err) });
    return settingsLookupFailed();
  }

  const teamIds = (staffedTeams ?? [])
    .map((s) => s.team_id)
    .filter((id): id is string => !!id);

  if (teamIds.length > 0) {
    const settingsByTeam = await getTeamCoachHelmSettings(teamIds, supabase);
    if (settingsByTeam === READ_FAILED) return settingsLookupFailed();
    let allDisabled = true;
    let firstDisabledReason: string | null = null;
    for (const teamId of teamIds) {
      const teamSettings = settingsByTeam.get(teamId) ?? null;
      const teamEnabled = teamSettings?.enabled ?? true;
      if (teamEnabled) {
        allDisabled = false;
        break;
      }
      firstDisabledReason ??= teamSettings?.disabledReason ?? null;
    }

    if (allDisabled) {
      return {
        userEnabled: true,
        teamEnabled: false,
        effectivelyEnabled: false,
        disabledReason: firstDisabledReason ?? 'Disabled by team',
        disabledBy: 'team',
      };
    }
  }

  return {
    userEnabled: true,
    teamEnabled: true,
    effectivelyEnabled: true,
    disabledReason: null,
    disabledBy: null,
  };
}

/**
 * Checks if CoachHelm is enabled for a specific player
 *
 * Fail-closed on DB lookup errors (LIVE-17), including the memberships and
 * team settings reads (Q-146).
 *
 * @param playerId         The player's UUID (from golf_players table)
 * @param supabaseOverride Optional injected client (tests)
 */
export async function isCoachHelmEnabledForPlayer(
  playerId: string,
  supabaseOverride?: SupabaseClient,
): Promise<CoachHelmStatus> {
  if (!isCoachHelmEnabled()) {
    return {
      userEnabled: false,
      teamEnabled: false,
      effectivelyEnabled: false,
      disabledReason: 'CoachHelm is disabled globally',
      disabledBy: null,
    };
  }

  const supabase = (supabaseOverride ?? (createAdminClient())) as SupabaseClient;

  // The row says whether the memberships count; both start together.
  const playerRead = startedHandled(() => supabase.from('golf_players').select('user_id').eq('id', playerId).single());
  const membershipsRead = startedHandled(() =>
    supabase.from('golf_team_members').select('team_id').eq('player_id', playerId).eq('status', 'active'),
  );

  const { data: player, error: playerError } = await playerRead;

  if (playerError) {
    await logServerError('gate.isCoachHelmEnabledForPlayer lookup failed', {
      action: 'gate.isCoachHelmEnabledForPlayer',
      featureArea: 'coachhelm.gate',
      metadata: { playerId, dbError: playerError },
    });
    return {
      userEnabled: false,
      teamEnabled: false,
      effectivelyEnabled: false,
      disabledReason: PLAYER_LOOKUP_FAILED_REASON,
      disabledBy: null,
    };
  }

  if (!player) {
    return {
      userEnabled: true,
      teamEnabled: true,
      effectivelyEnabled: true,
      disabledReason: null,
      disabledBy: null,
    };
  }

  // Players on multiple teams: gate as disabled only when EVERY active team
  // has CoachHelm disabled. Otherwise CoachHelm runs (the still-enabled team
  // governs). Previous code read player.team[0] — an arbitrary first
  // membership — which could read the wrong team's setting.
  let memberships: { team_id: string | null }[] | null;
  try {
    const { data, error } = await membershipsRead;
    if (error) {
      await logReadFailed('isCoachHelmEnabledForPlayer.memberships', { playerId, dbError: error });
      return settingsLookupFailed();
    }
    memberships = data;
  } catch (err) {
    await logReadFailed('isCoachHelmEnabledForPlayer.memberships', { playerId, error: String(err) });
    return settingsLookupFailed();
  }

  const playerTeamIds = (memberships ?? [])
    .map((m) => m.team_id)
    .filter((id): id is string => !!id);

  if (playerTeamIds.length > 0) {
    const settingsByTeam = await getTeamCoachHelmSettings(playerTeamIds, supabase);
    if (settingsByTeam === READ_FAILED) return settingsLookupFailed();
    let allDisabled = true;
    let firstDisabledReason: string | null = null;
    for (const teamId of playerTeamIds) {
      const teamSettings = settingsByTeam.get(teamId) ?? null;
      const teamEnabled = teamSettings?.enabled ?? true;
      if (teamEnabled) {
        allDisabled = false;
        break;
      }
      firstDisabledReason ??= teamSettings?.disabledReason ?? null;
    }

    if (allDisabled) {
      return {
        userEnabled: true,
        teamEnabled: false,
        effectivelyEnabled: false,
        disabledReason: firstDisabledReason ?? 'Disabled by coach',
        disabledBy: 'coach',
      };
    }
  }

  return {
    userEnabled: true,
    teamEnabled: true,
    effectivelyEnabled: true,
    disabledReason: null,
    disabledBy: null,
  };
}
