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
 * Scoped deliberately narrowly:
 *   - super-admin only, first line, same gate as every other admin write;
 *   - resolves ONE fingerprint, never a bulk sweep;
 *   - only rows already unresolved, so re-running cannot rewrite who resolved
 *     what or when;
 *   - records WHO, because "resolved" with no name is the same kind of
 *     unfalsifiable claim this exists to remove.
 */

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

export type ResolveErrorResult =
  | { success: true; resolvedCount: number }
  | { success: false; error: string };

export async function resolveErrorFingerprint(
  fingerprint: string,
): Promise<ResolveErrorResult> {
  const { userId } = await requireSuperAdmin();

  const trimmed = (fingerprint ?? '').trim();
  if (!trimmed) return { success: false, error: 'A fingerprint is required' };

  // Admin client: admin_events' own policies admit service_role for writes, and
  // this is an operator action already gated above.
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('admin_events')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
    })
    .eq('fingerprint', trimmed)
    // Only rows that are still open. Without this, re-running would overwrite
    // the original resolver and timestamp with whoever clicked last.
    .eq('resolved', false)
    .select('id');

  // The `error` is READ. Reporting "resolved" for a write that failed would be
  // the same class of lie this action exists to remove from the dashboard.
  if (error) {
    await logServerError(
      `[resolveErrorFingerprint] failed to resolve ${trimmed}: ${describeError(error)}`,
      { action: 'admin.resolveErrorFingerprint', featureArea: 'admin' },
    );
    return { success: false, error: 'Could not resolve this error. Please try again.' };
  }

  revalidatePath('/admin/errors');
  revalidatePath(`/admin/errors/${trimmed}`);

  // 0 is a legitimate answer — the fingerprint was already fully resolved — and
  // is reported as such rather than as a failure.
  return { success: true, resolvedCount: data?.length ?? 0 };
}
