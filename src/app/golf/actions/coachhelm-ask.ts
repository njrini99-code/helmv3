'use server';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { isAskV2Enabled } from '@/lib/coachhelm/v3/chat/ask-flag';

const FACT_MAX = 280;

async function coach() {
  const sb = await createClient();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return null;
  const { data } = await sb.from('golf_coaches').select('id').eq('user_id', auth.user.id).maybeSingle();
  return data ? { sb, id: data.id } : null;
}

/** The coach's own words only: no chat turn ever calls this, so nothing inferred is saved (AK8). */
export async function saveCoachFact(input: { teamId: string; text: string; id?: string }): Promise<{ success: boolean; error?: string; id?: string }> {
  const text = input.text.trim();
  if (!isAskV2Enabled() || !text || text.length > FACT_MAX) return { success: false, error: 'A fact is 1 to 280 characters.' };
  const who = await coach();
  if (!who) return { success: false, error: 'Unauthorized' };
  const q = input.id ? fromUntyped(who.sb, 'golf_coachhelm_coach_facts').update({ text } as never).eq('id', input.id).eq('coach_id', who.id) : fromUntyped(who.sb, 'golf_coachhelm_coach_facts').insert({ coach_id: who.id, team_id: input.teamId, text } as never);
  const { data, error } = await q.select('id').maybeSingle();
  if (error) {
    await logServerError(`saveCoachFact failed: ${error.message}`, { action: 'coachhelm.ask.saveFact' });
    return { success: false, error: 'That wasn’t saved. Try again.' };
  }
  return { success: true, id: (data as { id?: string } | null)?.id };
}

export async function deleteCoachFact(id: string): Promise<{ success: boolean; error?: string }> {
  const who = await coach();
  if (!who || !isAskV2Enabled()) return { success: false, error: 'Unauthorized' };
  const { error } = await fromUntyped(who.sb, 'golf_coachhelm_coach_facts').delete().eq('id', id).eq('coach_id', who.id);
  return error ? { success: false, error: 'That wasn’t removed. Try again.' } : { success: true };
}

export async function setChatTone(conversationId: string, tone: 'straight' | 'detailed' | 'team_talk'): Promise<{ success: boolean; error?: string }> {
  const who = await coach();
  if (!who || !isAskV2Enabled()) return { success: false, error: 'Unauthorized' };
  const { error } = await fromUntyped(who.sb, 'golf_coachhelm_chat_conversations').update({ tone } as never).eq('id', conversationId).eq('coach_id', who.id);
  return error ? { success: false, error: 'The tone wasn’t saved.' } : { success: true };
}
