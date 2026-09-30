'use server';

/**
 * Qualifier setup edits that had no server action (D-32): the travel-squad
 * size and coach's picks, and who is entered. Both run on the RLS-scoped
 * client and check first that the caller coaches the qualifier's team
 * (`coach_id_for_team`, the same staff check the selection actions use), so
 * RLS is the second gate, never the only one. No service role.
 *
 * What a save can't do, and says so instead:
 *   - change the squad once the coach has confirmed it (selection_state 'selected')
 *   - drop coach's-pick spots below the picks already chosen
 *   - enter a player who isn't on the team's active roster
 *   - take out a player who has a round (any status) in the qualifier, or a
 *     selection row (a top-score place or a coach's pick, confirmed or not)
 *
 * Refusals are expected outcomes, so the wrapper doesn't file them
 * (`observeSoftFailures: false`); real read and write failures are logged
 * here with `logServerError`, and thrown errors still reach the wrapper.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { verifyTeamAccess } from '@/lib/auth/verify-player-access';
import { describeError } from '@/lib/utils/describe-error';
import { isUuid } from '@/lib/utils/uuid';
import { chunkIds } from '@/lib/supabase/chunk-ids';

export type QualifierSetupResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Gate =
  | { ok: true; supabase: Supabase; teamId: string; selectionState: string }
  | { ok: false; error: string };

/** The one squad-size ceiling the database enforces (golf_qualifiers_selection_slots_total_check). */
const SQUAD_MAX = 12;

async function coachOfQualifier(qualifierId: string, action: string): Promise<Gate> {
  if (!isUuid(qualifierId)) return { ok: false, error: 'That qualifier link isn’t valid.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Your session ended. Sign in again, then retry.' };

  const { data: q, error } = await supabase.from('golf_qualifiers').select('id, team_id, selection_state').eq('id', qualifierId).maybeSingle();
  if (error) {
    await logServerError(`${action}: qualifier read failed: ${describeError(error)}`, { action, featureArea: 'qualifiers' }, 'warning');
    return { ok: false, error: 'Couldn’t check this qualifier. Try again.' };
  }
  if (!q) return { ok: false, error: 'That qualifier wasn’t found. It may have been deleted.' };

  const access = await verifyTeamAccess(q.team_id, user.id, supabase);
  if (!access.allowed) {
    return {
      ok: false,
      error: access.reason === 'unavailable' ? 'Couldn’t confirm your access to this team. Try again.' : 'Only a coach of this team can change this qualifier.',
    };
  }
  return { ok: true, supabase, teamId: q.team_id, selectionState: q.selection_state };
}

function revalidate(qualifierId: string) {
  revalidatePath('/golf/dashboard/qualifiers');
  revalidatePath(`/golf/dashboard/qualifiers/${qualifierId}`);
  revalidatePath('/golf/dashboard/my-qualifiers');
}

const squadSchema = z
  .object({
    total: z.number().int().min(1).max(SQUAD_MAX),
    coachPicks: z.number().int().min(0),
  })
  .refine((d) => d.coachPicks <= d.total, { message: 'picks exceed squad' });

