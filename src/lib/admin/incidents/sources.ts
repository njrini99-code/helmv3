/**
 * Source health and freshness — "was the system actually watching?"
 *
 * WHY A SEPARATE MODULE. Every count the Bridge renders is only as true as the
 * reads behind it, and the four sources refresh on cadences an order of
 * magnitude apart: a Sentry pull is seconds old, the reliability snapshot is
 * up to three hours old, a deploy lookup is a live API call. A single global
 * "stale after N minutes" threshold therefore either cries wolf on the
 * collector or waves through a dead live pull — so each source carries its own
 * expectation, and this module is the one place those expectations live.
 *
 * The rule this encodes is the one `src/lib/reliability/types.ts` states for a
 * single collector run, lifted to the whole Bridge: an arm that could not be
 * read produced ABSENCE, not zero. A screen that renders a blind source as an
 * all-clear is worse than a screen that renders nothing, because it is
 * confidently wrong on exactly the question it exists to answer.
 */

import {
  INCIDENT_SOURCES,
  type FreshnessState,
  type IncidentSourceName,
  type SourceFreshness,
  type SourceHealth,
} from './types';

const MINUTE = 60_000;

/**
 * How often each source is expected to produce a fresh reading.
 *
 * `app`, `sentry` and `vercel` are read LIVE on every Bridge request, so their
 * expectation is a request, not a schedule — one minute is a generous ceiling
 * that still flags a response served from a stale cache. `supabase` reaches the
 * Bridge only through the 3-hourly reliability collector
 * (`/api/cron/reliability-triage`), so its expectation is that cadence.
 *
 * These are EXPECTATIONS, not SLAs. Exceeding one means "this reading is older
 * than you probably assume", which is the operator-relevant fact.
 */
export const SOURCE_EXPECTED_INTERVAL_MS: Readonly<Record<IncidentSourceName, number>> = {
  app: 1 * MINUTE,
  sentry: 1 * MINUTE,
  vercel: 5 * MINUTE,
  supabase: 180 * MINUTE,
};

/**
 * Aging starts at 1× the expectation and stale at 3×.
 *
 * Two multipliers rather than one because "later than expected" and "old
 * enough to stop trusting" are different operator decisions, and collapsing
 * them means a snapshot 4 minutes past a 3-hour cadence looks identical to one
 * from yesterday.
 */
const AGING_MULTIPLIER = 1;
const STALE_MULTIPLIER = 3;

export function classifyFreshness(
  ageMs: number | null,
  expectedIntervalMs: number,
): FreshnessState {
  // Not "fresh". We do not know, and the distinction is the entire point of
  // this module — see the header of `src/lib/admin/selfheal-registry.ts` for
  // the same rule applied to a stage that could not be read.
  if (ageMs === null || !Number.isFinite(ageMs)) return 'unknown';
  if (ageMs < 0) return 'unknown';
  if (ageMs > expectedIntervalMs * STALE_MULTIPLIER) return 'stale';
  if (ageMs > expectedIntervalMs * AGING_MULTIPLIER) return 'aging';
  return 'fresh';
}

export interface SourceReading {
  source: IncidentSourceName;
  health: SourceHealth;
  /** ISO time of the reading, or null when the source could not be read. */
  observedAt: string | null;
  reason?: string | null;
}

/**
 * Turn raw per-source readings into the freshness rows every surface renders.
 *
 * Always returns one row per member of `INCIDENT_SOURCES`, in that order — a
 * source missing from `readings` becomes `unknown`/`unknown` rather than being
 * omitted. An absent row renders as a shorter list, which reads as "there are
 * only three sources", and a source silently dropping out of a coverage matrix
 * is indistinguishable from one that is healthy.
 */
