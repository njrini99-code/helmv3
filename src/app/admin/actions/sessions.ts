'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { createClient } from '@/lib/supabase/server';
import { logSecurityEvent } from '@/lib/admin-logger';

/**
 * Sign a user out everywhere via the internally-gated RPC.
 * MUST use the user-scoped client: revoke_user_sessions() checks
 * is_super_admin() via auth.uid(), which is NULL under service_role
 * (the documented 509-storm failure mode — same rule as resolveTriageEvents).
 */
export async function revokeSessionsForUser(
  userId: string,
): Promise<{ revokedCount: number }> {
  const admin = await requireSuperAdmin();

  const supabase = await createClient(); // user-scoped: RPC gates on auth.uid()
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: 'revoke_user_sessions',
    args: { p_user_id: string },
  ) => Promise<{ data: number | null; error: { message: string } | null }>;

  const { data, error } = await rpc('revoke_user_sessions', { p_user_id: userId });
  if (error) throw new Error(`revoke_user_sessions failed: ${error.message}`);

  // Audit into the event feed too (the RPC already wrote audit_log).
  logSecurityEvent(`Admin revoked all sessions for user ${userId}`, 'warning', {
    targetUserId: userId,
    revokedBy: admin.userId,
  }).catch(() => {});

  revalidatePath('/admin/auth');
  return { revokedCount: data ?? 0 };
}
