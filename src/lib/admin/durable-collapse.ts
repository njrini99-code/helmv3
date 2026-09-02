import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';

/**
 * Helm Bridge — DURABLE flood collapse for provider/integration faults.
 *
 * THE GAP THIS CLOSES
 * -------------------
 * `emit-throttle.ts` collapses repeats per PROCESS: one row per 60s window,
 * with the suppressed count attached. On a laptop that is the whole story. On
 * serverless it is not: a page that auto-refreshes every 60s lands on a fresh
 * lambda most of the time, each lambda's throttle map starts empty, and the
 * "one row per window" guarantee becomes one row per REFRESH. Measured on
 * production 2026-09-01: `/admin/deploys` refreshing into a dead Vercel
 * insights endpoint wrote 99 identical `provider_vercel_unavailable` rows in
 * 2h05m — 83% of all unresolved error rows in seven days, every one with
 * `collapsed_count` NULL, all of them counted separately by
 * `get_feature_health` and turning `admin_dashboard` RED for a fault that was
 * one fault.
 *
 * WHAT THIS DOES
 * --------------
 * Before inserting a row for a fingerprint that groups across call sites
 * anyway (`provider_*` codes hash to `provider::<code>` alone — see
 * `buildIncidentSignature`), look for an UNRESOLVED row with the same
 * fingerprint inside a short window and bump its collapsed count instead of
 * inserting. The Bridge reads `metadata.metadata.collapsed_count` already
 * (`extractCollapsedCount` in incident-report.ts), so the absorbed
 * occurrences stay visible as a count on ONE line, which is what the Noise
 * Charter asks for.
 *
 * FAIL OPEN. A lookup or update that fails returns `collapsed: false` and the
 * caller inserts as before. Losing the collapse is a small cost; losing the
 * signal is the failure this whole pipeline exists to prevent. Two lambdas
 * that both miss the lookup at the same instant both insert — that bounds the
 * duplicate at "a couple per window", not "one per refresh".
 *
 * The bump is a compare-and-swap, because the new count is computed in JS:
 * two lambdas that both read N would otherwise both write N+1 and one
 * occurrence would vanish from the count. The UPDATE is guarded on the
 * counter exactly as it was read (or on its absence), re-read and retried
 * once on a miss, and fails open to an insert on a second miss — an
 * undercount was the only thing at stake, never a lost row, and the duplicate
 * that replaces it is bounded the same way as a missed lookup.
 *
 * Severity is untouched: this only decides INSERT vs. BUMP for a row that
 * would have been written at the same severity either way.
 */

export const DURABLE_COLLAPSE_WINDOW_MS = 15 * 60_000;

export interface DurableCollapseOutcome {
  collapsed: boolean;
  /** The row absorbed into, when `collapsed` is true. */
  eventId: string | null;
  /**
   * Why the collapse did not happen, when it did not. `null` = nothing to
   * collapse into. `lost_race` = the guarded bump missed twice; the caller inserts.
   */
  reason: 'no_recent_row' | 'lookup_failed' | 'update_failed' | 'lost_race' | null;
}

/** PostgREST path to the nested counter, rendered as text by `->>`. */
const COLLAPSED_COUNT_PATH = 'metadata->metadata->>collapsed_count';

/**
 * The optimistic guard for one bump: the counter exactly as it was read, as
 * `->>` renders it (text), or its absence. A row that was never bumped has no
 * counter at all, and `eq` never matches NULL — hence `is`.
 */
function collapsedCountGuard(metadata: unknown): { op: 'is'; value: null } | { op: 'eq'; value: string } {
  const outer =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;
  const inner = outer?.metadata;
  const current =
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? (inner as Record<string, unknown>).collapsed_count
      : undefined;
  if (current === undefined || current === null) return { op: 'is', value: null };
  return { op: 'eq', value: String(current) };
}

type GuardedBump = 'bumped' | 'lost_race' | 'update_failed';

/** One guarded UPDATE. `lost_race` = the guard matched no row, nothing was written. */
async function guardedBump(
  admin: SupabaseClient<Database>,
  row: { id: string; metadata: unknown },
  opts: { by: number; at: string },
): Promise<GuardedBump> {
  const guard = collapsedCountGuard(row.metadata);
  const metadata = bumpCollapsedMetadata(row.metadata, opts);
  const base = admin
    .from('admin_events')
    .update({ metadata: metadata as Json })
    .eq('id', row.id);
  const guarded =
    guard.op === 'is'
      ? base.is(COLLAPSED_COUNT_PATH, guard.value)
      : base.eq(COLLAPSED_COUNT_PATH, guard.value);
  const update = await guarded.select('id');
  if (update.error) return 'update_failed';
  return (update.data?.length ?? 0) > 0 ? 'bumped' : 'lost_race';
}

/**
 * Pure. Returns a NEW metadata object with `metadata.collapsed_count`
 * incremented by `by` (minimum 1) and `metadata.last_seen_at` stamped — the
 * same nesting `observed-action.ts` writes and `extractCollapsedCount` reads.
 * Tolerates any prior shape (null, non-object, missing inner object).
 */
export function bumpCollapsedMetadata(
  metadata: unknown,
  opts: { by: number; at: string },
): Record<string, unknown> {
  const base: Record<string, unknown> =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  const innerRaw = base.metadata;
  const inner: Record<string, unknown> =
    innerRaw && typeof innerRaw === 'object' && !Array.isArray(innerRaw)
      ? { ...(innerRaw as Record<string, unknown>) }
      : {};
  const prev =
    typeof inner.collapsed_count === 'number' && Number.isFinite(inner.collapsed_count)
      ? inner.collapsed_count
      : 0;
  inner.collapsed_count = prev + Math.max(1, Math.floor(opts.by));
  inner.last_seen_at = opts.at;
  base.metadata = inner;
  return base;
}

/**
 * Try to absorb one occurrence into the most recent unresolved `admin_events`
 * row carrying `fingerprint`. Never throws.
 */
export async function absorbIntoRecentEvent(
  admin: SupabaseClient<Database>,
  opts: {
    fingerprint: string;
    /** Occurrences this call represents (1 + anything the per-process throttle already collapsed). */
    by?: number;
    windowMs?: number;
    now?: Date;
  },
): Promise<DurableCollapseOutcome> {
  const now = opts.now ?? new Date();
  const windowMs = opts.windowMs ?? DURABLE_COLLAPSE_WINDOW_MS;
  const since = new Date(now.getTime() - windowMs).toISOString();

  try {
    const lookup = () =>
      admin
        .from('admin_events')
        .select('id, metadata')
        .eq('fingerprint', opts.fingerprint)
        .eq('event_type', 'error')
        .eq('resolved', false)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1);
    const bump = { by: opts.by ?? 1, at: now.toISOString() };

    // Read, then a bump guarded on what was read. A miss means another lambda
    // bumped between the two; re-read once and land on its count instead.
    for (let attempt = 0; attempt < 2; attempt++) {
      const found = await lookup();
      if (found.error) return { collapsed: false, eventId: null, reason: 'lookup_failed' };
      const row = found.data?.[0];
      if (!row) return { collapsed: false, eventId: null, reason: 'no_recent_row' };

      const outcome = await guardedBump(admin, row, bump);
      if (outcome === 'bumped') return { collapsed: true, eventId: row.id, reason: null };
      if (outcome === 'update_failed') return { collapsed: false, eventId: null, reason: 'update_failed' };
    }
    return { collapsed: false, eventId: null, reason: 'lost_race' };
  } catch {
    return { collapsed: false, eventId: null, reason: 'lookup_failed' };
  }
}
