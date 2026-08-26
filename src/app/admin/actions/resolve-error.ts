'use server';

/**
 * Mark an error fingerprint resolved.
 *
 * admin_events has carried `resolved`, `resolved_at` and `resolved_by` since it
 * was created, and the admin surface READS all three — the fingerprint detail
 * page even has an empty state reading "Either every event has been resolved or
 * this fingerprint no longer matches any admin_events row."
 *
 * Nothing in the product could ever write them. There was no resolve action
 * anywhere in src/, so every error ever logged stayed unresolved forever, and a
 * defect fixed and deployed weeks ago sat in the dashboard beside one that
 * broke five minutes ago, indistinguishable.
 *
 * That is not cosmetic. It is what made the Stripe webhook failure invisible:
 * it logged at 'error' into a channel nobody could trust, because the channel
 * could not distinguish "still broken" from "nobody ever closed it". Two of the
 * unresolved clusters on 2026-08-09 — the class-sync timestamp crash and the
 * onboarding avatar upload — were already fixed AND deployed, and the only way
 * to know that was to read the source and diff it against the running commit.
 *
 * Unified 2026-08-25: this used to write `resolved`/`resolved_at`/`resolved_by`
 * directly via createAdminClient() (a service-role UPDATE). That was a SECOND
 * resolution path next to resolveTriageEvents' (../actions/triage.ts)
 * user-scoped resolve_admin_event() RPC — two ways to flip the same three
 * columns, only one of which ran the RPC's internal is_super_admin() check,
 * and only one of which busted the nav-badge cache tag. A fingerprint resolved
 * from the detail page therefore left the badge showing a stale count for up
 * to 60s while a bulk resolve from the list page updated it immediately —
 * same button, same effect, different observable behavior depending on which
 * page you clicked it from.
 *
 * Now: a service-role READ finds which rows are still open for the
 * fingerprint (reads need no elevated write privilege, so this is exempt from
 * the RPC's user-scoped requirement below), and the actual resolve goes
 * through the SAME RPC path resolveTriageEvents uses. There is exactly one
 * place admin_events ever gets marked resolved.
 *
 * Scoped deliberately narrowly:
 *   - super-admin only, first line, same gate as every other admin write;
 *   - resolves ONE fingerprint, never a bulk sweep;
 *   - only rows already unresolved, so re-running cannot rewrite who resolved
 *     what or when (the RPC itself also filters `resolved = false`);
 *   - `resolved_by` is recorded as `auth.uid()` inside the RPC, because
 *     "resolved" with no name is the same kind of unfalsifiable claim this
 *     exists to remove.
 */

import { revalidatePath, updateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { describeResolveFailure } from '@/lib/admin/resolve-failure';
import { BRIDGE_INCIDENT_CACHE_TAG } from '@/lib/admin/data/overview';

export type ResolveErrorResult =
  | { success: true; resolvedCount: number }
  | { success: false; error: string };

export async function resolveErrorFingerprint(
  fingerprint: string,
): Promise<ResolveErrorResult> {
  await requireSuperAdmin();

  const trimmed = (fingerprint ?? '').trim();
  if (!trimmed) return { success: false, error: 'A fingerprint is required' };

  // Admin client: used for the READ only. Finding which rows are still open
  // needs no elevated write privilege — admin_events' own policies admit
  // service_role, and this is an operator action already gated above. The
  // WRITE happens further down, through the user-scoped RPC.
  const admin = createAdminClient();

  const { data: openRows, error: readError } = await admin
    .from('admin_events')
    .select('id')
    .eq('fingerprint', trimmed)
    // Only rows that are still open — mirrors the RPC's own `resolved = false`
    // filter, so this lookup and the resolve it feeds stay in agreement.
    .eq('resolved', false);

  if (readError) {
    await logServerError(
      `[resolveErrorFingerprint] failed to look up open events for ${trimmed}: ${describeError(readError)}`,
      { action: 'admin.resolveErrorFingerprint', featureArea: 'admin' },
    );
    return { success: false, error: 'Could not resolve this error. Please try again.' };
  }

  const eventIds = (openRows ?? []).map((row) => row.id);

  // 0 is a legitimate answer — the fingerprint was already fully resolved —
  // and is reported as such rather than as a failure. Nothing to write, so
  // skip the RPC round trip entirely (mirrors resolveTriageEvents in
  // ../actions/triage.ts, which takes the same early return).
  if (eventIds.length === 0) return { success: true, resolvedCount: 0 };

  // MUST use the user-scoped client: resolve_admin_event() checks
  // is_super_admin() via auth.uid(), which is NULL under service_role
  // (the documented 509-storm failure mode — same rule as
  // resolveTriageEvents in ../actions/triage.ts).
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: 'resolve_admin_event',
    args: { p_event_ids: string[] },
  ) => Promise<{ data: number | null; error: { message: string } | null }>;

  const { data, error } = await rpc('resolve_admin_event', { p_event_ids: eventIds });

  // The `error` is READ. Reporting "resolved" for a write that failed would be
  // the same class of lie this action exists to remove from the dashboard.
  if (error) {
    const message = describeResolveFailure(error.message);
    await logServerError(
      `[resolveErrorFingerprint] failed to resolve ${trimmed}: ${message}`,
      { action: 'admin.resolveErrorFingerprint', featureArea: 'admin' },
    );
    return { success: false, error: message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/errors');
  revalidatePath(`/admin/errors/${trimmed}`);
  // The nav badge is `unstable_cache`d for 60s so the root layout does not pay
  // for the incident feed on every navigation. revalidatePath does NOT reach
  // it — without this the badge would keep showing the pre-resolve count for
  // up to a minute, which reads as "I resolved it and it stayed". Same tag
  // resolveTriageEvents busts, so both resolve paths behave identically.
  updateTag(BRIDGE_INCIDENT_CACHE_TAG);

  return { success: true, resolvedCount: data ?? 0 };
}
