'use server';

import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromUntyped } from '@/lib/supabase/untyped';
import { logServerError } from '@/lib/server-error-logger';
import { isCustomerEmailEnabled } from '@/lib/email/outbound-gate';
import { sendOpsAlert } from '@/lib/admin/digest/transport';
import { isPlayerAskEnabled } from '@/lib/coachhelm/v3/chat/ask-flag';
import { weekStart } from '@/lib/coachhelm/v3/chat/player-allowance';
import { resolvePlayerChatContext } from '@/lib/coachhelm/v3/chat/player-context';

const UNDO_MS = 8_000;

/**
 * Request more: the player's one write. The row is the 8 second hold (HM4): Undo deletes it before `release_at`, and the release alone sends. It follows HELM_CUSTOMER_EMAIL_ENABLED: off means logged, no email (DECISIONS).
 */
export async function requestAskCredits(note?: string): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!isPlayerAskEnabled()) return { success: false, error: 'Ask is off.' };
  const sb = await createClient();
  const ctx = await resolvePlayerChatContext(sb).catch(() => null);
  if (!ctx) return { success: false, error: 'Unauthorized' };
  const admin = createAdminClient();
  const { data, error } = await fromUntyped(admin, 'ask_credit_requests')
    .insert({ player_id: ctx.player_id, team_id: ctx.team_id, week_start: weekStart(new Date(), ctx.timezone), note: note?.trim().slice(0, 280) || null, release_at: new Date(Date.now() + UNDO_MS).toISOString() } as never)
    .select('id')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') return { success: false, error: 'You already asked this week.' };
    await logServerError(`requestAskCredits failed: ${error.message}`, { action: 'coachhelm.ask.requestCredits' });
    return { success: false, error: 'That didn’t go in. Try again.' };
  }
  const id = (data as { id: string } | null)?.id;
  if (id) after(() => releaseRequest(id, ctx.team_name));
  return { success: true, id };
}

async function releaseRequest(id: string, teamName: string): Promise<void> {
  await new Promise((r) => setTimeout(r, UNDO_MS));
  const admin = createAdminClient();
  const { data } = await fromUntyped(admin, 'ask_credit_requests')
    .update({ released_at: new Date().toISOString() } as never)
    .eq('id', id)
    .is('released_at', null)
    .select('id, note')
    .maybeSingle();
  const row = data as { id: string; note: string | null } | null;
  if (!row) return; // Undone.
  if (!isCustomerEmailEnabled()) {
    await logServerError('ask credits request held by the email gate', { action: 'coachhelm.ask.requestCredits', extra: { requestId: id } }, 'warning');
    return;
  }
  const sent = await sendOpsAlert({ subject: `Ask: more requested (${teamName})`, text: row.note ?? 'A player asked for more Ask this week.' });
  if (sent.sent) await fromUntyped(admin, 'ask_credit_requests').update({ sent_at: new Date().toISOString() } as never).eq('id', id);
}

export async function undoAskCredits(id: string): Promise<{ success: boolean }> {
  const sb = await createClient();
  const ctx = await resolvePlayerChatContext(sb).catch(() => null);
  if (!ctx) return { success: false };
  const { data } = await fromUntyped(createAdminClient(), 'ask_credit_requests').delete().eq('id', id).eq('player_id', ctx.player_id).gt('release_at', new Date().toISOString()).select('id');
  return { success: ((data as unknown[] | null) ?? []).length > 0 };
}
