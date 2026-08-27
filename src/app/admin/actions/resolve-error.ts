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
 *
 * FINGERPRINT-LEVEL RECORDING (added 2026-08-27, alongside
 * `public.admin_error_resolutions` — see that migration and
 * `src/lib/admin/resolution-ledger.ts`)
 * ----------------------------------------------------------------------
 * The row-level resolve above answers "stop showing me these events". It does
 * not answer "what fixed this" or "has this come back since" — the next
 * occurrence of the same fault arrives as a brand-new unresolved row with no
 * memory that anything was ever fixed. `admin_resolve_error_fingerprint`
 * closes that gap by recording, per fingerprint, the PR/SHA that fixed it and
 * the last occurrence known at resolution time — the exact baseline the
 * nightly regression check (`admin_mark_error_regressed`, driven by
 * `planReopens` in `src/lib/reliability/resolution.ts`) compares new
 * occurrences against. Getting that baseline right is why this action always
 * derives it from the freshest `created_at` among the rows it just read,
 * rather than leaving it to the caller.
 *
 * This is the MANUAL twin of `recordAutoResolutions` in
 * resolution-ledger.ts, which calls the separate, service-role-only
 * `admin_auto_resolve_error_fingerprint` RPC from the nightly cron.
 * `admin_resolve_error_fingerprint` is a DIFFERENT function with the SAME
 * `is_super_admin()` + `auth.uid()` gate as `resolve_admin_event` above, so it
 * carries the identical constraint: user-scoped client only, never
 * `createAdminClient()` — under service_role `auth.uid()` is NULL and it
 * raises `Forbidden`.
 *
 * PARTIAL FAILURE IS NOT SUCCESS. The row-level resolve and the
 * fingerprint-level record are two separate writes; one can succeed while the
 * other fails. Reporting `{ success: true }` when the fingerprint write
 * failed would be exactly the "error → []" lie this whole subsystem exists to
 * remove, so the result always carries a `fingerprint` sub-result the caller
 * can render honestly instead of collapsing it into a bare boolean.
 */

