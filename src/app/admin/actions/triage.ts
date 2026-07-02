'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { createClient } from '@/lib/supabase/server';

/**
 * Resolve a group of admin_events via the internally-gated RPC.
 * MUST use the user-scoped client: resolve_admin_event() checks
 * is_super_admin() via auth.uid(), which is NULL under service_role
 * (the documented 509-storm failure mode).
 */
export async function resolveTriageEvents(
  eventIds: string[],
): Promise<{ resolvedCount: number }> {
  await requireSuperAdmin();
  if (eventIds.length === 0) return { resolvedCount: 0 };

  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: 'resolve_admin_event',
    args: { p_event_ids: string[] },
  ) => Promise<{ data: number | null; error: { message: string } | null }>;

  const { data, error } = await rpc('resolve_admin_event', { p_event_ids: eventIds });
  if (error) throw new Error(`resolve_admin_event failed: ${error.message}`);

  revalidatePath('/admin');
  revalidatePath('/admin/errors');
  return { resolvedCount: data ?? 0 };
}
