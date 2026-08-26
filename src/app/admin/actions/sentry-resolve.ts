'use server';

/**
 * Resolve a Sentry issue directly from Helm Bridge — an operator confirms a
 * clean fix without switching over to sentry.io to click Resolve there.
 *
 * Scoped deliberately narrowly, matching resolveErrorFingerprint's shape
 * (resolve-error.ts):
 *   - super-admin only, first line, same gate as every other admin write;
 *   - never throws on a Sentry-side failure — updateSentryIssueStatus is
 *     fail-soft by contract, and this wrapper preserves that all the way to
 *     the client so a dead/misconfigured integration degrades to a message,
 *     never a crashed action;
 *   - `unconfigured: true` covers BOTH "no Sentry token configured at all"
 *     AND "the configured token lacks write scope" (a 401/403 from the PUT).
 *     From an operator's chair both read the same way — "the Bridge cannot
 *     do this yet, and clicking again won't help" — so both render the same
 *     not-configured state instead of a scary, retryable-looking error.
 */

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { updateSentryIssueStatus } from '@/lib/admin/sentry-api';

export async function resolveSentryIssueAction(
  issueId: string,
): Promise<{ ok: boolean; error?: string; unconfigured?: boolean }> {
  await requireSuperAdmin();

  const trimmed = (issueId ?? '').trim();
  if (!trimmed) return { ok: false, error: 'A Sentry issue id is required' };

  const result = await updateSentryIssueStatus(trimmed, 'resolved');

  if (result.status === 'unconfigured') {
    return { ok: false, unconfigured: true, error: result.error };
  }

  if (result.status === 'error') {
    // A write-scope rejection (401/403) is functionally the same as "not
    // configured" from the operator's chair — the fix is identical (add a
    // token with write scope) and retrying the same click changes nothing.
    const isScopeRejection = /\b40[13]\b/.test(result.error ?? '');
    if (isScopeRejection) {
      return { ok: false, unconfigured: true, error: result.error };
    }
    return { ok: false, error: result.error ?? 'Could not resolve this issue in Sentry.' };
  }

  // The Errors tab renders Sentry issues alongside admin_events — an
  // operator who just resolved one from the Bridge should see it reflect
  // immediately, not after the next unrelated navigation.
  revalidatePath('/admin/errors');

  return { ok: true };
}
