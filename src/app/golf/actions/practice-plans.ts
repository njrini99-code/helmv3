'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { parsePlanBody, validatePlan, type PlanBodyV2 } from '@/lib/coachhelm/v3/practice-plan/model';
import { isPracticeTabEnabled } from '@/lib/coachhelm/v3/practice-plan/flag';
import { practiceRpc, practiceTables } from '@/lib/golf/practice-db';
import { isPracticeMissing, practiceErrorOf } from '@/lib/golf/practice-errors';

export type PracticeResult<T> = ({ success: true } & T) | { success: false; error: string; code?: string; stale?: boolean; unavailable?: boolean };

const fail = (error: { code?: string; message: string }): { success: false; error: string; code: string; stale: boolean; unavailable: boolean } => {
  const mapped = practiceErrorOf(error.message);
  return { success: false, error: mapped.message, code: mapped.code, stale: mapped.token === 'practice_plan_stale', unavailable: isPracticeMissing(error.code) };
};

async function savePracticePlanImpl(input: { eventId?: string | null; planId?: string | null; expectedVersion: number | null; title?: string | null; step?: string; body: PlanBodyV2 }): Promise<PracticeResult<{ planId: string; version: number; updatedAt: string | null }>> {
  if (!isPracticeTabEnabled()) return { success: false, error: 'Practice plans aren’t on for your team yet.', unavailable: true };
  const parsed = parsePlanBody(input.body);
  if (!parsed) return { success: false, error: 'That plan couldn’t be saved.', code: 'CH-17001' };
  const limit = validatePlan(parsed).errors.find((e) => e.code === 'CH-17109');
  if (limit) return { success: false, error: limit.message, code: limit.code };
  const sb = await createClient();
  const { data, error } = await practiceRpc(sb, 'golf_practice_plan_save', { p_event_id: input.eventId ?? null, p_plan_id: input.planId ?? null, p_expected_version: input.expectedVersion, p_title: input.title ?? null, p_step: input.step ?? 'blocks', p_body: parsed });
  if (error) {
    await logServerError(`savePracticePlan: ${error.message}`, { action: 'practice.save', errorCode: 'CH-17001' }, 'warning');
    return fail(error);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { plan_id: string; plan_version: number; updated_at?: string } | null;
  if (!row) return { success: false, error: 'That plan couldn’t be saved.', code: 'CH-17001' };
  return { success: true, planId: row.plan_id, version: row.plan_version, updatedAt: row.updated_at ?? null };
}

async function deletePracticePlanImpl(input: { planId: string }): Promise<PracticeResult<object>> {
  const sb = await createClient();
  const { error } = await practiceTables(sb).from('golf_practice_plans').delete().eq('id', input.planId);
  if (error) return { success: false, error: 'Couldn’t delete the plan.', code: 'CH-17008', unavailable: isPracticeMissing(error.code) };
  revalidatePath('/golf/dashboard/documents');
  return { success: true };
}

/** Called once per page view by the player page, after paint; never awaited by the render. */
async function recordPracticePlanOpenImpl(input: { planId: string }): Promise<void> {
  const sb = await createClient();
  await practiceRpc(sb, 'golf_practice_plan_record_open', { p_plan_id: input.planId });
}

/** New plan's Copy a past practice: a plan the coach can read, for the sheet to copy. RLS answers coaches of its team only. Saves nothing. */
async function copyPlanBodyImpl(input: { planId: string }): Promise<PracticeResult<{ body: PlanBodyV2 }>> {
  if (!isPracticeTabEnabled()) return { success: false, error: 'Practice plans aren’t on for your team yet.', unavailable: true };
  const sb = await createClient();
  const { data, error } = await practiceTables(sb).from('golf_practice_plans').select('body').eq('id', input.planId).maybeSingle();
  if (error) return { success: false, error: 'That plan couldn’t be copied.', unavailable: isPracticeMissing(error.code) };
  const body = parsePlanBody((data as { body?: unknown } | null)?.body);
  return body ? { success: true, body } : { success: false, error: 'That plan couldn’t be copied.' };
}

const observedSave = withAdminObserved('savePracticePlan', { sport: 'golf', feature: 'practice_plans' }, savePracticePlanImpl);
const observedDelete = withAdminObserved('deletePracticePlan', { sport: 'golf', feature: 'practice_plans' }, deletePracticePlanImpl);
const observedOpen = withAdminObserved('recordPracticePlanOpen', { sport: 'golf', feature: 'practice_plans' }, recordPracticePlanOpenImpl);

const observedCopy = withAdminObserved('copyPlanBody', { sport: 'golf', feature: 'practice_plans' }, copyPlanBodyImpl);
export async function copyPlanBody(input: { planId: string }) {
  return observedCopy(input);
}
export async function savePracticePlan(input: Parameters<typeof savePracticePlanImpl>[0]) {
  return observedSave(input);
}
export async function deletePracticePlan(input: { planId: string }) {
  return observedDelete(input);
}
export async function recordPracticePlanOpen(input: { planId: string }) {
  return observedOpen(input);
}
