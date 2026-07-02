'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';

/**
 * Resolve a group of admin_events via the internally-gated RPC.
 * MUST use the user-scoped client: resolve_admin_event() checks
 * is_super_admin() via auth.uid(), which is NULL under service_role
 * (the documented 509-storm failure mode).
 */
async function resolveTriageEventsImpl(
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

/**
 * Observed wrapper — logging never alters behavior (see observed-action
 * tests). `'use server'` requires exported server actions to be async
 * function declarations (const-export form breaks Next's build), so the
 * wrapped closure is built once at module scope and the export just
 * delegates to it.
 */
const observedResolveTriageEvents = withAdminObserved(
  'resolveTriageEvents',
  { sport: 'shared', feature: 'admin_dashboard' },
  resolveTriageEventsImpl,
);

export async function resolveTriageEvents(
  eventIds: string[],
): Promise<{ resolvedCount: number }> {
  return observedResolveTriageEvents(eventIds);
}
