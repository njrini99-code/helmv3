'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { isExemptReason, isRosterLimitMissing, isRosterMax, rosterLimitTables, type RosterExemptReason } from '@/lib/golf/roster-limit';

/**
 * Launch readiness F-05: the team's roster limit, and marking a player who doesn't count toward it. Rows in
 * golf_team_roster_limits and golf_roster_exemptions, from the held migration 20261115250000. RLS decides who writes (a
 * coach of the team; an exemption's player must be on it). Until the migration is applied the tables aren't there and
 * both saves answer `unavailable`; the Roster says the change waits on the update.
 */

export type RosterLimitResult = { success: true } | { success: false; error: string; code: string; unavailable?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT_CODE = 'CH-3081';
const EXEMPT_CODE = 'CH-3082';
const WAITS = 'Setting the roster limit arrives with the next update.';

const refused = (error: string, dbCode?: string | null, code: string = LIMIT_CODE): RosterLimitResult => ({
  success: false,
  error,
  code,
  unavailable: isRosterLimitMissing(dbCode) || undefined,
});

async function signedIn() {
  const sb = await createClient();
  const { data } = await sb.auth.getUser();
  return { sb, userId: data.user?.id ?? null };
}

async function failed(what: string, error: { code?: string | null; message: string }, coachOnly: string, code: string): Promise<RosterLimitResult> {
  if (isRosterLimitMissing(error.code)) return refused(WAITS, error.code, code);
  if (error.code === '42501') return refused(coachOnly, error.code, code);
  await logServerError(`roster limit: ${what} failed: ${describeError(error)}`, { action: `roster.${what}`, featureArea: 'roster' }, 'warning');
  return refused('Couldn’t save that. Try again.', error.code, code);
}

async function saveRosterLimitImpl(input: { teamId: string; enabled: boolean; max: number }): Promise<RosterLimitResult> {
  if (!UUID.test(input.teamId) || typeof input.enabled !== 'boolean' || !isRosterMax(input.max)) return refused('Pick a limit from 1 to 40.');
  const { sb, userId } = await signedIn();
  if (!userId) return refused('Your session ended. Sign in again to save.');
  const row = { team_id: input.teamId, enabled: input.enabled, max_players: input.max, updated_by: userId, updated_at: new Date().toISOString() };
  const { data, error } = await rosterLimitTables(sb).from('golf_team_roster_limits').upsert(row, { onConflict: 'team_id' }).select('team_id').maybeSingle();
  if (error) return failed('saveLimit', error, 'Only a coach of the team can change its roster limit.', LIMIT_CODE);
  if (!data) return refused('Only a coach of the team can change its roster limit.');
  revalidatePath('/golf/dashboard/roster');
  return { success: true };
}

async function setRosterExemptionImpl(input: {
  teamId: string;
  playerId: string;
  reason: RosterExemptReason | null;
  note?: string | null;
}): Promise<RosterLimitResult> {
  if (!UUID.test(input.teamId) || !UUID.test(input.playerId) || (input.reason !== null && !isExemptReason(input.reason)))
    return refused('Couldn’t save that. Try again.', null, EXEMPT_CODE);
  const note = (input.note ?? '').trim().slice(0, 280) || null;
  const { sb, userId } = await signedIn();
  if (!userId) return refused('Your session ended. Sign in again to save.', null, EXEMPT_CODE);
  const table = rosterLimitTables(sb).from('golf_roster_exemptions');
  const coachOnly = 'Only a coach of the team can mark who counts toward the limit.';
  if (input.reason === null) {
    const { error } = await table.delete().eq('team_id', input.teamId).eq('player_id', input.playerId);
    if (error) return failed('clearExemption', error, coachOnly, EXEMPT_CODE);
  } else {
    const row = { team_id: input.teamId, player_id: input.playerId, reason: input.reason, note, created_by: userId, updated_at: new Date().toISOString() };
    const { data, error } = await table.upsert(row, { onConflict: 'team_id,player_id' }).select('player_id').maybeSingle();
    if (error) return failed('setExemption', error, coachOnly, EXEMPT_CODE);
    if (!data) return refused(coachOnly, null, EXEMPT_CODE);
  }
  revalidatePath('/golf/dashboard/roster');
  return { success: true };
}

const observedLimit = withAdminObserved('saveRosterLimit', { sport: 'golf', feature: 'roster_management' }, saveRosterLimitImpl);
const observedExemption = withAdminObserved('setRosterExemption', { sport: 'golf', feature: 'roster_management' }, setRosterExemptionImpl);

export async function saveRosterLimit(input: { teamId: string; enabled: boolean; max: number }): Promise<RosterLimitResult> {
  return observedLimit(input);
}

export async function setRosterExemption(input: {
  teamId: string;
  playerId: string;
  reason: RosterExemptReason | null;
  note?: string | null;
}): Promise<RosterLimitResult> {
  return observedExemption(input);
}
