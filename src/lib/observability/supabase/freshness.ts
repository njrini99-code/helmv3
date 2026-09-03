/**
 * Pure telemetry-source freshness classification (brief §35G, §40-48).
 *
 * SAME SHAPE AS src/lib/admin/incidents/sources.ts's classifyFreshness, but
 * a NEW, deliberately separate module rather than a reused import: that
 * module's states (fresh/aging/stale/unknown, two multipliers: 1x/3x) and
 * its `SOURCE_EXPECTED_INTERVAL_MS` table describe Bridge-wide sources
 * (Sentry, Vercel, the reliability collector). This one describes the
 * DATABASE OBSERVABILITY sources this Phase 2 track adds — different
 * vocabulary the task brief itself specifies (HEALTHY/DEGRADED/STALE/BLIND/
 * UNKNOWN, thresholds 1.5x/3x, not 1x/3x), and reusing the existing module
 * would either force its vocabulary onto a brief that names a different
 * one, or force a breaking rename onto every existing caller of
 * `classifyFreshness`. Two small pure modules that agree in spirit cost
 * less than one module trying to serve two specs.
 *
 * BLIND ALWAYS WINS OVER EVERYTHING, INCLUDING A FRESH TIMESTAMP. A source
 * that could not be READ (an RPC error, not "no rows yet") must classify as
 * `blind` regardless of what `lastSampleAt` says — the same "unknown is not
 * healthy" principle sources.ts's own header states, restated here because
 * it is the single most important line in this file and the easiest one to
 * get backwards by accident.
 */

export type FreshnessState = 'healthy' | 'degraded' | 'stale' | 'blind' | 'unknown';

const HEALTHY_MULTIPLIER = 1.5;
const STALE_MULTIPLIER = 3;

export interface ClassifySourceFreshnessInput {
  /** ISO timestamp of the most recent sample, or `null` if this source has
   *  never produced one. */
  lastSampleAt: string | null;
  expectedIntervalMs: number;
  now: Date;
  /** `false` when the source itself could not be read this refresh (an RPC
   *  error, a migration-not-applied degrade, a thrown exception) — distinct
   *  from `lastSampleAt === null`, which means the source WAS read
   *  successfully and genuinely has no data yet. */
  readable: boolean;
}

export function classifySourceFreshness(input: ClassifySourceFreshnessInput): FreshnessState {
  if (!input.readable) return 'blind';
  if (!input.lastSampleAt) return 'unknown';

  const ageMs = input.now.getTime() - new Date(input.lastSampleAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown';

  if (ageMs <= input.expectedIntervalMs * HEALTHY_MULTIPLIER) return 'healthy';
  if (ageMs <= input.expectedIntervalMs * STALE_MULTIPLIER) return 'degraded';
  return 'stale';
}

export interface TelemetrySource {
  name: string;
  state: FreshnessState;
  /** True when this source's product/collector is meant to always be
   *  producing telemetry (the health sampler, error store, etc). A source
   *  that is optional/not-yet-shipped can still render, but never drags the
   *  overall state down the same way a required blind source does. */
  required: boolean;
}

export type OverallTelemetryState = 'green' | 'degraded' | 'red' | 'unknown';

/**
 * The global rule the brief states explicitly: the overall view may not say
 * GREEN if a required source is blind or stale. `unknown`/`degraded` pull
 * the overall state down to `degraded`, never all the way to `red` — `red`
 * is reserved for a required source that is provably unreadable (`blind`)
 * or provably far behind schedule (`stale`), which are the two states that
 * mean "do not trust this board right now."
 */
export function summarizeTelemetryHealth(sources: readonly TelemetrySource[]): OverallTelemetryState {
  if (sources.length === 0) return 'unknown';

  const requiredBlindOrStale = sources.some((s) => s.required && (s.state === 'blind' || s.state === 'stale'));
  if (requiredBlindOrStale) return 'red';

  const anyBlindStaleUnknownOrDegraded = sources.some(
    (s) => s.state === 'blind' || s.state === 'stale' || s.state === 'unknown' || s.state === 'degraded',
  );
  if (anyBlindStaleUnknownOrDegraded) return 'degraded';

  return 'green';
}
