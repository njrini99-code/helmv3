/**
 * Evidence-source coverage — per-incident ✓ / ? / blind (brief §36).
 *
 * WHY A SEPARATE MODEL FROM `sources.ts`. `sources.ts` answers "was the
 * BOARD watching?" over the four sources the correlation join already knows
 * (`app`, `sentry`, `supabase`, `vercel`) and is exercised on every refresh.
 * This module answers a narrower, per-incident question the brief asks for
 * explicitly — "Sentry ✓ · Supabase ✓ · Flight Recorder ✓ · Vercel ?" on ONE
 * incident's Evidence tab — over a WIDER set of six sources that includes two
 * `sources.ts` has no opinion on (Flight Recorder, GitHub, background jobs).
 * `EvidenceCoverageSource` is deliberately a distinct union from
 * `IncidentSourceName` rather than a superset cast, so a caller cannot pass a
 * board-level `CoverageSummary` where a per-incident one belongs and have it
 * silently typecheck.
 *
 * REUSES THE SAME VOCABULARY, NOT A NEW ONE. Per the brief ("reuse
 * truth-strip.ts's source states"), a cell's underlying state is `SourceHealth`
 * — the exact `'reading' | 'partial' | 'blind' | 'unknown'` union `types.ts`
 * defines and `sources.ts`/`truth-strip.ts` already render. This module only
 * adds the ✓/?/blind PRESENTATION on top of it; it does not invent a second
 * health vocabulary.
 *
 * NEVER UNKNOWN AS ZERO. A source this incident never got a reading for is
 * `unknown`, not absent from the table and not folded into "0 sources saw
 * this" — the same rule `sources.ts`'s header states for the board-level
 * coverage matrix, applied here at the single-incident grain. `present`
 * counts only cells that actually read; `total` is always the full six, so a
 * caller can never compute "6/6" by omission.
 */

import type { SourceHealth } from './types';

export const EVIDENCE_COVERAGE_SOURCES = [
  'sentry',
  'supabase',
  'flight-recorder',
  'vercel',
  'github',
  'jobs',
] as const;

export type EvidenceCoverageSource = (typeof EVIDENCE_COVERAGE_SOURCES)[number];

export const EVIDENCE_COVERAGE_SOURCE_LABEL: Readonly<Record<EvidenceCoverageSource, string>> = {
  sentry: 'Sentry',
  supabase: 'Supabase',
  'flight-recorder': 'Flight Recorder',
  vercel: 'Vercel',
  github: 'GitHub',
  jobs: 'Jobs',
};

/** The three glyphs the brief names verbatim: "✓ / ? / blind". */
export type CoverageMark = 'check' | 'question' | 'blind';

export const COVERAGE_MARK_GLYPH: Readonly<Record<CoverageMark, string>> = {
  check: '✓',
  question: '?',
  blind: 'blind',
};

function markFromHealth(health: SourceHealth): CoverageMark {
  switch (health) {
    case 'reading':
      return 'check';
    case 'blind':
      return 'blind';
    case 'partial':
    case 'unknown':
      // Both read as "?" — a partial read and a read we never attempted are
      // different REASONS but the same operator instruction: do not trust
      // this cell as complete evidence. `reason` is what tells them apart.
      return 'question';
  }
}

export interface EvidenceReading {
  source: EvidenceCoverageSource;
  health: SourceHealth;
  /** Why this cell is not a clean ✓. Required whenever health !== 'reading'. */
  reason: string | null;
}

export interface EvidenceCoverageCell {
  source: EvidenceCoverageSource;
  mark: CoverageMark;
  health: SourceHealth;
  /** Never null when `mark !== 'check'` — see `buildEvidenceCoverage`. */
  reason: string | null;
}

export interface EvidenceSourceCoverage {
  cells: readonly EvidenceCoverageCell[];
  /** Cells that actually read (`mark === 'check'`). */
  present: number;
  /** Always `EVIDENCE_COVERAGE_SOURCES.length` — the six sources, not "however many replied". */
  total: number;
  anyBlind: boolean;
  /** Sources genuinely never attempted for this incident, distinct from a partial or failed read. */
  unknownSources: readonly EvidenceCoverageSource[];
  blindSources: readonly EvidenceCoverageSource[];
}

function defaultReason(source: EvidenceCoverageSource, health: SourceHealth): string {
  const label = EVIDENCE_COVERAGE_SOURCE_LABEL[source];
  if (health === 'blind') return `${label} could not be read for this incident.`;
  if (health === 'partial') return `${label} read incompletely for this incident.`;
  return `No ${label} read was attempted for this incident.`;
}

/**
 * Build the six-cell coverage row for one incident.
 *
 * Always returns one cell per `EVIDENCE_COVERAGE_SOURCES` member, in that
 * order — a source missing from `readings` becomes an explicit `unknown`
 * cell rather than being dropped, for the identical reason
 * `buildSourceFreshness` (`sources.ts`) always returns one row per
 * `INCIDENT_SOURCES`: a source silently absent from a coverage matrix reads
 * as "there are only five sources", which is the same class of lie as
 * rendering a blind source as healthy.
 */
export function buildEvidenceCoverage(readings: readonly EvidenceReading[]): EvidenceSourceCoverage {
  const bySource = new Map(readings.map((r) => [r.source, r] as const));

  const cells: EvidenceCoverageCell[] = EVIDENCE_COVERAGE_SOURCES.map((source) => {
    const reading = bySource.get(source);
    const health = reading?.health ?? 'unknown';
    const mark = markFromHealth(health);
    const reason = mark === 'check' ? null : (reading?.reason ?? defaultReason(source, health));
    return { source, mark, health, reason };
  });

  const present = cells.filter((c) => c.mark === 'check').length;
  const blindSources = cells.filter((c) => c.mark === 'blind').map((c) => c.source);
  const unknownSources = cells.filter((c) => c.health === 'unknown').map((c) => c.source);

  return {
    cells,
    present,
    total: cells.length,
    anyBlind: blindSources.length > 0,
    unknownSources,
    blindSources,
  };
}

/**
 * One operator-readable line — "Evidence 3/6 · Sentry ✓ · Supabase ✓ ·
 * Flight Recorder ✓ · Vercel ? · GitHub blind · Jobs ?" — never "0 sources",
 * always naming which ones and why.
 */
export function describeEvidenceCoverage(coverage: EvidenceSourceCoverage): string {
  const cellWords = coverage.cells
    .map((c) => `${EVIDENCE_COVERAGE_SOURCE_LABEL[c.source]} ${COVERAGE_MARK_GLYPH[c.mark]}`)
    .join(' · ');
  return `Evidence ${coverage.present}/${coverage.total} · ${cellWords}`;
}

/**
 * Whether this incident's evidence is complete enough to trust a claim built
 * from it (mirrors `canClaimAllClear` in `sources.ts` at the incident grain).
 * Never true while any source is blind OR unread — a caller wanting "at
 * least corroborated" rather than "fully complete" should read
 * `coverage.present` directly instead of this stricter gate.
 */
export function isEvidenceComplete(coverage: EvidenceSourceCoverage): boolean {
  return coverage.present === coverage.total;
}
