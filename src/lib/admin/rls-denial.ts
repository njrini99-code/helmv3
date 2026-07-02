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
    const feature = ctx.feature ?? featureForTable(ctx.table) ?? undefined;
    void logServerEvent(
      `RLS denial: ${ctx.verb} on ${ctx.table}`,
      {
        action: ctx.action,
        source: 'rls_denial',
        errorCode: error?.code ?? '42501',
        userId: ctx.userId ?? null,
        sport: ctx.sport,
        feature: feature ?? null,
        metadata: { table: ctx.table, verb: ctx.verb, message: error?.message ?? null },
        skipSentry: true, // operational telemetry — admin feed, not a Sentry issue
      },
      'warning',
    ).catch(() => {});
  } catch {
    // Never break the caller.
  }
}