async function setQualifierSquadSizeImpl(qualifierId: string, input: { total: number; coachPicks: number }): Promise<QualifierSetupResult> {
  const parsed = squadSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: `Squad size must be 1 to ${SQUAD_MAX}, with no more coach’s picks than places.` };
  const gate = await coachOfQualifier(qualifierId, 'qualifierSetup.squadSize');
  if (!gate.ok) return { success: false, error: gate.error };
  if (gate.selectionState === 'selected') return { success: false, error: 'The squad is already confirmed, so its size can’t change.' };

  const { data: picks, error: picksError } = await gate.supabase
    .from('golf_qualifier_selections')
    .select('player_id')
    .eq('qualifier_id', qualifierId)
    .eq('selection_type', 'coach_pick');
  if (picksError) {
    // Fails closed: without the count, a smaller pick total could orphan a chosen pick.
    await logServerError(`qualifierSetup.squadSize: coach-pick read failed: ${describeError(picksError)}`, { action: 'qualifierSetup.squadSize', featureArea: 'qualifiers' }, 'warning');
    return { success: false, error: 'Couldn’t check the coach’s picks already chosen. Try again.' };
  }
  const chosen = picks?.length ?? 0;
  if (parsed.data.coachPicks < chosen) {
    return { success: false, error: `${chosen} coach’s ${chosen === 1 ? 'pick is' : 'picks are'} already chosen. Keep at least ${chosen} pick ${chosen === 1 ? 'spot' : 'spots'}.` };
  }

  const { data: rows, error } = await gate.supabase
    .from('golf_qualifiers')
    .update({ selection_slots_total: parsed.data.total, selection_slots_coach_pick: parsed.data.coachPicks })
    .eq('id', qualifierId)
    // A confirm that lands between the check above and this write leaves the size alone:
    // every state but 'selected' (golf_qualifiers_selection_state_check).
    .in('selection_state', ['open', 'scoring', 'closed'])
    .select('id');
  if (error) {
    await logServerError(`qualifierSetup.squadSize: update failed: ${describeError(error)}`, { action: 'qualifierSetup.squadSize', featureArea: 'qualifiers' });
    return { success: false, error: 'Couldn’t save the squad size. Try again.' };
  }
  // An update RLS refuses matches no rows and reports no error; never call that saved.
  if (!rows || rows.length !== 1) {
    await logServerError(`qualifierSetup.squadSize matched no row for ${qualifierId}`, { action: 'qualifierSetup.squadSize', featureArea: 'qualifiers' }, 'warning');
    return { success: false, error: 'Couldn’t save the squad size. You may not have edit access to this team.' };
  }
  revalidate(qualifierId);
  return { success: true, data: undefined };
}

const entrantsSchema = z.array(z.string().uuid()).min(1).max(200);

