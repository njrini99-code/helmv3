// NOTE: '@/lib/server-error-logger' is imported LAZILY, inside a
// `typeof window === 'undefined'` guard, rather than statically at the top of
// this module. That module is `server-only` (it writes via the service-role
// admin client), but this file is reached from client components through
// fetch-all-rows.ts -> use-calendar-range-events.ts / use-task-realtime.ts. A
// static import therefore pulled server-only code — plus createAdminClient and
// node:async_hooks — into the client graph and hard-failed the build.
// Client-side logging was never functional anyway: createAdminClient needs
// SUPABASE_SERVICE_ROLE_KEY, which does not exist in the browser.
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

/**
 * In-flight capture writes.
 *
 * The logger is imported lazily (see the note at the top of this file), so a
 * capture completes a microtask or two AFTER `maybeCaptureRlsDenial` has
 * already returned. The boolean return has to stay synchronous — every call
 * site uses it to gate its own logging in a sync branch — so the promise is
 * parked here instead of thrown away.
 *
 * That gives two things a bare `void import(...)` could not:
 *   - `flushRlsDenialLogs()` for callers that CAN wait (a route handler's
 *     `after()`, a cron tick) and would rather not lose the denial to an
 *     instance teardown;
 *   - a deterministic await for tests, which previously asserted on the mock
 *     before the dynamic import had resolved and saw zero calls.
 */
let pendingCaptures: Promise<void>[] = [];

/**
 * Awaits every capture started so far. Safe to call when none are pending.
 * Not required for correctness — captures still complete on their own — but
 * it is the difference between "probably logged" and "logged".
 */
export async function flushRlsDenialLogs(): Promise<void> {
  const inFlight = pendingCaptures;
  pendingCaptures = [];
  await Promise.allSettled(inFlight);
}

/**
 * Returns true when `error` was classified as an RLS denial (and a capture
 * was fired), false otherwise. Callers use this to gate their OWN generic
 * error logging — an RLS denial should produce exactly one admin_events
 * row (this capture), not one from here PLUS a second, generic one from
 * the caller. See savePartialRound in golf.ts for the canonical caller.
 *
 * The capture itself is asynchronous; await `flushRlsDenialLogs()` if you
 * need it durably written before the current context can be torn down.
 */
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
): boolean {
  if (!isRlsDenial(error)) return false;
  try {
    const table = resolveDenialTable(ctx.table, error?.message);
    const feature = ctx.feature ?? featureForTable(table) ?? undefined;
    const isStorm = trackDenialStorm(`${table}:${ctx.verb}`);
    if (typeof window === 'undefined') {
      pendingCaptures.push(
        import('@/lib/server-error-logger')
        .then(({ logServerEvent }) =>
          logServerEvent(
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
          ),
        )
          .then(() => undefined)
          .catch(() => {}),
      );
    }
  } catch {
    // Never break the caller.
  }
  return true;
}
