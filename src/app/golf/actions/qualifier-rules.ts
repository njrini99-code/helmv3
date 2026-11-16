'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { isCountBest, isQualifierRulesMissing, isTieRule, qualifierRulesTable, type QualifierRules } from '@/lib/golf/qualifier-rules';

/**
 * Launch readiness F-04: save a qualifier's standings rules (its tie rule). One row a qualifier in golf_qualifier_rules,
 * from the held migration 20261115240000. RLS decides who writes (a coach of the qualifier's team); the qualifier is read
 * through RLS first for its team, so another team's qualifier is "not found". Until the migration is applied the table
 * isn't there and the save answers `unavailable`; the form says choosing a rule waits on the update.
 */

export type QualifierRulesResult = { success: true } | { success: false; error: string; code: string; unavailable?: boolean };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = 'CH-09002';

const refused = (error: string, dbCode?: string | null): QualifierRulesResult => ({
  success: false,
  error,
  code: CODE,
  unavailable: isQualifierRulesMissing(dbCode) || undefined,
});

/** The rules to save. `countBest` left out keeps what is stored (F-04 callers); null counts every round (F-06). */
export type QualifierRulesInput = Pick<QualifierRules, 'tieRule'> & Partial<Pick<QualifierRules, 'countBest'>>;

async function saveQualifierRulesImpl(input: { qualifierId: string; rules: QualifierRulesInput }): Promise<QualifierRulesResult> {
  if (!UUID.test(input.qualifierId) || !isTieRule(input.rules?.tieRule)) return refused('Couldn’t save the tie rule.');
  const best = input.rules.countBest;
  if (best !== undefined && best !== null && !isCountBest(best)) return refused('Couldn’t save the rounds that count.');
  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  const userId = auth.user?.id ?? null;
  if (!userId) return refused('Your session ended. Sign in again to save.');
  const q = await sb.from('golf_qualifiers').select('id, team_id').eq('id', input.qualifierId).maybeSingle();
  if (q.error) {
    await logServerError(
      `qualifier rules: qualifier read failed: ${describeError(q.error)}`,
      { action: 'qualifiers.saveRules', featureArea: 'qualifiers' },
      'warning',
    );
    return refused('Couldn’t save the tie rule.');
  }
  if (!q.data) return refused('That qualifier wasn’t found on your team.');
  const row = {
    qualifier_id: q.data.id,
    team_id: q.data.team_id,
    tie_rule: input.rules.tieRule,
    ...(best !== undefined ? { count_best: best } : {}),
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await qualifierRulesTable(sb)
    .from('golf_qualifier_rules')
    .upsert(row, { onConflict: 'qualifier_id' })
    .select('qualifier_id')
    .maybeSingle();
  if (error || !data) {
    if (error && !isQualifierRulesMissing(error.code))
      await logServerError(`qualifier rules: save failed: ${describeError(error)}`, { action: 'qualifiers.saveRules', featureArea: 'qualifiers' }, 'warning');
    if (error && isQualifierRulesMissing(error.code)) return refused('Choosing a tie rule arrives with the next update.', error.code);
    // No row and no error, or a policy refusal: RLS kept it (not a coach of this team).
    return refused(error && error.code !== '42501' ? 'Couldn’t save the tie rule.' : 'Only a coach of the team can change its tie rule.', error?.code);
  }
  revalidatePath('/golf/dashboard/qualifiers');
  revalidatePath(`/golf/dashboard/qualifiers/${q.data.id}`);
  return { success: true };
}

const observed = withAdminObserved('saveQualifierRules', { sport: 'golf', feature: 'qualifiers' }, saveQualifierRulesImpl);

export async function saveQualifierRules(input: { qualifierId: string; rules: QualifierRulesInput }): Promise<QualifierRulesResult> {
  return observed(input);
}
