import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { fromUntyped } from '@/lib/supabase/untyped';
import type { ActionReceipt } from './action-types';
import { sealConfirmedParts } from './seal-confirm';

type Sb = SupabaseClient<Database>;

/**
 * Write the confirm onto the stored assistant message so a reload shows the receipt
 * and the next question does not resend a still-pending tool call.
 * A failure here does not undo the write: the ledger already holds it.
 */
export async function persistSealedConfirm(sb: Sb, args: { coach_id: string; idempotency_key: string; receipt: ActionReceipt }): Promise<void> {
  try {
    const { data: run, error } = await fromUntyped(sb, 'golf_coachhelm_action_runs')
      .select('message_id, conversation_id')
      .eq('coach_id', args.coach_id)
      .eq('idempotency_key', args.idempotency_key)
      .maybeSingle();
    if (error || !run) return;
    const row = run as { message_id?: string | null; conversation_id?: string | null };
    const messageId = row.message_id || await messageCarrying(sb, row.conversation_id ?? null, args.idempotency_key);
    if (!messageId) return;
    const { data: message, error: readErr } = await fromUntyped(sb, 'golf_coachhelm_chat_messages').select('ui_parts').eq('id', messageId).maybeSingle();
    if (readErr || !message) return;
    const parts = (message as { ui_parts?: unknown }).ui_parts;
    if (!Array.isArray(parts)) return;
    await fromUntyped(sb, 'golf_coachhelm_chat_messages')
      .update({ ui_parts: sealConfirmedParts(parts, args.idempotency_key, args.receipt) as never })
      .eq('id', messageId);
  } catch {
    // The meeting is already held. The card still has the receipt from this response.
  }
}

async function messageCarrying(sb: Sb, conversationId: string | null, key: string): Promise<string | null> {
  if (!conversationId) return null;
  const { data, error } = await fromUntyped(sb, 'golf_coachhelm_chat_messages')
    .select('id, ui_parts')
    .eq('conversation_id', conversationId)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(8);
  if (error || !Array.isArray(data)) return null;
  for (const message of data as Array<{ id?: string; ui_parts?: unknown }>) {
    if (typeof message.id === 'string' && JSON.stringify(message.ui_parts ?? '').includes(key)) return message.id;
  }
  return null;
}
