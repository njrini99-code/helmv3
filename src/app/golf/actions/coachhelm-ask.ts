'use server';

import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { askTables } from '@/lib/coachhelm/v3/chat/ask-db';
import { logServerError } from '@/lib/server-error-logger';
import { isAskV2Enabled } from '@/lib/coachhelm/v3/chat/ask-flag';
import { resolveCoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import { quickChatWeekBounds, quickChatWeekDays, quickChatWeekOf, type QuickChatWeek } from '@/lib/coachhelm/v3/chat/quick-chat-week';
import { loadTeamZone } from '@/clubhouse/data/season';

const FACT_MAX = 280;

async function coach() {
  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await sb.from('golf_coaches').select('id').eq('user_id', auth.user.id).maybeSingle();
  return data && !error ? { sb, id: data.id } : null;
}

/** The coach's own words only: no chat turn ever calls this, so nothing inferred is saved (AK8). */
async function saveCoachFactImpl(input: { teamId: string; text: string; id?: string }): Promise<{ success: boolean; error?: string; id?: string }> {
  const text = input.text.trim();
  if (!isAskV2Enabled() || !text || text.length > FACT_MAX) return { success: false, error: 'A fact is 1 to 280 characters.' };
  const who = await coach();
  if (!who) return { success: false, error: 'Unauthorized' };
  const q = input.id ? askTables(who.sb).from('golf_coachhelm_coach_facts').update({ text } as never).eq('id', input.id).eq('coach_id', who.id) : askTables(who.sb).from('golf_coachhelm_coach_facts').insert({ coach_id: who.id, team_id: input.teamId, text } as never);
  const { data, error } = await q.select('id').maybeSingle();
  if (error) {
    await logServerError(`saveCoachFact failed: ${error.message}`, { action: 'coachhelm.ask.saveFact' });
    return { success: false, error: 'That wasn’t saved. Try again.' };
  }
  return { success: true, id: (data as { id?: string } | null)?.id };
}

async function deleteCoachFactImpl(id: string): Promise<{ success: boolean; error?: string }> {
  const who = await coach();
  if (!who || !isAskV2Enabled()) return { success: false, error: 'Unauthorized' };
  const { error } = await askTables(who.sb).from('golf_coachhelm_coach_facts').delete().eq('id', id).eq('coach_id', who.id);
  return error ? { success: false, error: 'That wasn’t removed. Try again.' } : { success: true };
}

async function setChatToneImpl(conversationId: string, tone: 'straight' | 'detailed' | 'team_talk'): Promise<{ success: boolean; error?: string }> {
  const who = await coach();
  if (!who || !isAskV2Enabled()) return { success: false, error: 'Unauthorized' };
  const { error } = await askTables(who.sb).from('golf_coachhelm_chat_conversations').update({ tone } as never).eq('id', conversationId).eq('coach_id', who.id);
  return error ? { success: false, error: 'The tone wasn’t saved.' } : { success: true };
}

export type { QuickChatWeek } from '@/lib/coachhelm/v3/chat/quick-chat-week';

/** The week around a draft event and that day's blocks, for the quick chat's card. RLS holds it to the coach's team. */
async function readQuickChatWeekImpl(date: string): Promise<QuickChatWeek | null> {
  const who = await coach();
  if (!who || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ctx = await resolveCoachChatContext(who.sb).catch(() => null);
  if (!ctx) return null;
  const teamId = ctx.team_id;
  // The team's calendar, as Calendar and Home read it; a failed read falls back to the product's default zone, never UTC (`loadTeamZone`).
  const tz = await loadTeamZone(who.sb, teamId, 'quick-chat');
  const { from, to } = quickChatWeekBounds(quickChatWeekDays(date));
  const { data, error } = await who.sb.from('golf_events').select('title, start_time, end_time').eq('team_id', teamId).gte('start_time', from).lte('start_time', to).order('start_time');
  if (error) return null;
  return quickChatWeekOf(date, data ?? [], tz);
}

const observedSaveCoachFact = withAdminObserved('saveCoachFact', { sport: 'golf', feature: 'coachhelm_ai_engine' }, saveCoachFactImpl);
const observedDeleteCoachFact = withAdminObserved('deleteCoachFact', { sport: 'golf', feature: 'coachhelm_ai_engine' }, deleteCoachFactImpl);
const observedSetChatTone = withAdminObserved('setChatTone', { sport: 'golf', feature: 'coachhelm_ai_engine' }, setChatToneImpl);
const observedReadQuickChatWeek = withAdminObserved('readQuickChatWeek', { sport: 'golf', feature: 'coachhelm_ai_engine' }, readQuickChatWeekImpl);

export async function saveCoachFact(input: { teamId: string; text: string; id?: string }): Promise<{ success: boolean; error?: string; id?: string }> {
  return observedSaveCoachFact(input);
}

export async function deleteCoachFact(id: string): Promise<{ success: boolean; error?: string }> {
  return observedDeleteCoachFact(id);
}

export async function setChatTone(conversationId: string, tone: 'straight' | 'detailed' | 'team_talk'): Promise<{ success: boolean; error?: string }> {
  return observedSetChatTone(conversationId, tone);
}

export async function readQuickChatWeek(date: string): Promise<QuickChatWeek | null> {
  return observedReadQuickChatWeek(date);
}
