import { logServerEvent } from '@/lib/server-error-logger';
import { featureForTable, type FeatureKey } from '@/lib/admin/feature-registry';

/**
 * Helm Bridge capture class #1 — RLS denials. Spikes here have historically
 * meant missing grants or unapplied migrations (upsert UPDATE-grant,
 * matview re-grant incidents). Centralized 42501/PostgREST detection;
 * FIRE-AND-FORGET by contract — a denial capture must never fail or slow a
 * live user request.
 */

export function isRlsDenial(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === '42501') return true;
  return /row-level security/i.test(error.message ?? '');
}

/**
 * Postgres names the offending relation in the denial text itself. Callers that
 * can't thread a table descriptor (e.g. `fetchAllRowsResult` without an
 * `rlsCtx`) previously landed in the Bridge as `RLS denial: select on unknown`,
 * which is un-triageable and can't resolve a feature via `featureForTable`.
 * Recovering the name from the message keeps those denials actionable.
 */
const DENIAL_TABLE_PATTERNS: RegExp[] = [
  /permission denied for (?:table|relation|view|materialized view)\s+"?([A-Za-z0-9_]+)"?/i,
  /row-level security policy for (?:table|relation)\s+"?([A-Za-z0-9_]+)"?/i,
];

const UNNAMED_TABLES = new Set(['', 'unknown']);

export function resolveDenialTable(table: string, message: string | null | undefined): string {
  if (!UNNAMED_TABLES.has(table.trim().toLowerCase())) return table;
  for (const pattern of DENIAL_TABLE_PATTERNS) {
    const match = pattern.exec(message ?? '');
    if (match?.[1]) return match[1];
  }
  return table;
}

const STORM_WINDOW_MS = 10 * 60 * 1000;
const STORM_THRESHOLD = 5;

/**
 * Per-instance, in-memory only — serverless functions don't share state
 * across invocations or instances, so a storm spread thin across many
 * cold-started instances under-counts here. Acceptable: this is a cheap
 * single-instance tripwire for a hot loop hammering one denial, not an
 * exact global counter (Sentry/admin_events volume itself is the
 * cross-instance signal).
 */
const denialWindows = new Map<string, { count: number; windowStart: number }>();

/** Returns true when this call crosses STORM_THRESHOLD within the window, and resets the window. */
function trackDenialStorm(key: string): boolean {
  const now = Date.now();
  const existing = denialWindows.get(key);
  if (!existing || now - existing.windowStart > STORM_WINDOW_MS) {
    denialWindows.set(key, { count: 1, windowStart: now });
    return false;
  }
  existing.count += 1;
  if (existing.count > STORM_THRESHOLD) {
    // Reset so the storm tag fires once per crossing, not on every denial
    // for the remainder of the original window.
    denialWindows.set(key, { count: 0, windowStart: now });
    return true;
  }
  return false;
}

export function maybeCaptureRlsDenial(
  error: { code?: string | null; message?: string | null } | null | undefined,
  ctx: {
    table: string;
    verb: 'select' | 'insert' | 'update' | 'delete' | 'rpc';
    action: string;
    userId?: string | null;
    sport?: 'golf' | 'baseball' | 'shared';
    /** Defaults via featureForTable(ctx.table) from the registry when omitted. */
    feature?: FeatureKey;
  },
): void {
  if (!isRlsDenial(error)) return;
  try {
    const table = resolveDenialTable(ctx.table, error?.message);
    const feature = ctx.feature ?? featureForTable(table) ?? undefined;
    const isStorm = trackDenialStorm(`${table}:${ctx.verb}`);
    void logServerEvent(
      `RLS denial: ${ctx.verb} on ${table}`,
      {
        action: ctx.action,
        source: 'rls_denial',
        errorCode: error?.code ?? '42501',
        userId: ctx.userId ?? null,
        sport: ctx.sport,
        feature: feature ?? null,
        metadata: { table, verb: ctx.verb, message: error?.message ?? null },
        tags: isStorm ? { rls_denial_storm: 'true' } : undefined,
        // Routine denials stay admin-feed-only; a storm crossing the
        // threshold escalates to a real Sentry issue at 'error' severity.
        skipSentry: !isStorm,
      },
      isStorm ? 'error' : 'warning',
    ).catch(() => {});
  } catch {
    // Never break the caller.
  }
}
