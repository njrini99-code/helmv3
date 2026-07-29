'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { describeResolveFailure } from '@/lib/admin/resolve-failure';
import { BRIDGE_INCIDENT_CACHE_TAG } from '@/lib/admin/data/overview';

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
  if (error) throw new Error(describeResolveFailure(error.message));

  revalidatePath('/admin');
  revalidatePath('/admin/errors');
  // The nav badge is `unstable_cache`d for 60s so the root layout does not pay
  // for the incident feed on every navigation. revalidatePath does NOT reach
  // it — without this the badge would keep showing the pre-resolve count for
  // up to a minute, which reads as "I resolved it and it stayed".
  //
  // `updateTag`, not `revalidateTag`: it is the read-your-own-writes form and
  // is only callable from a Server Action, which is exactly this. The badge
  // must be correct on the very next render after a resolve, not eventually.
  updateTag(BRIDGE_INCIDENT_CACHE_TAG);
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
