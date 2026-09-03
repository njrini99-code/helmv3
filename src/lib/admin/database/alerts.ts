import 'server-only';

/**
 * Helm Bridge — Alert policy reader (brief §49-55).
 *
 * Composes exactly the four readers named in Track C's own scope —
 * `overview` (Mission Control / collector health), `errors` (deduped
 * `db_error_events` fingerprint groups), `performance` (query-delta
 * regressions), `platform` (this phase's Metrics API model) — into
 * `AlertSignals` and hands them to the pure `evaluateAlertPolicy`
 * (`src/lib/observability/supabase/alert-policy.ts`). Nothing here reads
 * Sentry, Flight Recorder, or an integrity/RLS/webhook rollup — none of
 * those readers exist at the Bridge layer yet (see the per-rule notes
 * below), so their rules stay `unknown` by construction, which is the
 * honest answer and exactly what `evaluateAlertPolicy` does with an
 * omitted signal.
 *
 * PER-RULE DATA-SOURCE MAP — READ BEFORE ADDING A NEW SIGNAL
 * ------------------------------------------------------------------
 * Derivable from the four composed readers today:
 *   db_unavailable                        platform.dbUp
 *   pool_exhaustion                       overview.latestSample.connectionsPctMax
 *   schema_mismatch                       errors: 42P01/42703/42883 group present
 *   systematic_round_persistence_failure  errors: critical group whose RPC is
 *                                          save_partial_round_atomic/submit_round_atomic
 *   sustained_critical_rpc_timeout_rate   errors: 57014 group, occurrences >= threshold
 *   user_affecting_deadlock               errors: any 40P01 group at all
 *   sustained_resource_saturation         platform-rules: cpu/memory sustained-high
 *   performance_regression_no_failure     performance.recentRegressions
 *   elevated_retries                      errors: PGRST003 group fed through
 *                                          detectRetryStorm (CAVEAT: errors.ts sums
 *                                          occurrences across the WHOLE lookback
 *                                          window, not one hour bucket — this is a
 *                                          coarser signal than detectRetryStorm's own
 *                                          per-bucket design intends; documented, not
 *                                          hidden)
 *   sampler_stopped                       overview.collectors (this program's own
 *                                          db-health-sampler/db-stat-delta/prune jobs)
 *   metrics_api_unreadable                platform reader status === 'error'
 *                                          ('unconfigured' is an intentional disable,
 *                                          not a defect — reported clear, not firing)
 *
 * UNKNOWN by construction — no Bridge-level data source exists yet:
 *   critical_journey_data_loss, cross_tenant_rls_defect, mass_auth_5xx,
 *   realtime_critical_delivery_collapse, repeated_storage_database_timeout,
 *   missed_user_visible_cron (PRODUCT cron health, distinct from this
 *   program's own collectors above), bloat_vacuum, call_amplification,
 *   noncritical_webhook_failures, sentry_blind, flight_recorder_absent.
 */
import { fetchDatabaseMissionControl } from './overview';
import { fetchDatabaseErrors, type DbErrorFingerprintGroup } from './errors';
import { fetchQueryPerformance } from './performance';
import { fetchPlatformHealth } from './platform';
import {
  evaluateAlertPolicy,
  detectRetryStorm,
  type AlertPolicyResult,
  type AlertSignal,
  type AlertSignals,
} from '@/lib/observability/supabase/alert-policy';
import { evaluatePlatformRules, type PlatformSample } from '@/lib/observability/supabase/platform-rules';
import { ok, type AdminFetchResult } from '@/lib/admin/fetch-result';

const SCHEMA_DRIFT_CODES = new Set(['42P01', '42703', '42883']);
const ROUND_PERSISTENCE_RPCS = new Set(['save_partial_round_atomic', 'submit_round_atomic']);
const RPC_TIMEOUT_THRESHOLD_OCCURRENCES = 5;
const CONNECTIONS_PCT_MAX_CRITICAL = 0.9; // connectionsPctMax is a fraction (0-1), matching overview.ts's Intl 'percent' formatting

function known(firing: boolean, evidence?: string): AlertSignal {
  return { known: true, firing, ...(evidence !== undefined ? { evidence } : {}) };
}

function blind(reason: string): AlertSignal {
  return { known: false, reason };
}

function findGroup(
  groups: readonly DbErrorFingerprintGroup[],
  predicate: (g: DbErrorFingerprintGroup) => boolean,
): DbErrorFingerprintGroup | undefined {
  return groups.find(predicate);
}

export interface AlertPolicySnapshot extends AlertPolicyResult {
  /** Which of the four composed readers were actually readable this
   *  refresh — surfaced so the page can explain why a batch of rules read
   *  'unknown' beyond the per-rule data-source gaps above. */
  readerHealth: {
    overview: 'ok' | 'unconfigured' | 'error';
    errors: 'ok' | 'unconfigured' | 'error';
    performance: 'ok' | 'unconfigured' | 'error';
    platform: 'ok' | 'unconfigured' | 'error';
  };
}

