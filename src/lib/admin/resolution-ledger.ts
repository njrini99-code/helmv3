import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * Typed on purpose. With a bare `SupabaseClient` the RPC names and argument
 * shapes below are unchecked strings, so a renamed parameter would compile
 * cleanly and fail at 3am in a cron nobody is watching — the failure mode this
 * whole subsystem exists to remove.
 */
type AdminClient = SupabaseClient<Database>;

/**
 * Fingerprint-level memory of what was fixed, and of what came back.
 *
 * `autoResolveFixedIncidents` decides WHAT is resolved; this module records
 * that decision durably. The split is deliberate — see
 * `src/lib/reliability/resolution.ts` for why a second archive rule was
 * removed rather than wired.
 *
 * WHY A SEPARATE RECORD AT ALL, when auto-resolve already flips
 * `admin_events.resolved`:
 *
 * That flip is per-ROW. It hides the rows that exist now, and it is the right
 * mechanism for "stop showing me this". But the next occurrence of the same
 * fault arrives as a brand-new unresolved row with no memory that anything was
 * ever fixed — auto-resolve.ts's own doc notes this and treats it as
 * sufficient. It is sufficient for visibility and insufficient for judgement:
 * "this is broken" and "we fixed this and it came back" are different facts,
 * and an operator seeing only the first cannot tell which they have.
 *
 * These writes go through the RPCs rather than a direct upsert on purpose. The
 * "an automatic decision never overwrites a human one" rule lives in
 * `admin_auto_resolve_error_fingerprint`, and re-expressing it here would be a
 * second definition of the same rule, free to drift from the one the database
 * actually enforces.
 */

/**
 * Cap on RPC round-trips per pass, per phase. Production carries 67 distinct
 * unresolved fingerprints against 517 rows (measured 2026-08-27), so this is
 * far above the working set and exists only so a pathological table cannot
 * turn one nightly job into thousands of calls. Anything dropped is REPORTED,
 * never silently skipped — a cap you cannot see is indistinguishable from a
 * bug.
 */
export const MAX_LEDGER_WRITES = 500;

export interface ResolutionEntry {
  fingerprint: string;
  /** The last occurrence known at the moment of resolution. This becomes the
   *  baseline every future regression check compares against. */
  lastSeenAt: string;
  /** Production SHA credited with the fix. Null for a resolution claiming no
   *  deploy evidence (Rule B's 14-day quiet), which `shipStatus` handles. */
  fixedInSha: string | null;
  note: string;
}

export interface LedgerWriteResult {
  /** Rows the RPC actually wrote or updated. */
  recorded: number;
  /** Fingerprints skipped because a HUMAN had already resolved them. Not a
   *  failure — the RPC refusing to downgrade a manual decision is the rule
   *  working. */
  skippedManual: number;
  failed: number;
  /** Entries beyond MAX_LEDGER_WRITES that were never attempted. */
  capped: number;
  /** First error encountered, so a failure has a cause and not just a count —
   *  the exact distinction the swallowed-cron incident turned on. */
  firstError: string | null;
}

const EMPTY: LedgerWriteResult = {
  recorded: 0,
  skippedManual: 0,
  failed: 0,
  capped: 0,
  firstError: null,
};

/**
 * Record resolutions for fingerprints an upstream rule already decided are
 * fixed. Returns counts AND the first cause; callers must surface both.
 */
export async function recordAutoResolutions(
  admin: AdminClient,
  entries: readonly ResolutionEntry[],
): Promise<LedgerWriteResult> {
  if (entries.length === 0) return { ...EMPTY };

  const attempt = entries.slice(0, MAX_LEDGER_WRITES);
  const result: LedgerWriteResult = { ...EMPTY, capped: entries.length - attempt.length };

  for (const entry of attempt) {
    const { data, error } = await admin.rpc('admin_auto_resolve_error_fingerprint', {
      p_fingerprint: entry.fingerprint,
      p_last_seen_at: entry.lastSeenAt,
      // `undefined`, not `null`, when there is no SHA. supabase-js drops
      // undefined keys from the JSON body, so the argument is OMITTED and the
      // function's own `default null` applies — which is the same stored value
      // by the one route the type signature actually permits. Typing this
      // client against `Database` is what surfaced that; with a bare
      // SupabaseClient the `null` compiled fine.
      p_fixed_in_sha: entry.fixedInSha ?? undefined,
      p_note: entry.note,
    });

    if (error) {
      result.failed += 1;
      // Keep the FIRST cause rather than the last: on a systemic failure every
      // subsequent message is the same one, and the first is the one with the
      // least noise around it.
      result.firstError ??= `${entry.fingerprint}: ${error.message}`;
      continue;
    }

    // The RPC returns false when it declined to overwrite a manual resolution.
    // That is a decision, not an error, and collapsing the two would report a
    // working rule as a fault.
    if (data === false) result.skippedManual += 1;
    else result.recorded += 1;
  }

  return result;
}

export interface RegressionWriteResult {
  marked: number;
  failed: number;
  capped: number;
  firstError: string | null;
}

/** Flag archived faults that have recurred. One call per fingerprint; the
 *  RPC increments `reopened_count` only on the TRANSITION into regressed, so
 *  a fault firing every three hours counts once rather than every tick. */
export async function markRegressions(
  admin: AdminClient,
  fingerprints: readonly string[],
): Promise<RegressionWriteResult> {
  if (fingerprints.length === 0) {
    return { marked: 0, failed: 0, capped: 0, firstError: null };
  }

  const attempt = fingerprints.slice(0, MAX_LEDGER_WRITES);
  const result: RegressionWriteResult = {
    marked: 0,
    failed: 0,
    capped: fingerprints.length - attempt.length,
    firstError: null,
  };

  for (const fingerprint of attempt) {
    const { error } = await admin.rpc('admin_mark_error_regressed', {
      p_fingerprint: fingerprint,
    });
    if (error) {
      result.failed += 1;
      result.firstError ??= `${fingerprint}: ${error.message}`;
      continue;
    }
    result.marked += 1;
  }

  return result;
}

export interface StoredResolution {
  fingerprint: string;
  resolvedAt: string;
  resolutionSource: 'auto' | 'manual';
  lastSeenAtResolution: string | null;
  reopenedAt: string | null;
}

export interface StoredResolutionsResult {
  resolutions: StoredResolution[];
  /**
   * Set when the read FAILED. Null data with a null error means "no
   * resolutions exist"; null data with an error means "we do not know", and
   * the caller must not treat the second as the first — that is precisely the
   * `error -> []` shape the OS forbids. A caller that cannot read the
   * resolutions must skip regression detection rather than conclude nothing
   * regressed.
   */
  error: string | null;
}

/** Read the resolution rows for a specific set of fingerprints. */
export async function fetchResolutionsFor(
  admin: AdminClient,
  fingerprints: readonly string[],
): Promise<StoredResolutionsResult> {
  if (fingerprints.length === 0) return { resolutions: [], error: null };

  const { data, error } = await admin
    .from('admin_error_resolutions')
    .select('fingerprint, resolved_at, resolution_source, last_seen_at_resolution, reopened_at')
    .in('fingerprint', [...fingerprints]);

  if (error) return { resolutions: [], error: error.message };

  const resolutions = (data ?? []).map(
    (row): StoredResolution => ({
      fingerprint: row.fingerprint,
      resolvedAt: row.resolved_at,
      resolutionSource: row.resolution_source === 'auto' ? 'auto' : 'manual',
      lastSeenAtResolution: row.last_seen_at_resolution,
      reopenedAt: row.reopened_at,
    }),
  );

  return { resolutions, error: null };
}
