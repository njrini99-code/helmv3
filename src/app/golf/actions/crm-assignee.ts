'use server';

// ============================================================================
// CRM ASSIGNEE — manual work-division labels (one shared login)
// ============================================================================
// Sets crm_coaches.assigned_to to a plain label (Nick/Ben/Leah) so the team can
// split the prospect book without separate auth accounts. This is a tag, not an
// auth user — double-touch is prevented server-side by the frequency cap.
// Requires the `assigned_to` column (migration 20260617000000_crm_coaches_assigned_to.sql).
// ============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

export async function setCoachAssignee(input: {
  coach_id: string;
  assignee: string | null;
}): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { error } = await supabase
    .from('crm_coaches')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ assigned_to: input.assignee, updated_at: new Date().toISOString() } as any)
    .eq('id', input.coach_id);

  if (error) {
    await logServerError(
      `[crm-assignee] setCoachAssignee failed: ${describeError(error)}`,
      {
        action: 'crm_assignee.setCoachAssignee',
        source: 'server_action',
        sport: 'golf',
        featureArea: 'crm',
        errorCode: error.code,
        errorHint: error.hint,
        errorDetails: error.details,
        metadata: { coachId: input.coach_id },
      },
    );
    return { ok: false };
  }
  revalidatePath('/golf/admin/crm');
  return { ok: true };
}
