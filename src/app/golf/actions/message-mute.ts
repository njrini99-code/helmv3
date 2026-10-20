'use server';

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { withAdminObserved } from '@/lib/admin/observed-action';

/**
 * Per-conversation mute for the signed-in participant. Writes the caller's own
 * golf_conversation_participants row only (RLS `golf_participants_update`:
 * user_id = auth.uid()). `notifyGolfMessageRecipients` honours it: a muted
 * participant gets no email, push or bell for that conversation.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getGolfConversationMuteImpl(
  conversationId: string,
): Promise<{ success: true; data: { muted: boolean; until: string | null } } | { success: false; error: string }> {
  if (typeof conversationId !== 'string' || !UUID.test(conversationId)) return { success: false, error: 'Invalid conversation' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };
  const { data, error } = await supabase
    .from('golf_conversation_participants')
    .select('notification_level, muted_until')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    await logServerError(`[getGolfConversationMute] read failed: ${describeError(error)}`, { action: 'golf.getGolfConversationMute', featureArea: 'messaging' });
    return { success: false, error: 'Could not read the mute setting' };
  }
  if (!data) return { success: false, error: 'You are not in this conversation' };
  const until = data.muted_until;
  const muted = data.notification_level === 'muted' && (!until || Date.parse(until) > Date.now());
  return { success: true, data: { muted, until: muted ? until : null } };
}

/** `hours` null mutes until turned off; a number mutes for that long; `muted: false` unmutes. */
async function setGolfConversationMuteImpl(
  conversationId: string,
  muted: boolean,
  hours: number | null = null,
): Promise<{ success: true; data: { muted: boolean; until: string | null } } | { success: false; error: string }> {
  if (typeof conversationId !== 'string' || !UUID.test(conversationId)) return { success: false, error: 'Invalid conversation' };
  if (hours !== null && (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0 || hours > 24 * 365)) {
    return { success: false, error: 'Invalid mute length' };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };
  const until = muted && hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null;
  const { data, error } = await supabase
    .from('golf_conversation_participants')
    .update({ notification_level: muted ? 'muted' : 'all', muted_until: until })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .select('id');
  if (error) {
    await logServerError(`[setGolfConversationMute] update failed: ${describeError(error)}`, { action: 'golf.setGolfConversationMute', featureArea: 'messaging' });
    return { success: false, error: 'Could not change the mute setting' };
  }
  if (!data || data.length === 0) return { success: false, error: 'You are not in this conversation' };
  return { success: true, data: { muted, until } };
}

type MuteResult = { success: true; data: { muted: boolean; until: string | null } } | { success: false; error: string };

const observedGetGolfConversationMute = withAdminObserved('getGolfConversationMute', { sport: 'golf', feature: 'messaging' }, getGolfConversationMuteImpl);
const observedSetGolfConversationMute = withAdminObserved('setGolfConversationMute', { sport: 'golf', feature: 'messaging' }, setGolfConversationMuteImpl);

export async function getGolfConversationMute(conversationId: string): Promise<MuteResult> {
  return observedGetGolfConversationMute(conversationId);
}

export async function setGolfConversationMute(conversationId: string, muted: boolean, hours: number | null = null): Promise<MuteResult> {
  return observedSetGolfConversationMute(conversationId, muted, hours);
}
