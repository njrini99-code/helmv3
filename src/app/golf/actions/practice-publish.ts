'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { diffVersions, parsePlanBody, validatePlan } from '@/lib/coachhelm/v3/practice-plan/model';
import { isPracticeTabEnabled } from '@/lib/coachhelm/v3/practice-plan/flag';
import { practiceRpc, practiceTables } from '@/lib/golf/practice-db';
import { fanOutPracticePlan, type PracticeNotice } from '@/lib/golf/practice-fanout';
import { isPracticeMissing, practiceErrorOf } from '@/lib/golf/practice-errors';
import type { PracticeResult } from './practice-plans';

const when = (iso: string, zone: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...opts, timeZone: zone }).format(new Date(iso));

interface Recipient {
  user_id: string;
  role?: string;
}

/**
 * `notify: 'defer'` is the Undo path: the fan-out waits for the caller (the 8 second hold) and Undo's take down tells nobody. Republish with only wording changes sends nothing.
 */
async function publishPracticePlanImpl(input: { planId: string; expectedVersion: number; notify: 'now' | 'defer' | 'none' }): Promise<PracticeResult<{ version: number; recipients: number; documentId: string | null; firstPublish: boolean }>> {
  if (!isPracticeTabEnabled()) return { success: false, error: 'Practice plans aren’t on for your team yet.', unavailable: true };
  const sb = await createClient();
  const db = practiceTables(sb);
  const { data: plan, error: readError } = await db.from('golf_practice_plans').select('id, title, body, event_id, version, live_version').eq('id', input.planId).maybeSingle();
  if (readError) return { success: false, error: 'Couldn’t publish the plan.', code: 'CH-17002', unavailable: isPracticeMissing(readError.code) };
  if (!plan) return { success: false, error: 'That plan is gone.', code: 'CH-17002' };
  const body = parsePlanBody(plan.body);
  if (!body) return { success: false, error: 'This plan was saved in a newer form.', code: 'CH-17201' };
  const { data: event } = plan.event_id ? await sb.from('golf_events').select('start_time, end_time, team_id').eq('id', plan.event_id).maybeSingle() : { data: null };
  const { data: team } = event ? await sb.from('golf_teams').select('timezone').eq('id', event.team_id).maybeSingle() : { data: null };
  const zone = team?.timezone ?? 'America/New_York';
  const eventStart = event ? new Date(event.start_time) : new Date();
  const check = validatePlan(body, { eventStart, eventEnd: event?.end_time ? new Date(event.end_time) : undefined, zone });
  if (check.errors.length) return { success: false, error: check.errors.length === 1 ? check.errors[0]!.message : `Fix ${check.errors.length} problems to publish.`, code: check.errors.some((e) => e.code === 'CH-17116') ? 'CH-17116' : 'CH-17115' };

  let changes: ReturnType<typeof diffVersions> | null = null;
  if (plan.live_version != null) {
    const { data: live } = await db.from('golf_practice_plan_versions').select('body').eq('plan_id', plan.id).eq('version', plan.live_version).maybeSingle();
    const prev = parsePlanBody(live?.body);
    if (prev) changes = diffVersions(prev, body, eventStart, zone);
  }
  const notified = input.notify !== 'none' && !changes?.wordingOnly;
  const { data, error } = await practiceRpc(sb, 'golf_practice_plan_publish', { p_plan_id: input.planId, p_expected_version: input.expectedVersion, p_changes: changes?.changes ?? [], p_notified: notified });
  if (error) {
    const m = practiceErrorOf(error.message);
    return { success: false, error: m.token ? m.message : plan.live_version == null ? 'Couldn’t publish the plan. Nothing was sent.' : 'Couldn’t republish.', code: m.token ? m.code : plan.live_version == null ? 'CH-17002' : 'CH-17003', stale: m.token === 'practice_plan_stale', unavailable: isPracticeMissing(error.code) };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { published_version: number; document_id: string | null; first_publish: boolean; recipients: Recipient[] | null } | null;
  if (!row) return { success: false, error: 'Couldn’t publish the plan.', code: 'CH-17002' };
  const recipients = row.recipients ?? [];
  if (input.notify === 'now' && notified && recipients.length) {
    const word = when(event?.start_time ?? new Date().toISOString(), zone, { weekday: 'long' });
    const time = when(event?.start_time ?? new Date().toISOString(), zone, { hour: 'numeric', minute: '2-digit' });
    const notices: PracticeNotice[] = [row.first_publish ? { userIds: recipients.map((r) => r.user_id), title: `Practice plan for ${word}`, body: `${time} · Open the plan to see where you start` } : { userIds: recipients.map((r) => r.user_id), title: `${word}’s plan changed`, body: changes?.changes[0]?.line ?? 'Open the plan to see what changed' }];
    after(() => fanOutPracticePlan(plan.id, row.published_version, row.first_publish ? 'published' : 'updated', notices));
  }
  revalidatePath('/golf/dashboard/documents');
  return { success: true, version: row.published_version, recipients: recipients.length, documentId: row.document_id, firstPublish: row.first_publish };
}

async function takeDownPracticePlanImpl(input: { planId: string; expectedVersion: number; notify: boolean; title?: string; body?: string }): Promise<PracticeResult<object>> {
  const sb = await createClient();
  const { data, error } = await practiceRpc(sb, 'golf_practice_plan_take_down', { p_plan_id: input.planId, p_expected_version: input.expectedVersion });
  if (error) {
    const m = practiceErrorOf(error.message);
    return { success: false, error: m.token ? m.message : 'Couldn’t take the plan down. Players can still see it.', code: 'CH-17004', stale: m.token === 'practice_plan_stale', unavailable: isPracticeMissing(error.code) };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { plan_version: number; recipients: Recipient[] | null } | null;
  // Undo inside the window passes notify false: nobody was told, so nobody hears.
  if (input.notify && row?.recipients?.length) {
    const notices = [{ userIds: row.recipients.map((r) => r.user_id), title: input.title ?? 'A practice plan was taken down', body: input.body ?? 'It’s no longer on your Practice page.' }];
    after(() => fanOutPracticePlan(input.planId, row.plan_version, 'taken_down', notices));
  }
  revalidatePath('/golf/dashboard/documents');
  return { success: true };
}

const feature = { sport: 'golf', feature: 'practice_plans' } as const;
const observedPublish = withAdminObserved('publishPracticePlan', feature, publishPracticePlanImpl);
const observedTakeDown = withAdminObserved('takeDownPracticePlan', feature, takeDownPracticePlanImpl);

export async function publishPracticePlan(input: Parameters<typeof publishPracticePlanImpl>[0]) {
  return observedPublish(input);
}
export async function takeDownPracticePlan(input: Parameters<typeof takeDownPracticePlanImpl>[0]) {
  return observedTakeDown(input);
}