async function setQualifierEntrantsImpl(qualifierId: string, playerIds: string[]): Promise<QualifierSetupResult<{ added: number; removed: number }>> {
  const parsed = entrantsSchema.safeParse(playerIds);
  if (!parsed.success) return { success: false, error: playerIds.length ? 'That player list isn’t valid. Reload and try again.' : 'Choose at least one player.' };
  const want = new Set(parsed.data);
  const gate = await coachOfQualifier(qualifierId, 'qualifierSetup.entrants');
  if (!gate.ok) return { success: false, error: gate.error };
  const sb = gate.supabase;

  const { data: current, error: currentError } = await sb.from('golf_qualifier_entries').select('player_id').eq('qualifier_id', qualifierId);
  if (currentError) {
    await logServerError(`qualifierSetup.entrants: entries read failed: ${describeError(currentError)}`, { action: 'qualifierSetup.entrants', featureArea: 'qualifiers' }, 'warning');
    return { success: false, error: 'Couldn’t read who is entered. Try again.' };
  }
  const have = new Set((current ?? []).map((e) => e.player_id));
  const add = [...want].filter((id) => !have.has(id));
  const remove = [...have].filter((id) => !want.has(id));
  if (!add.length && !remove.length) return { success: true, data: { added: 0, removed: 0 } };

  if (add.length) {
    const { data: members, error } = await sb.from('golf_team_members').select('player_id').eq('team_id', gate.teamId).eq('status', 'active').in('player_id', add);
    if (error) {
      await logServerError(`qualifierSetup.entrants: roster read failed: ${describeError(error)}`, { action: 'qualifierSetup.entrants', featureArea: 'qualifiers' }, 'warning');
      return { success: false, error: 'Couldn’t check the roster. Try again.' };
    }
    const onRoster = new Set((members ?? []).map((m) => m.player_id));
    const missing = add.filter((id) => !onRoster.has(id)).length;
    if (missing) return { success: false, error: `${missing === 1 ? 'One player isn’t' : `${missing} players aren’t`} on the active roster, so nothing changed.` };
  }

  if (remove.length) {
    // Rounds in slices of 20 players: at most 50 rounds each keeps a slice under the 1,000-row read cap.
    const checks = await Promise.all([
      // Any status: a draft or started round would be stranded without its entry.
      ...chunkIds(remove, 20).map((ids) => sb.from('golf_rounds').select('player_id').eq('qualifier_id', qualifierId).in('player_id', ids)),
      ...chunkIds(remove).map((ids) => sb.from('golf_qualifier_selections').select('player_id').eq('qualifier_id', qualifierId).in('player_id', ids)),
    ]);
    const failed = checks.find((r) => r.error);
    if (failed) {
      await logServerError(`qualifierSetup.entrants: removal check failed: ${describeError(failed.error)}`, { action: 'qualifierSetup.entrants', featureArea: 'qualifiers' }, 'warning');
      return { success: false, error: 'Couldn’t check whether those players have rounds. Try again.' };
    }
    const blocked = new Set(checks.flatMap((r) => (r.data ?? []).map((row) => row.player_id))).size;
    if (blocked) {
      return {
        success: false,
        error: `${blocked === 1 ? 'One player has' : `${blocked} players have`} a round or a squad place in this qualifier and can’t be taken out, so nothing changed.`,
      };
    }
  }

  if (add.length) {
    const { data: inserted, error } = await sb
      .from('golf_qualifier_entries')
      .insert(add.map((player_id) => ({ qualifier_id: qualifierId, player_id, status: 'entered' })))
      .select('player_id');
    if (error || (inserted?.length ?? 0) !== add.length) {
      await logServerError(`qualifierSetup.entrants: insert failed: ${describeError(error ?? 'row count mismatch')}`, { action: 'qualifierSetup.entrants', featureArea: 'qualifiers' });
      return { success: false, error: 'Couldn’t enter the new players. Nothing else changed. Try again.' };
    }
  }
  if (remove.length) {
    let removed = 0;
    let error: unknown = null;
    for (const ids of chunkIds(remove)) {
      const res = await sb.from('golf_qualifier_entries').delete().eq('qualifier_id', qualifierId).in('player_id', ids).select('player_id');
      if (res.error) {
        error = res.error;
        break;
      }
      removed += res.data?.length ?? 0;
    }
    if (error || removed !== remove.length) {
      await logServerError(`qualifierSetup.entrants: delete failed: ${describeError(error ?? 'row count mismatch')}`, { action: 'qualifierSetup.entrants', featureArea: 'qualifiers' });
      revalidate(qualifierId);
      return {
        success: false,
        error: removed
          ? `${add.length ? 'The new players were entered, but only' : 'Only'} ${removed} of ${remove.length} players were taken out. Save again to finish.`
          : add.length
            ? 'The new players were entered, but taking players out didn’t save. Save again to finish.'
            : 'Couldn’t take those players out. Try again.',
      };
    }
  }
  revalidate(qualifierId);
  return { success: true, data: { added: add.length, removed: remove.length } };
}

const observedSetQualifierSquadSize = withAdminObserved(
  'setQualifierSquadSize',
  { demoSafe: true, sport: 'golf', feature: 'qualifiers', observeSoftFailures: false },
  setQualifierSquadSizeImpl,
);
const observedSetQualifierEntrants = withAdminObserved(
  'setQualifierEntrants',
  { demoSafe: true, sport: 'golf', feature: 'qualifiers', observeSoftFailures: false },
  setQualifierEntrantsImpl,
);

export async function setQualifierSquadSize(qualifierId: string, input: { total: number; coachPicks: number }): Promise<QualifierSetupResult> {
  return observedSetQualifierSquadSize(qualifierId, input);
}

export async function setQualifierEntrants(qualifierId: string, playerIds: string[]): Promise<QualifierSetupResult<{ added: number; removed: number }>> {
  return observedSetQualifierEntrants(qualifierId, playerIds);
}