import { revalidatePath, updateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { describeResolveFailure } from '@/lib/admin/resolve-failure';
import { BRIDGE_INCIDENT_CACHE_TAG } from '@/lib/admin/data/overview';

/** What fixed the fault, as the operator knows it. All optional — a fault may
 *  be resolved with no code change (a config fix, an upstream outage ending),
 *  and recording "resolved, no PR" is more honest than inventing one. Mirrors
 *  `admin_resolve_error_fingerprint`'s own optional args 1:1. */
export interface ResolveErrorFingerprintOptions {
  prNumber?: number;
  prUrl?: string;
  fixedInSha?: string;
  note?: string;
}

/** Outcome of the fingerprint-level record, reported separately from the
 *  row-level resolve so a partial failure cannot be read as a clean success. */
export type FingerprintRecordOutcome =
  | { recorded: true }
  | { recorded: false; error: string };

export type ResolveErrorResult =
  | { success: true; resolvedCount: number; fingerprint: FingerprintRecordOutcome }
  | { success: false; error: string };

/**
 * Translate a gated RPC's raw error the same way `describeResolveFailure`
 * does for `resolve_admin_event` — `admin_resolve_error_fingerprint` and
 * `admin_unresolve_error_fingerprint` raise the identical bare `Forbidden`
 * (42501) from the identical `is_super_admin()` check, so the "two gates"
 * explanation applies unchanged. Anything else is prefixed with the actual
 * function name rather than borrowing `resolve_admin_event`'s in the
 * non-forbidden branch, which would misattribute the failure.
 */
function describeFingerprintRpcFailure(fn: string, message: string): string {
  const forbidden = /forbidden/i.test(message) || message.includes('42501');
  if (forbidden) return describeResolveFailure(message);
  return `${fn} failed: ${message}`;
}

export async function resolveErrorFingerprint(
  fingerprint: string,
  options?: ResolveErrorFingerprintOptions,
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
    .select('id, created_at')
    .eq('fingerprint', trimmed)
    // Only rows that are still open — mirrors the RPC's own `resolved = false`
    // filter, so this lookup and the resolve it feeds stay in agreement.
    .eq('resolved', false)
    // Newest first. PostgREST caps any request at 1000 rows regardless of
    // ordering, so on a fingerprint with more open rows than that, an
    // unordered (or ascending) read could silently miss the true most-recent
    // occurrence — and that value becomes the PERMANENT regression baseline
    // below. Ordering descending guarantees rows[0] is the genuine max no
    // matter how many rows exist or get truncated off the tail.
    .order('created_at', { ascending: false });

  if (readError) {
    await logServerError(
      `[resolveErrorFingerprint] failed to look up open events for ${trimmed}: ${describeError(readError)}`,
      { action: 'admin.resolveErrorFingerprint', featureArea: 'admin' },
    );
    return { success: false, error: 'Could not resolve this error. Please try again.' };
  }

  const rows = openRows ?? [];
  const eventIds = rows.map((row) => row.id);

  const hasFingerprintMetadata =
    options?.prNumber !== undefined ||
    options?.prUrl !== undefined ||
    options?.fixedInSha !== undefined ||
    options?.note !== undefined;

  // Nothing open AND nothing new to attach: the historical no-op case
  // (ResolveErrorButton re-clicked on an already-archived fingerprint, no
  // options). Skip admin_resolve_error_fingerprint entirely here — its
  // on-conflict path unconditionally bumps resolved_at, relabels
  // resolution_source 'manual', and CLEARS reopened_at (see the migration:
  // re-resolving is meant to assert "this fix supersedes the last"). Calling
  // it on a click that resolved zero rows and carries no new information
  // would silently erase a live regression flag and relabel an 'auto'
  // resolution as a human one nobody actually asserted.
  if (eventIds.length === 0 && !hasFingerprintMetadata) {
    return { success: true, resolvedCount: 0, fingerprint: { recorded: true } };
  }

  // rows[0] is the freshest occurrence by construction (ordered desc above) —
  // becomes `p_last_seen_at`, the baseline every future regression check
  // compares against. `undefined` (not a stale/absent value) when there is
  // none, so the RPC's own `coalesce(excluded.last_seen_at_resolution, ...)`
  // keeps whatever baseline a prior resolution already recorded instead of
  // this omission clobbering it.
  let lastSeenAt: string | undefined;
  const freshest = rows[0]?.created_at;
  if (freshest) {
    const t = Date.parse(freshest);
    if (!Number.isNaN(t)) lastSeenAt = new Date(t).toISOString();
  }

  // MUST use the user-scoped client for BOTH RPCs below: resolve_admin_event()
  // and admin_resolve_error_fingerprint() each check is_super_admin() via
  // auth.uid(), which is NULL under service_role (the documented 509-storm
  // failure mode — same rule as resolveTriageEvents in ../actions/triage.ts).
  const supabase = await createClient();

  // 0 open rows is a legitimate answer — the fingerprint was already fully
  // resolved at the row level — and is reported as such rather than as a
  // failure. Nothing to write there, so the resolve_admin_event round trip is
  // skipped entirely (mirrors resolveTriageEvents in ../actions/triage.ts).
  // The fingerprint-level record below still runs whenever there's something
  // to say (open rows OR operator-supplied metadata, guarded above): an
  // operator attaching a PR/note to an already-archived fault is a normal,
  // deliberate use of this action, not a no-op.
  let resolvedCount = 0;
  if (eventIds.length > 0) {
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      fn: 'resolve_admin_event',
      args: { p_event_ids: string[] },
    ) => Promise<{ data: number | null; error: { message: string } | null }>;

    const { data, error } = await rpc('resolve_admin_event', { p_event_ids: eventIds });

    // The `error` is READ. Reporting "resolved" for a write that failed would
    // be the same class of lie this action exists to remove from the
    // dashboard. A failure here stops the whole action — the fingerprint
    // record must not claim a fix that was never actually applied to the rows
    // it is supposed to describe.
    if (error) {
      const message = describeResolveFailure(error.message);
      await logServerError(
        `[resolveErrorFingerprint] failed to resolve ${trimmed}: ${message}`,
        { action: 'admin.resolveErrorFingerprint', featureArea: 'admin' },
      );
      return { success: false, error: message };
    }

    resolvedCount = data ?? 0;
  }

  // Fingerprint-level record: what fixed it, and the regression baseline.
  const fingerprintRpc = supabase.rpc.bind(supabase) as unknown as (
    fn: 'admin_resolve_error_fingerprint',
    args: {
      p_fingerprint: string;
      p_pr_number?: number;
      p_pr_url?: string;
      p_fixed_in_sha?: string;
      p_note?: string;
      p_last_seen_at?: string;
    },
  ) => Promise<{ data: null; error: { message: string } | null }>;

  const { error: fingerprintError } = await fingerprintRpc('admin_resolve_error_fingerprint', {
    p_fingerprint: trimmed,
    p_pr_number: options?.prNumber,
    p_pr_url: options?.prUrl,
    p_fixed_in_sha: options?.fixedInSha,
    p_note: options?.note,
    p_last_seen_at: lastSeenAt,
  });

  let fingerprintOutcome: FingerprintRecordOutcome;
  if (fingerprintError) {
    const message = describeFingerprintRpcFailure(
      'admin_resolve_error_fingerprint',
      fingerprintError.message,
    );
    await logServerError(
      `[resolveErrorFingerprint] resolved ${resolvedCount} row(s) for ${trimmed} but the fingerprint record failed: ${message}`,
      { action: 'admin.resolveErrorFingerprint', featureArea: 'admin' },
    );
    // The row-level write above already succeeded (or had nothing to do) —
    // that is real and stays reported as such. What must NOT happen is
    // reporting this as a plain, undifferentiated success: the caller gets
    // the failure explicitly, in `fingerprint`, rather than a lie by omission.
    fingerprintOutcome = { recorded: false, error: message };
  } else {
    fingerprintOutcome = { recorded: true };
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

  return { success: true, resolvedCount, fingerprint: fingerprintOutcome };
}

export type UnresolveErrorResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Un-archive a fingerprint: delete its `admin_error_resolutions` row via
 * `admin_unresolve_error_fingerprint`. This does NOT touch `admin_events` —
 * it only removes the fingerprint-level resolution record, restoring the
 * fault to visibility as "not known to be fixed". Same super-admin,
 * user-scoped-client requirement as the resolve path above (identical
 * `is_super_admin()` / `auth.uid()` gate). Restoring visibility must never be
 * harder than hiding it, so this mirrors resolveErrorFingerprint's shape and
 * error handling exactly rather than taking a shortcut.
 */
export async function unresolveErrorFingerprint(
  fingerprint: string,
): Promise<UnresolveErrorResult> {
  await requireSuperAdmin();

  const trimmed = (fingerprint ?? '').trim();
  if (!trimmed) return { success: false, error: 'A fingerprint is required' };

  // MUST use the user-scoped client — same reason as above: service_role
  // makes auth.uid() NULL and the gate raises Forbidden.
  const supabase = await createClient();
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: 'admin_unresolve_error_fingerprint',
    args: { p_fingerprint: string },
  ) => Promise<{ data: null; error: { message: string } | null }>;

  const { error } = await rpc('admin_unresolve_error_fingerprint', { p_fingerprint: trimmed });

  if (error) {
    const message = describeFingerprintRpcFailure('admin_unresolve_error_fingerprint', error.message);
    await logServerError(
      `[unresolveErrorFingerprint] failed to unresolve ${trimmed}: ${message}`,
      { action: 'admin.unresolveErrorFingerprint', featureArea: 'admin' },
    );
    return { success: false, error: message };
  }

  revalidatePath('/admin');
  revalidatePath('/admin/errors');
  revalidatePath(`/admin/errors/${trimmed}`);
  updateTag(BRIDGE_INCIDENT_CACHE_TAG);

  return { success: true };
}
