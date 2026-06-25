// =============================================================================
// src/components/baseball/source-trust/stamped-trust.ts
//
// Packet: qa-screens (Import Dossier + adapters — GAP 3: provenance READ)
//
// The single, shared mapping from the trust value STAMPED on a flat stat row at
// commit (baseball_player_stats.source_trust_level — a BaseballSourceTrustLevel)
// to the badge/drawer vocabulary (TrustLevel). Before this, the import path WROTE
// source_trust_level / source_match_tier / source_match_confidence / import_run_id
// onto every committed row, but NO read selected them — the snapshot cards derived
// trust from a hardcoded source STRING instead, so an imported row never showed
// its real provenance. Every flat-stat read model now threads the stamped columns
// through `buildStampedSourceTrust` + `buildImportProvenance` so the SAME chip +
// drawer the event path has appears on imported stats, coach AND player side.
//
// Pure module (no 'use client', no I/O) — safe from server read models.
// =============================================================================

import type { BaseballSourceTrustLevel } from '@/lib/types/baseball-settings';
import type {
  BaseballImportMatchTier,
  BaseballImportReviewState,
} from '@/lib/types/baseball-imports';
import { buildSourceTrust } from './build-source-trust';
import type {
  SourceTrust,
  SourceProvenance,
  TrustLevel,
} from './source-trust-types';

/**
 * Map the stamped stat `source_trust_level` to the badge `TrustLevel`. The two
 * vocabularies overlap almost 1:1; the only divergence is the import pipeline's
 * default 'unreviewed', which stays 'unreviewed' (the badge has the same tier).
 */
export function mapStampedTrustToTrustLevel(
  stamped: BaseballSourceTrustLevel | string | null | undefined,
): TrustLevel {
  switch (stamped) {
    case 'official':
      return 'official';
    case 'device_export':
      return 'device_export';
    case 'staff_entered':
      return 'staff_entered';
    case 'player_entered':
      return 'player_entered';
    case 'ai_derived':
      return 'ai_derived';
    case 'unreviewed':
      return 'unreviewed';
    default:
      // An import that never stamped a level (legacy row) reads as imported —
      // honest "came through the import pipeline" rather than a fabricated tier.
      return 'imported';
  }
}

/** Human label for the chosen-resolution tier, for the drawer's audit line. */
export function matchTierLabel(
  tier: BaseballImportMatchTier | string | null | undefined,
): string {
  switch (tier) {
    case 'external_id':
      return 'External ID match';
    case 'exact_roster':
      return 'Exact roster match';
    case 'name_jersey_class':
      return 'Name + jersey/class match';
    case 'fuzzy_name':
      return 'Fuzzy name match';
    case 'manual':
      return 'Manual assignment';
    case 'unmatched':
      return 'Unmatched';
    default:
      return 'Unknown resolution';
  }
}

/** The raw provenance columns a flat stat read model selects from a stat row. */
export interface StampedStatProvenance {
  source: string | null;
  source_trust_level: BaseballSourceTrustLevel | string | null;
  source_match_tier: BaseballImportMatchTier | string | null;
  source_match_confidence: number | null;
  source_external_id: string | null;
  import_run_id: string | null;
  /** Run-level review routing, joined from baseball_import_runs by import_run_id. */
  review_state?: BaseballImportReviewState | string | null;
  /** Whether a LATER run superseded/overwrote this stat's value (corrected). */
  corrected?: boolean | null;
  /** When the value was imported/observed (session_date or last_updated). */
  importedAt?: string | null;
}

/**
 * The select-list of provenance columns to add to any `baseball_player_stats`
 * read. Keep in sync with the columns applyImportPlan stamps (imports.ts).
 */
export const STAMPED_PROVENANCE_COLUMNS =
  'source, source_trust_level, source_match_tier, source_match_confidence, source_external_id, import_run_id';

/**
 * Build a render-ready SourceTrust from the stamped columns. `verified` is the
 * honest review state: a row whose run was approved reads verified; otherwise it
 * does not (the honesty rule — absence is never "verified").
 */
export function buildStampedSourceTrust(
  p: StampedStatProvenance,
  label: string,
): SourceTrust {
  const trustLevel = mapStampedTrustToTrustLevel(p.source_trust_level);
  const isOfficial = trustLevel === 'official';
  // An official feed or a device export both came from an external system, so the
  // canonical low-level kind is `integration`; everything else through the flat
  // import pipeline is `csv_import` (the only SourceKind values are manual /
  // csv_import / integration / ai / system / unknown — there is no `device`).
  const isIntegration = isOfficial || trustLevel === 'device_export';
  return buildSourceTrust({
    ref: {
      source: isIntegration ? 'integration' : 'csv_import',
      sourceId: p.import_run_id,
      label,
    },
    // source_match_confidence is already a 0..1 fraction on the row.
    confidence: p.source_match_confidence ?? null,
    captureMode: 'active_capture',
    trustLevel,
    // A row is verified only when its import run was explicitly approved by staff.
    verified: p.review_state === 'approved' || isOfficial,
  });
}

/**
 * Build the rich SourceProvenance for the drawer from the stamped columns. Opens
 * the run in the Import Dossier and surfaces the v10 badge fields: source name,
 * import run, confidence, reviewed/unreviewed, corrected/uncorrected, last updated.
 */
export function buildImportProvenance(
  p: StampedStatProvenance,
  opts: { label: string; mappedField?: string | null },
): SourceProvenance {
  const reviewed =
    p.review_state === 'approved'
      ? 'Reviewed'
      : p.review_state === 'pending_review'
        ? 'Awaiting review'
        : p.review_state === 'rejected'
          ? 'Rejected'
          : 'Not reviewed';
  const corrected = p.corrected ? 'Corrected by a later import' : 'Not corrected';

  const audit = [
    {
      at: p.importedAt ?? new Date(0).toISOString(),
      action: 'Imported',
      detail: `${reviewed} · ${corrected} · ${matchTierLabel(p.source_match_tier)}`,
    },
  ];

  return {
    ref: { source: 'csv_import', sourceId: p.import_run_id, label: opts.label },
    sourceName: opts.label,
    importedAt: p.importedAt ?? null,
    rowNumber: null,
    mappedField: opts.mappedField ?? null,
    relatedObjects: p.import_run_id
      ? [
          {
            kind: 'Import run',
            label: 'Open in Import Dossier',
            href: `/baseball/dashboard/import?run=${p.import_run_id}`,
          },
        ]
      : [],
    auditHistory: audit,
  };
}
