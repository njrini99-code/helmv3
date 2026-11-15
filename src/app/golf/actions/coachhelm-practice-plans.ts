'use server';

import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { logServerError } from '@/lib/server-error-logger';
import { parsePlanBody, toSaveBody, type PlanDraft } from '@/lib/coachhelm/v3/practice-plan/model';
import { practiceRpc, practiceTables } from '@/lib/golf/practice-db';
import { isPracticeMissing, practiceErrorOf } from '@/lib/golf/practice-errors';
import { resolveCoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import { sendMessage } from '@/app/actions/messages';
import { getAppBaseUrl } from '@/lib/app-base-url';

const cleanFolder = (f: string): string | null => {
  const t = f.trim();
  return t && t.length <= 60 && t.toLowerCase() !== 'team' ? t : null;
};

type SaveResult = { success: true; planId: string; version: number; documentId: string | null; folder: string; created: boolean; savedAt: string } | { success: false; error: string; unavailable?: boolean; needsEvent?: boolean };

/** Save draft: the coach's press. `version` is the plan's stored version, and null for a plan not saved yet, which is what N-00's save asks of a first save. The body goes to N-00's save; Why lines go to the coach-only column, never the body. Not on the hold: it writes at once and Undo removes it. */
async function savePracticePlanDraftImpl(input: { eventId: string | null; planId: string | null; version: number | null; title: string; draft: PlanDraft; folder: string; step?: 'blocks' | 'groups' | 'drills' | 'review' }): Promise<SaveResult> {

  const folder = cleanFolder(input.folder);
  if (!folder) return { success: false, error: 'A folder name is 1 to 60 characters and can’t be Team.' };
  if (!input.planId && !input.eventId) return { success: false, error: 'Add a practice to the calendar first.', needsEvent: true };
  const body = parsePlanBody(input.draft.body);
  if (!body) return { success: false, error: 'That plan couldn’t be saved.' };
  const sb = await createClient();
  const saved = await practiceRpc(sb, 'golf_practice_plan_save', { p_event_id: input.planId ? null : input.eventId, p_plan_id: input.planId, p_expected_version: input.version, p_title: input.title, p_step: input.step ?? 'review', p_body: toSaveBody(body) });
  if (saved.error) {
    const m = practiceErrorOf(saved.error.message);
    await logServerError(`savePracticePlanDraft: ${saved.error.message}`, { action: 'coachhelm.plan.save' }, 'warning');
    return { success: false, error: isPracticeMissing(saved.error.code) ? 'Comes with the Practice tab.' : m.message, unavailable: isPracticeMissing(saved.error.code) };
  }
  const row = (Array.isArray(saved.data) ? saved.data[0] : saved.data) as { plan_id: string; plan_version: number } | null;
  if (!row) return { success: false, error: 'That plan couldn’t be saved.' };
  const filed = await practiceRpc(sb, 'golf_practice_plan_file_draft', { p_plan_id: row.plan_id, p_version: row.plan_version, p_folder: folder, p_why: input.draft.why });
  if (filed.error) {
    // The save stands only if it can be seen: a plan not filed is taken back, so "Nothing was saved" stays true.
    if (!input.planId) await practiceTables(sb).from('golf_practice_plans').delete().eq('id', row.plan_id);
    return { success: false, error: isPracticeMissing(filed.error.code) ? 'Comes with the Practice tab.' : practiceErrorOf(filed.error.message).message, unavailable: isPracticeMissing(filed.error.code) };
  }
  const doc = (Array.isArray(filed.data) ? filed.data[0] : filed.data) as { document_id?: string } | null;
  return { success: true, planId: row.plan_id, version: row.plan_version, documentId: doc?.document_id ?? null, folder, created: !input.planId, savedAt: new Date().toISOString() };
}

/** Undo: within 10s of the save, allowing for skew, and only a plan this save created. */
async function undoPracticePlanDraftImpl(input: { planId: string; created: boolean; savedAt: string }): Promise<{ success: boolean; error?: string }> {
  if (Date.now() - Date.parse(input.savedAt) > 10_000) return { success: false, error: 'Too late to undo. Open it to change it.' };
  if (!input.created) return { success: false, error: 'That plan was already saved. Open it to change it.' };
  const sb = await createClient();
  const { error } = await practiceTables(sb).from('golf_practice_plans').delete().eq('id', input.planId);
  return error ? { success: false, error: 'That wasn’t undone.' } : { success: true };
}

/** Folder names with counts, last used first; drafts included for a coach. */
async function listPlanFoldersImpl(): Promise<{ folders: Array<{ name: string; count: number }> }> {
  const sb = await createClient();
  const ctx = await resolveCoachChatContext(sb).catch(() => null);
  if (!ctx) return { folders: [] };
  const { data, error } = await sb.from('golf_documents').select('folder, updated_at').eq('team_id', ctx.team_id).not('folder', 'is', null).order('updated_at', { ascending: false }).limit(500);
  if (error) return { folders: [] };
  const counts = new Map<string, number>();
  for (const d of data ?? []) {
    const name = d.folder?.trim();
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return { folders: [...counts].map(([name, count]) => ({ name, count })) };
}

const obsSave = withAdminObserved('savePracticePlanDraft', { sport: 'golf', feature: 'practice_plans' }, savePracticePlanDraftImpl);
const obsUndo = withAdminObserved('undoPracticePlanDraft', { sport: 'golf', feature: 'practice_plans' }, undoPracticePlanDraftImpl);
const obsList = withAdminObserved('listPlanFolders', { sport: 'golf', feature: 'practice_plans' }, listPlanFoldersImpl);

export async function savePracticePlanDraft(input: Parameters<typeof savePracticePlanDraftImpl>[0]) {
  return obsSave(input);
}
export async function undoPracticePlanDraft(input: Parameters<typeof undoPracticePlanDraftImpl>[0]) {
  return obsUndo(input);
}
export async function listPlanFolders() {
  return obsList();
}

/** Share › Send to team chat: one text post with the plan's link, no second push. */
async function postPracticePlanToChatImpl(input: { planId: string }): Promise<{ success: boolean; error?: string }> {
  const sb = await createClient();
  const ctx = await resolveCoachChatContext(sb).catch(() => null);
  if (!ctx) return { success: false, error: 'Unauthorized' };
  const { data: plan, error: planError } = await practiceTables(sb).from('golf_practice_plans').select('title').eq('id', input.planId).eq('team_id', ctx.team_id).maybeSingle();
  if (planError || !plan) return { success: false, error: 'That plan is gone.' };
  const { data: channel, error } = await sb.from('golf_conversations').select('id').eq('team_id', ctx.team_id).eq('is_team_channel', true).limit(1).maybeSingle();
  if (error || !channel?.id) return { success: false, error: 'Your team has no team chat yet.' };
  const sent = await sendMessage({ conversationId: channel.id, content: `${(plan as { title: string }).title} ${getAppBaseUrl()}/golf/dashboard/practice/plan/${input.planId}`, sport: 'golf', createNotifications: false });
  return sent.success ? { success: true } : { success: false, error: 'Couldn’t post to team chat.' };
}
const observedPostChat = withAdminObserved('postPracticePlanToChat', { sport: 'golf', feature: 'practice_plans' }, postPracticePlanToChatImpl);
export async function postPracticePlanToChat(input: { planId: string }) {
  return observedPostChat(input);
}
