import 'server-only';

/**
 * Incident-model adapter for the `'database'` source — brief §35's "G.
 * Telemetry Health" and the Bridge's own coverage model
 * (`src/lib/admin/incidents/sources.ts`).
 *
 * Produces one `SourceReading` in the exact shape `buildSourceFreshness`
 * (`sources.ts`) consumes, sourced from `fetchDatabaseMissionControl()`
 * (`src/lib/admin/database/overview.ts`) — the same Mission Control snapshot
 * the `/admin/database` page itself renders. This file does not decide
 * anything new about database health; it only RESHAPES an existing read into
 * the vocabulary the incident-correlation layer already understands
 * (`reading` / `partial` / `blind` / `unknown`).
 *
 * NOT WIRED INTO `fetchIncidentBoard` YET. That is a deliberate, narrow
 * scoping decision — see `./types.ts`'s header comment on the `'database'`
 * enum entry for the full reasoning (this is the Bridge track's file to
 * edit, not this program's). The one-line fix, when that track picks it up,
 * is adding this reading to the `readings` array `fetchIncidentBoard` builds
 * in `fetch.ts` (alongside `app`, `sentryHealth`, and `...reliability.health`
 * — see that file's `sourceHealth` construction around line 573):
 *
 *   const databaseHealth = await readDatabaseObservabilitySourceHealth(now);
 *   const sourceHealth: CorrelationSourceHealth[] = [
 *     { source: 'app', health: 'reading', reason: null, observedAt: nowIso },
 *     sentryHealth,
 *     databaseHealth,
 *     ...reliability.health,
 *   ];
 *
 * Until that lands, `canClaimAllClear` can never return `true` for any
 * board built from that array, because `'database'` is now a member of
 * `INCIDENT_SOURCES` with no reading supplied — `buildSourceFreshness`'s own
 * documented fallback reports an absent source as `health: 'unknown'`, never
 * as healthy.
 */
import { fetchDatabaseMissionControl } from '@/lib/admin/database/overview';
import type { SourceReading } from './sources';

export async function readDatabaseObservabilitySourceHealth(): Promise<SourceReading> {
  const result = await fetchDatabaseMissionControl();

  if (result.status === 'unconfigured') {
    // The health-sampler migration is HELD — this is "not shipped yet", the
    // same distinction `overview.ts`'s own `notApplied` flag draws, not a
    // failed read. `unknown` (not `blind`) is deliberate: nothing was
    // attempted and failed, there is simply nothing to attempt yet.
    return {
      source: 'database',
      health: 'unknown',
      observedAt: null,
      reason: result.error ?? 'database observability migrations not applied yet (see supabase/migrations/HELD.md)',
    };
  }

  if (result.status === 'error' || !result.data) {
    return {
      source: 'database',
      health: 'blind',
      observedAt: null,
      reason: result.error ?? 'Database Mission Control read failed',
    };
  }

  const latest = result.data.latestSample;
  if (!latest) {
    return {
      source: 'database',
      health: 'unknown',
      observedAt: null,
      reason: 'db-health-sampler has not written its first row yet',
    };
  }

  // A collector that ran but reported a degraded window (see
  // `overview.ts`'s `DbHealthSampleRow.collectorStatus`) read SOMETHING,
  // just not everything — 'partial' matches how `fetch.ts` already treats
  // an app source that reads one arm and is blind on another.
  return {
    source: 'database',
    health: latest.collectorStatus === 'ok' ? 'reading' : 'partial',
    observedAt: latest.sampledAt,
    reason: latest.collectorStatus === 'ok' ? null : `latest collector_status: ${latest.collectorStatus}`,
  };
}
