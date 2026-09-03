/**
 * Evidence Braid (Bridge Premium Phase 3, `/admin/reliability`).
 *
 * "The six evidence sources over time for the selected feature" — the six
 * sources are `EVIDENCE_COVERAGE_SOURCES` in `incidents/coverage.ts` (sentry,
 * supabase, flight-recorder, vercel, github, jobs; verified as the
 * codebase's actual canonical six-source list, not the brief prose's
 * four-lane example). `coverage.ts`'s `buildEvidenceCoverage` is fully
 * built, tested and, before this module, imported by nothing — Phase 0 shipped
 * the per-incident evidence-coverage model but never wired a consumer.
 *
 * PER-BUCKET, NOT PER-INCIDENT. This module buckets a feature's incidents by
 * `firstSeen` and, per bucket, asks "did each of the six sources see
 * anything here" by aggregating that bucket's incidents' own per-source
 * reads. Multiple sources reading in the same bucket is the brief's
 * "converging signals become a correlation cluster" — literal converging
 * corroboration, not a new inference.
 *
 * WHAT IS AND ISN'T REAL EVIDENCE HERE, PER SOURCE:
 *  - sentry / supabase / vercel: read straight off `UnifiedIncident.sources`
 *    (`IncidentSourceEvidence`), which Phase 0 already populates per incident.
 *  - flight-recorder: from the caller-supplied `flightRecorderLinkedIds` —
 *    `null` means the trace store could not be read this refresh (the whole
 *    lane reads `blind`, not silently omitted); a `Set` means only the
 *    incidents actually correlated by `trace-incident-link.ts` read
 *    `reading`, everything else `unknown` — most incidents will read
 *    `unknown` here honestly, since that correlator is deliberately
 *    conservative.
 *  - github: from `UnifiedIncident.repair` — `null` (never checked) reads
 *    `unknown`; `status === 'unknown'` (a failed read) reads `blind`;
 *    `status === 'none'` (checked, no PR exists) reads `unknown` — GitHub was
 *    read but has nothing to corroborate with; anything else (a real PR
 *    reference exists) reads `reading`.
 *  - jobs: ALWAYS `unknown`. No incident-to-background-job linkage exists
 *    anywhere in this codebase (checked directly) — inventing one here would
 *    be exactly the fabricated evidence this repo's engineering OS forbids.
 */

import {
  EVIDENCE_COVERAGE_SOURCES,
  buildEvidenceCoverage,
  type EvidenceReading,
  type EvidenceCoverageCell,
  type EvidenceCoverageSource,
} from '@/lib/admin/incidents/coverage';
import type { SourceHealth } from '@/lib/admin/incidents/types';
import type { UnifiedIncident } from '@/lib/admin/incidents/types';
import type { FeatureKey } from '@/lib/admin/feature-registry';

const DEFAULT_BUCKET_COUNT = 12;
/** Used only when a feature has no incidents at all, so the view still has a
 *  window to render an empty timeline against. */
const DEFAULT_WINDOW_MS = 24 * 60 * 60_000;

function evidenceReadingsForIncident(
  incident: UnifiedIncident,
  flightRecorderLinkedIds: ReadonlySet<string> | null,
): EvidenceReading[] {
  const bySource = new Map(incident.sources.map((s) => [s.source, s] as const));
  const readings: EvidenceReading[] = [];

  for (const source of ['sentry', 'supabase', 'vercel'] as const) {
    const s = bySource.get(source);
    readings.push({ source, health: s?.health ?? 'unknown', reason: s?.reason ?? null });
  }

  if (flightRecorderLinkedIds === null) {
    readings.push({ source: 'flight-recorder', health: 'blind', reason: 'Flight Recorder trace store unreachable this refresh.' });
  } else {
    const linked = flightRecorderLinkedIds.has(incident.id);
    readings.push({
      source: 'flight-recorder',
      health: linked ? 'reading' : 'unknown',
      reason: linked ? null : 'No Flight Recorder trace linked to this incident.',
    });
  }

  const repair = incident.repair;
  if (!repair) {
    readings.push({ source: 'github', health: 'unknown', reason: 'GitHub was not checked for this incident.' });
  } else if (repair.status === 'unknown') {
    readings.push({ source: 'github', health: 'blind', reason: repair.note ?? 'The GitHub read failed.' });
  } else if (repair.status === 'none') {
    readings.push({ source: 'github', health: 'unknown', reason: 'No repair PR exists for this incident yet.' });
  } else {
    readings.push({ source: 'github', health: 'reading', reason: null });
  }

  readings.push({ source: 'jobs', health: 'unknown', reason: 'No incident-to-job linkage exists in this codebase yet.' });

  return readings;
}

