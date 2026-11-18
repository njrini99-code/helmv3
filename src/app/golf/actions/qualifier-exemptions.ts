'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { isQualifierRulesMissing, qualifierRulesTable } from '@/lib/golf/qualifier-rules';
import { EXEMPTION_REASON_MAX, type QualifierExemption } from '@/lib/golf/qualifier-exemptions';

/**
 * Launch readiness F-06: save who is exempt from a qualifier (owner, 16 Nov 2026: "Exempt before, from coach picks").
 * The list replaces the stored one. Only before the qualifier starts (status `upcoming`), never more than its coach's
 * picks, each an entrant with a reason. RLS decides who writes (a coach of the team; the player must be an entrant);
 * until migration 20261116100000 is applied the save answers `unavailable` and the form says exempting waits on it.
 */

export type QualifierExemptionsResult = { success: true } | { success: false; error: string; code: string; unavailable?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The edit save's code, as the rules save uses (CH-09002: the form's notice tells the reason).
const CODE = 'CH-09002';
const refused = (error: string, dbCode?: string | null): QualifierExemptionsResult => ({
  success: false,
  error,
  code: CODE,
  unavailable: isQualifierRulesMissing(dbCode) || undefined,
});
const log = (what: string, e: unknown) =>
  logServerError(`qualifier exemptions: ${what}: ${describeError(e)}`, { action: 'qualifiers.saveExemptions', featureArea: 'qualifiers' }, 'warning');

async function saveQualifierExemptionsImpl(input: { qualifierId: string; exemptions: QualifierExemption[] }): Promise<QualifierExemptionsResult> {
  const list = Array.isArray(input.exemptions) ? input.exemptions : null;
  if (!UUID.test(input.qualifierId) || !list) return refused('Couldn’t save the exemptions.');
  const clean = list.map((e) => ({ playerId: String(e?.playerId ?? ''), reason: String(e?.reason ?? '').trim() }));
  if (clean.some((e) => !UUID.test(e.playerId)) || new Set(clean.map((e) => e.playerId)).size !== clean.length) return refused('Couldn’t save the exemptions.');
  if (clean.some((e) => !e.reason)) return refused('Give each exempt player a reason.');
  if (clean.some((e) => e.reason.length > EXEMPTION_REASON_MAX)) return refused(`Keep each reason to ${EXEMPTION_REASON_MAX} characters.`);

  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id ?? null;
  if (!userId) return refused('Your session ended. Sign in again to save.');
  const q = await sb.from('golf_qualifiers').select('id, team_id, status, selection_slots_coach_pick').eq('id', input.qualifierId).maybeSingle();
  if (q.error) {
    await log('qualifier read failed', q.error);
    return refused('Couldn’t save the exemptions.');
  }
  if (!q.data) return refused('That qualifier wasn’t found on your team.');
  const db = qualifierRulesTable(sb);
  const stored = await db.from('golf_qualifier_exemptions').select('player_id, reason').eq('qualifier_id', q.data.id);
  if (stored.error) {
    if (isQualifierRulesMissing(stored.error.code)) return refused('Exempting a player arrives with the next update.', stored.error.code);
    await log('read failed', stored.error);
    return refused('Couldn’t save the exemptions.');
  }
  const before = new Map(((stored.data ?? []) as Array<{ player_id: string; reason: string }>).map((r) => [r.player_id, r.reason]));
  const unchanged = before.size === clean.length && clean.every((e) => before.get(e.playerId) === e.reason);
  if (unchanged) return { success: true };
  // Exempt BEFORE the qualifier: once it starts, the coach gives a place with a pick instead.
  if (q.data.status !== 'upcoming') return refused('Exemptions are set before the qualifier starts. Use a coach’s pick now.');
  const slots = q.data.selection_slots_coach_pick ?? 0;
  if (clean.length > slots) {
    return refused(
      slots === 0
        ? 'This qualifier has no coach’s picks, so nobody can be exempt. Add a pick to the squad first.'
        : `An exempt player takes a coach’s pick, and this qualifier has ${slots}.`,
    );
  }

  const keep = clean.map((e) => e.playerId);
  let del = db.from('golf_qualifier_exemptions').delete().eq('qualifier_id', q.data.id);
  if (keep.length) del = del.not('player_id', 'in', `(${keep.join(',')})`);
  const removed = await del;
  if (removed.error) {
    await log('delete failed', removed.error);
    return refused('Couldn’t save the exemptions.', removed.error.code);
  }
  if (clean.length) {
    const rows = clean.map((e) => ({ qualifier_id: q.data!.id, team_id: q.data!.team_id, player_id: e.playerId, reason: e.reason, created_by: userId }));
    const { data, error } = await db.from('golf_qualifier_exemptions').upsert(rows, { onConflict: 'qualifier_id,player_id' }).select('player_id');
    if (error || (data ?? []).length !== rows.length) {
      if (error && error.code !== '42501') await log('save failed', error);
      // A policy refusal: not a coach of this team, or a player who isn't entered.
      return refused(
        error && error.code !== '42501' ? 'Couldn’t save the exemptions.' : 'Only a coach of the team can exempt a player, and only one who is entered.',
        error?.code,
      );
    }
  }
  revalidatePath('/golf/dashboard/qualifiers');
  revalidatePath(`/golf/dashboard/qualifiers/${q.data.id}`);
  return { success: true };
}

const observed = withAdminObserved('saveQualifierExemptions', { sport: 'golf', feature: 'qualifiers' }, saveQualifierExemptionsImpl);

export async function saveQualifierExemptions(input: { qualifierId: string; exemptions: QualifierExemption[] }): Promise<QualifierExemptionsResult> {
  return observed(input);
}
