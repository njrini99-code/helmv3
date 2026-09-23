'use server';

/**
 * Bridge Jobs board — "Jobs queue" section server action (Database Plan D6).
 * Requeue a dead-lettered message: service-role facade, admin-gated by the
 * same requireSuperAdmin() gate every admin action in this repo uses.
 */
import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { describeError } from '@/lib/utils/describe-error';

export interface RequeueDeadLetterResult {
  success: boolean;
  error?: string;
}

export async function requeueDeadLetter(deadLetterId: string): Promise<RequeueDeadLetterResult> {
  await requireSuperAdmin();

  try {
    const admin = createAdminClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).rpc('helm_jobs_requeue_dead_letter', {
      p_dead_letter_id: deadLetterId,
    });
    if (error) {
      return { success: false, error: error.message ?? 'requeue failed' };
    }
    revalidatePath('/admin/jobs');
    return { success: true };
  } catch (err) {
    return { success: false, error: describeError(err) };
  }
}