export function buildSourceFreshness(
  readings: readonly SourceReading[],
  now: number,
): SourceFreshness[] {
  const byName = new Map(readings.map((r) => [r.source, r]));
  return INCIDENT_SOURCES.map((source) => {
    const reading = byName.get(source);
    const observedAt = reading?.observedAt ?? null;
    const parsed = observedAt ? Date.parse(observedAt) : Number.NaN;
    const ageMs = Number.isFinite(parsed) ? now - parsed : null;
    const expectedIntervalMs = SOURCE_EXPECTED_INTERVAL_MS[source];
    const health = reading?.health ?? 'unknown';
    return {
      source,
      observedAt,
      ageMs,
      expectedIntervalMs,
      // A blind source has no meaningful freshness: whatever timestamp we hold
      // describes a read that did not happen. Reporting it as `fresh` because
      // the attempt was recent is precisely the unknown-as-healthy move.
      state: health === 'blind' ? 'unknown' : classifyFreshness(ageMs, expectedIntervalMs),
      health,
    } satisfies SourceFreshness;
  });
}

export interface CoverageSummary {
  reading: number;
  partial: number;
  blind: number;
  unknown: number;
  total: number;
  /** True when at least one source could not be read this refresh. */
  anyBlind: boolean;
  /** Sources that are blind, for naming them in the beacon. */
  blindSources: IncidentSourceName[];
  /** The oldest non-blind reading, which bounds how current the page is. */
  oldestAgeMs: number | null;
  /** Worst state across sources — what the Truth Strip cell shows. */
  worst: SourceHealth;
}

const HEALTH_SEVERITY: Readonly<Record<SourceHealth, number>> = {
  blind: 0,
  unknown: 1,
  partial: 2,
  reading: 3,
};

/**
 * One line for the Truth Strip and one decision for the blindness beacon.
 *
 * `worst` is the minimum, never an average or a majority: coverage is only
 * complete if every source is readable, so a mean would report healthy
 * coverage with a dead source in it. Same reasoning, and deliberately the same
 * shape, as `summarizeLoop` in `src/lib/admin/selfheal-registry.ts`.
 */
export function summarizeCoverage(rows: readonly SourceFreshness[]): CoverageSummary {
  const counts = { reading: 0, partial: 0, blind: 0, unknown: 0 };
  const blindSources: IncidentSourceName[] = [];
  let oldestAgeMs: number | null = null;
  let worst: SourceHealth = 'reading';

  for (const row of rows) {
    counts[row.health] += 1;
    if (row.health === 'blind') blindSources.push(row.source);
    if (row.health !== 'blind' && row.ageMs !== null) {
      oldestAgeMs = oldestAgeMs === null ? row.ageMs : Math.max(oldestAgeMs, row.ageMs);
    }
    if (HEALTH_SEVERITY[row.health] < HEALTH_SEVERITY[worst]) worst = row.health;
  }

  return {
    ...counts,
    total: rows.length,
    anyBlind: blindSources.length > 0,
    blindSources,
    oldestAgeMs,
    worst: rows.length === 0 ? 'unknown' : worst,
  };
}

/**
 * Whether the Bridge is allowed to render an all-clear right now.
 *
 * NEVER while a source is blind. "No incidents found" under an unreadable
 * Sentry is a claim the system is not entitled to make, and it is the single
 * most damaging empty state a monitoring surface can show — it converts a
 * broken read into a green screen. The Reliability tab already refuses this
 * for its own panel; this makes the rule global.
 */
export function canClaimAllClear(coverage: CoverageSummary): boolean {
  return !coverage.anyBlind && coverage.unknown === 0 && coverage.total > 0;
}

/** Operator-facing sentence for the beacon. Null when there is nothing to say. */
export function describeBlindness(
  rows: readonly SourceFreshness[],
  reasons: ReadonlyMap<IncidentSourceName, string | null>,
): string | null {
  const blind = rows.filter((r) => r.health === 'blind');
  if (blind.length === 0) return null;
  const parts = blind.map((row) => {
    const reason = reasons.get(row.source);
    const label = row.source.toUpperCase();
    return reason ? `${label} (${reason})` : label;
  });
  return `Reliability coverage incomplete — ${parts.join(', ')} could not be read this refresh.`;
}
