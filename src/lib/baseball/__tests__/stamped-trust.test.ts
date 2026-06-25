// =============================================================================
// src/lib/baseball/__tests__/stamped-trust.test.ts
//
// GAP 3 — locks the mapping that turns the import-STAMPED stat columns
// (source_trust_level / match tier / confidence / import_run_id / review_state)
// into the render-ready SourceTrust + SourceProvenance the badge + drawer consume.
// Before this, those columns were WRITE-ONLY; this is the read that finally makes a
// flat-imported stat carry the same provenance chip the event path has.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  mapStampedTrustToTrustLevel,
  matchTierLabel,
  buildStampedSourceTrust,
  buildImportProvenance,
  type StampedStatProvenance,
} from '@/components/baseball/source-trust/stamped-trust';

function base(overrides: Partial<StampedStatProvenance> = {}): StampedStatProvenance {
  return {
    source: 'import:trackman',
    source_trust_level: 'device_export',
    source_match_tier: 'external_id',
    source_match_confidence: 0.95,
    source_external_id: 'TM-123',
    import_run_id: 'run-1',
    review_state: 'not_required',
    importedAt: '2026-06-20',
    ...overrides,
  };
}

describe('mapStampedTrustToTrustLevel', () => {
  it('maps each known stamped level 1:1', () => {
    expect(mapStampedTrustToTrustLevel('official')).toBe('official');
    expect(mapStampedTrustToTrustLevel('device_export')).toBe('device_export');
    expect(mapStampedTrustToTrustLevel('staff_entered')).toBe('staff_entered');
    expect(mapStampedTrustToTrustLevel('player_entered')).toBe('player_entered');
    expect(mapStampedTrustToTrustLevel('ai_derived')).toBe('ai_derived');
    expect(mapStampedTrustToTrustLevel('unreviewed')).toBe('unreviewed');
  });

  it('falls back to "imported" for an unstamped/legacy row', () => {
    expect(mapStampedTrustToTrustLevel(null)).toBe('imported');
    expect(mapStampedTrustToTrustLevel(undefined)).toBe('imported');
    expect(mapStampedTrustToTrustLevel('something_else')).toBe('imported');
  });
});

describe('matchTierLabel', () => {
  it('labels each resolution tier', () => {
    expect(matchTierLabel('external_id')).toBe('External ID match');
    expect(matchTierLabel('manual')).toBe('Manual assignment');
    expect(matchTierLabel(null)).toBe('Unknown resolution');
  });
});

describe('buildStampedSourceTrust', () => {
  it('carries the stamped trust level + confidence', () => {
    const t = buildStampedSourceTrust(base(), 'TrackMan import');
    expect(t.trustLevel).toBe('device_export');
    expect(t.confidencePct).toBe(95);
    expect(t.kind).toBe('integration'); // device/official -> integration kind
  });

  it('is verified ONLY when the run was approved (or official)', () => {
    expect(buildStampedSourceTrust(base({ review_state: 'pending_review' }), 'x').verified).toBe(
      false,
    );
    expect(buildStampedSourceTrust(base({ review_state: 'approved' }), 'x').verified).toBe(true);
    expect(
      buildStampedSourceTrust(
        base({ source_trust_level: 'official', review_state: 'not_required' }),
        'x',
      ).verified,
    ).toBe(true);
  });

  it('a plain CSV import reads as kind csv_import', () => {
    const t = buildStampedSourceTrust(base({ source_trust_level: 'unreviewed' }), 'CSV');
    expect(t.kind).toBe('csv_import');
    expect(t.trustLevel).toBe('unreviewed');
  });

  it('null confidence renders as null (never a fake 0%)', () => {
    const t = buildStampedSourceTrust(base({ source_match_confidence: null }), 'x');
    expect(t.confidencePct).toBeNull();
  });
});

describe('buildImportProvenance', () => {
  it('links the import run + surfaces reviewed/corrected state in the audit', () => {
    const p = buildImportProvenance(base({ review_state: 'approved', corrected: true }), {
      label: 'TrackMan import',
      mappedField: 'exit_velocity',
    });
    expect(p.relatedObjects?.[0]?.kind).toBe('Import run');
    expect(p.relatedObjects?.[0]?.href).toContain('run=run-1');
    expect(p.mappedField).toBe('exit_velocity');
    const detail = p.auditHistory?.[0]?.detail ?? '';
    expect(detail).toContain('Reviewed');
    expect(detail).toContain('Corrected by a later import');
  });

  it('omits the related-run link when there is no import_run_id', () => {
    const p = buildImportProvenance(base({ import_run_id: null }), { label: 'Manual' });
    expect(p.relatedObjects).toEqual([]);
  });

  it('reads "Not reviewed" + "Not corrected" for an unreviewed, uncorrected row', () => {
    const p = buildImportProvenance(base({ review_state: 'not_required', corrected: false }), {
      label: 'x',
    });
    const detail = p.auditHistory?.[0]?.detail ?? '';
    expect(detail).toContain('Not reviewed');
    expect(detail).toContain('Not corrected');
  });
});