/** Aggregate one source's readings across every incident in a bucket:
 *  'reading' beats 'partial' beats 'blind' beats 'unknown' — the best
 *  evidence any incident in the window actually has, never invented from
 *  the absence of a worse one. */
const HEALTH_RANK: Readonly<Record<SourceHealth, number>> = { reading: 3, partial: 2, blind: 1, unknown: 0 };

function aggregateSourceHealth(source: EvidenceCoverageSource, readings: readonly EvidenceReading[]): EvidenceReading {
  if (readings.length === 0) {
    return { source, health: 'unknown', reason: 'No incidents in this window.' };
  }
  return readings.reduce((a, b) => (HEALTH_RANK[b.health] > HEALTH_RANK[a.health] ? b : a));
}

export interface EvidenceBraidPoint {
  bucketStartMs: number;
  bucketEndMs: number;
  cells: readonly EvidenceCoverageCell[];
  /** Independent sources that read in this bucket — brief's "correlation
   *  cluster" size. */
  present: number;
  incidentIds: readonly string[];
}

export interface EvidenceBraidView {
  featureId: FeatureKey;
  windowStartMs: number;
  windowEndMs: number;
  bucketMs: number;
  points: readonly EvidenceBraidPoint[];
  /** True when the Flight Recorder read failed this refresh — every point's
   *  flight-recorder cell reads `blind`, board-wide, for the same reason. */
  flightRecorderBlind: boolean;
}

export interface BuildEvidenceBraidInput {
  featureId: FeatureKey;
  /** ALL incidents in the caller's window — this function does the feature
   *  filter itself, so a caller never has to duplicate that predicate. */
  incidents: readonly UnifiedIncident[];
  now: number;
  /** `null` when the Flight Recorder trace store could not be read this
   *  refresh; a `Set` of incident ids `trace-incident-link.ts` correlated. */
  flightRecorderLinkedIds: ReadonlySet<string> | null;
  bucketCount?: number;
}

/** Pure. See the module header for exactly which reads back each of the six lanes. */
export function buildEvidenceBraid(input: BuildEvidenceBraidInput): EvidenceBraidView {
  const bucketCount = input.bucketCount ?? DEFAULT_BUCKET_COUNT;
  const featureIncidents = input.incidents.filter((i) => i.featureId === input.featureId);

  const windowEndMs = input.now;
  const firstSeenMsValues = featureIncidents
    .map((i) => Date.parse(i.firstSeen))
    .filter((t) => !Number.isNaN(t));
  const windowStartMs =
    firstSeenMsValues.length > 0 ? Math.min(...firstSeenMsValues) : windowEndMs - DEFAULT_WINDOW_MS;

  const bucketMs = Math.max(1, Math.ceil((windowEndMs - windowStartMs) / bucketCount));

  const points: EvidenceBraidPoint[] = [];
  for (let i = 0; i < bucketCount; i += 1) {
    const bucketStartMs = windowStartMs + i * bucketMs;
    const bucketEndMs = bucketStartMs + bucketMs;

    const bucketIncidents = featureIncidents.filter((incident) => {
      const t = Date.parse(incident.firstSeen);
      if (Number.isNaN(t)) return false;
      return t >= bucketStartMs && t < bucketEndMs;
    });

    const perIncidentReadings = bucketIncidents.map((inc) => evidenceReadingsForIncident(inc, input.flightRecorderLinkedIds));

    const aggregated: EvidenceReading[] = EVIDENCE_COVERAGE_SOURCES.map((source) =>
      aggregateSourceHealth(
        source,
        perIncidentReadings.map((r) => r.find((x) => x.source === source)!),
      ),
    );

    const coverage = buildEvidenceCoverage(aggregated);

    points.push({
      bucketStartMs,
      bucketEndMs,
      cells: coverage.cells,
      present: coverage.present,
      incidentIds: bucketIncidents.map((inc) => inc.id),
    });
  }

  return {
    featureId: input.featureId,
    windowStartMs,
    windowEndMs,
    bucketMs,
    points,
    flightRecorderBlind: input.flightRecorderLinkedIds === null,
  };
}
