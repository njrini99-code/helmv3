'use server';

// ============================================================================
// CRM MANUAL SEND — server action for the "Open in Gmail" feature
// ============================================================================
//
// When the operator opens a pre-filled Gmail compose window for a coach (see
// src/lib/crm/gmail-compose.ts), we optimistically log the touch so the coach
// is treated exactly like an automated send:
//
//   1. crm_contact_log row (contact_type='email') — feeds the per-coach
//      timeline AND the 7-day frequency cap. That cap is built from
//      email_events in the batch sender, but the manual-send path is purely
//      a human action outside Resend, so the contact-log row is what records
//      that this coach was just touched and keeps the operator from double-
//      touching them by hand.
//   2. crm_coaches.last_contacted_at / updated_at = now.
//   3. status -> 'contacted' ONLY when it was still 'new_lead' (so a coach
//      already further along the pipeline isn't demoted).
//
// Mirrors the auth + revalidate pattern in crm-foundations.ts. Admin-gated by
// RLS; auth.getUser() fails fast on unauthenticated requests.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const CRM_REVALIDATE_PATH = '/golf/admin/crm';

// The typed client doesn't expose the crm_* CRM tables, mirroring
// crm-foundations.ts. Cast through this alias so the from() calls type-check.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

async function getAuthedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return { supabase, user };
}

/**
 * Log a manual Gmail send as a contact touch and advance the coach's status.
 * Fire-and-forget from the client — returns { ok: false } (never throws) on
 * failure so the UI's optimistic update isn't blocked.
 */
export async function logManualGmailTouch(input: {
  coach_id: string;
  subject: string;
}): Promise<{ ok: boolean }> {
  try {
    const { supabase, user } = await getAuthedClient();
    const client = supabase as AnySupabase;
    const nowIso = new Date().toISOString();

    const { error: logError } = await client
      .from('crm_contact_log')
      .insert({
        coach_id: input.coach_id,
        contact_type: 'email',
        subject: input.subject,
        notes: 'Manual Gmail send (outside automated batch)',
        created_by: user.id,
      });
    if (logError) throw logError;

    // Fetch current status so we only promote new_lead -> contacted (a coach
    // already engaged/proposal/won must not be demoted back to contacted).
    const { data: existing, error: fetchError } = await client
      .from('crm_coaches')
      .select('status')
      .eq('id', input.coach_id)
      .maybeSingle();
    if (fetchError) throw fetchError;

    const updates: Record<string, unknown> = {
      last_contacted_at: nowIso,
      updated_at: nowIso,
    };
    if (existing?.status === 'new_lead') {
      updates.status = 'contacted';
    }

    const { error: updateError } = await client
      .from('crm_coaches')
      .update(updates)
      .eq('id', input.coach_id);
    if (updateError) throw updateError;

    revalidatePath(CRM_REVALIDATE_PATH);
    return { ok: true };
  } catch (err) {
    console.error('[crm] logManualGmailTouch failed:', err);
    return { ok: false };
  }
}