export async function fetchAlertPolicy(): Promise<AdminFetchResult<AlertPolicySnapshot>> {
  const [overview, errors, performance, platform] = await Promise.all([
    fetchDatabaseMissionControl(),
    fetchDatabaseErrors(),
    fetchQueryPerformance(),
    fetchPlatformHealth(),
  ]);

  const signals: AlertSignals = {};

  // --- platform-derived ---------------------------------------------------
  if (platform.status !== 'ok' || !platform.data) {
    signals.db_unavailable = blind(platform.error ?? 'platform metrics reader unavailable');
    signals.metrics_api_unreadable =
      platform.status === 'unconfigured'
        ? known(false) // intentional disable — not a telemetry defect
        : known(true, platform.error ?? 'Supabase Metrics API unreadable');
    signals.sustained_resource_saturation = blind('platform metrics reader unavailable');
  } else {
    signals.db_unavailable = known(platform.data.dbUp === 0, 'Metrics API reports dbUp = 0');
    signals.metrics_api_unreadable = known(false);

    const sample: PlatformSample = {
      sampledAt: platform.data.sampledAt,
      dbUp: platform.data.dbUp,
      cpuPct: platform.data.cpuPct,
      memoryPct: platform.data.memoryPct,
    };
    const platformRuleEval = evaluatePlatformRules([sample]);
    const saturationCandidates = platformRuleEval.candidates.filter((c) => c.rule !== 'db_down');
    signals.sustained_resource_saturation =
      platformRuleEval.freshness === 'fresh'
        ? known(saturationCandidates.length > 0, saturationCandidates.map((c) => c.message).join('; '))
        : blind(`platform sample freshness: ${platformRuleEval.freshness}`);
  }

  // --- overview-derived (Mission Control) ---------------------------------
  if (overview.status !== 'ok' || !overview.data) {
    signals.pool_exhaustion = blind(overview.error ?? 'overview reader unavailable');
    signals.sampler_stopped = blind(overview.error ?? 'overview reader unavailable');
  } else {
    const pctMax = overview.data.latestSample?.connectionsPctMax ?? null;
    signals.pool_exhaustion =
      pctMax === null
        ? blind('no health sample yet')
        : known(pctMax >= CONNECTIONS_PCT_MAX_CRITICAL, `connectionsPctMax = ${pctMax}`);

    const unhealthyCollectors = overview.data.collectors.filter((c) => c.lastStatus !== 'completed');
    signals.sampler_stopped = known(
      unhealthyCollectors.length > 0,
      unhealthyCollectors.map((c) => `${c.jobType}: ${c.lastStatus}`).join('; '),
    );
  }

  // --- errors-derived -------------------------------------------------------
  if (errors.status !== 'ok' || !errors.data) {
    const reason = errors.error ?? 'errors reader unavailable';
    signals.schema_mismatch = blind(reason);
    signals.systematic_round_persistence_failure = blind(reason);
    signals.sustained_critical_rpc_timeout_rate = blind(reason);
    signals.user_affecting_deadlock = blind(reason);
    signals.elevated_retries = blind(reason);
  } else {
    const groups = errors.data.groups;

    const schemaGroup = findGroup(groups, (g) => Boolean(g.errorCode && SCHEMA_DRIFT_CODES.has(g.errorCode)));
    signals.schema_mismatch = known(
      Boolean(schemaGroup),
      schemaGroup ? `${schemaGroup.errorCode} on ${schemaGroup.feature}` : undefined,
    );

    const roundGroup = findGroup(
      groups,
      (g) => g.severity === 'critical' && Boolean(g.latest.rpcName && ROUND_PERSISTENCE_RPCS.has(g.latest.rpcName)),
    );
    signals.systematic_round_persistence_failure = known(
      Boolean(roundGroup),
      roundGroup ? `${roundGroup.latest.rpcName} critical, ${roundGroup.totalOccurrences}x` : undefined,
    );

    const timeoutGroup = findGroup(
      groups,
      (g) => g.errorCode === '57014' && g.totalOccurrences >= RPC_TIMEOUT_THRESHOLD_OCCURRENCES,
    );
    signals.sustained_critical_rpc_timeout_rate = known(
      Boolean(timeoutGroup),
      timeoutGroup ? `${timeoutGroup.totalOccurrences}x 57014 on ${timeoutGroup.feature}` : undefined,
    );

    const deadlockGroup = findGroup(groups, (g) => g.errorCode === '40P01');
    signals.user_affecting_deadlock = known(
      Boolean(deadlockGroup),
      deadlockGroup ? `40P01 on ${deadlockGroup.feature}` : undefined,
    );

    // Coarser than detectRetryStorm's per-hour-bucket design — see header.
    const retryEvents = groups
      .filter((g) => g.errorCode === 'PGRST003')
      .map((g) => ({
        fingerprint: g.fingerprint,
        mechanism: 'postgrest_client_retry' as const,
        attempt: null,
        occurrenceCount: g.totalOccurrences,
        timeBucket: g.lastSeenAt,
      }));
    const retryFindings = detectRetryStorm(retryEvents);
    signals.elevated_retries = known(
      retryFindings.length > 0,
      retryFindings.length > 0 ? `${retryFindings.length} PGRST003 fingerprint(s) over threshold (lookback-window total, not per-hour)` : undefined,
    );
  }

  // --- performance-derived ---------------------------------------------------
  if (performance.status !== 'ok' || !performance.data) {
    signals.performance_regression_no_failure = blind(performance.error ?? 'performance reader unavailable');
  } else {
    const regressions = performance.data.recentRegressions;
    signals.performance_regression_no_failure = known(
      regressions.length > 0,
      regressions.length > 0 ? `${regressions.length} flagged window(s) in the last 24h` : undefined,
    );
  }

  const baselineStatus: 'collecting' | 'ready' =
    overview.status === 'ok' && overview.data && overview.data.history.length >= 3 ? 'ready' : 'collecting';

  const policy = evaluateAlertPolicy(signals, { baselineStatus });

  return ok({
    ...policy,
    readerHealth: {
      overview: overview.status === 'ok' ? 'ok' : overview.status,
      errors: errors.status === 'ok' ? 'ok' : errors.status,
      performance: performance.status === 'ok' ? 'ok' : performance.status,
      platform: platform.status === 'ok' ? 'ok' : platform.status,
    },
  });
}
