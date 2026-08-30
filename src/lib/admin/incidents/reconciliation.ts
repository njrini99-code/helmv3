/**
 * reconciliation.ts — whether Helm's two error surfaces AGREE.
 *
 * THE FAILURE THIS EXISTS FOR, measured 2026-08-30:
 *
 *     admin_events    0 errors in 48h
 *     Sentry         12 unresolved, several last seen 2-10h ago
 *
 * and the board rendered one surface's zero as "production is healthy". The two
 * surfaces have different jobs — `admin_events` is graded, Helm-handled faults;
 * Sentry is every captured runtime error, including ones Helm never saw — so
 * they are ALLOWED to differ. What is not allowed is one of them standing in
 * for production health while the other contradicts it.
 *
 * The contract is docs/OBSERVABILITY_AUTHORITY.md; this file is the part of it
 * a screen can render. Deliberately pure: no fetching, no React, no Supabase,
 * so every arm below is testable without a fixture.
 *
 * WHAT IT DOES NOT DO, per that contract:
 *   - it does not mirror Sentry events into admin_events (that would discard
 *     the severity grading that makes admin_events useful);
 *   - it does not silence Sentry issues Helm grades `info`;
 *   - it never resolves a disagreement by picking a winner. `unreconciled` is
 *     the answer, and it is neither good news nor bad news.
 */
import type { SourceHealth } from './types';

/** One surface's testimony: can it be read, and what is it saying. */
export interface SurfaceReading {
  health: SourceHealth;
  /**
   * Faults this surface is currently reporting. NULL when the surface could
   * not be read — which is not zero, and is the whole point of this module.
   */
  count: number | null;
}

/**
 * The overall verdict.
 *
 * `partial` is the state the board previously could not express, and it is the
 * common one: two surfaces that disagree without either being broken.
 */
export type OverallHealth = 'healthy' | 'degraded' | 'partial' | 'blind' | 'unknown';

export interface Reconciliation {
  application: { health: SourceHealth; count: number | null; state: 'healthy' | 'degraded' | 'unknown' };
  runtime: { health: SourceHealth; count: number | null; state: 'healthy' | 'degraded' | 'unknown' };
  overall: OverallHealth;
  /** One sentence a screen can render verbatim. Never empty. */
  note: string;
}

function stateOf(r: SurfaceReading): 'healthy' | 'degraded' | 'unknown' {
  if (r.health === 'blind' || r.health === 'unknown') return 'unknown';
  if (r.count === null) return 'unknown';
  return r.count > 0 ? 'degraded' : 'healthy';
}

/**
 * Reconcile the two surfaces.
 *
 * Order matters and is fail-safe: unreadability is decided BEFORE agreement,
 * because two surfaces cannot agree when one of them did not speak. A blind
 * source can never produce `healthy`, which is the same rule `canClaimAllClear`
 * applies to the page as a whole.
 */
export function reconcileErrorSurfaces(input: {
  application: SurfaceReading;
  runtime: SurfaceReading;
}): Reconciliation {
  const application = { ...input.application, state: stateOf(input.application) };
  const runtime = { ...input.runtime, state: stateOf(input.runtime) };

  const blind = [
    input.application.health === 'blind' ? 'application events' : null,
    input.runtime.health === 'blind' ? 'the runtime error surface' : null,
  ].filter(Boolean) as string[];

  if (blind.length) {
    return {
      application,
      runtime,
      overall: 'blind',
      note: `Cannot reconcile: ${blind.join(' and ')} could not be read. A blind surface is not a quiet one.`,
    };
  }

  if (application.state === 'unknown' || runtime.state === 'unknown') {
    return {
      application,
      runtime,
      overall: 'unknown',
      note: 'Cannot reconcile: one surface produced no reading this refresh.',
    };
  }

  if (application.state === runtime.state) {
    return {
      application,
      runtime,
      overall: application.state === 'healthy' ? 'healthy' : 'degraded',
      note:
        application.state === 'healthy'
          ? 'Both surfaces are quiet and agree.'
          : 'Both surfaces are reporting faults and agree that something is wrong.',
    };
  }

  const quiet = application.state === 'healthy' ? 'Application events' : 'The runtime error surface';
  const loud = application.state === 'healthy' ? 'the runtime error surface' : 'application events';
  const loudCount = application.state === 'healthy' ? runtime.count : application.count;
  return {
    application,
    runtime,
    overall: 'partial',
    note:
      `${quiet} is quiet while ${loud} reports ${loudCount}. ` +
      'They are allowed to differ — different jobs — but neither zero describes production on its own.',
  };
}

/** Row labels, so the board and its tests cannot drift apart. */
export const RECONCILIATION_ROW_LABEL = {
  application: 'APPLICATION EVENTS',
  runtime: 'RUNTIME ERROR SURFACE',
  overall: 'OVERALL',
} as const;

export const OVERALL_HEALTH_LABEL: Readonly<Record<OverallHealth, string>> = {
  healthy: 'healthy',
  degraded: 'degraded',
  partial: 'partial',
  blind: 'blind',
  unknown: 'unknown',
};
