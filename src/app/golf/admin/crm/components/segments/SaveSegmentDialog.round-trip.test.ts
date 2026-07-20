// ============================================================================
// SaveSegmentDialog.round-trip.test.ts — save -> apply field-by-field contract
// ----------------------------------------------------------------------------
// Regression guard for two audit findings on saved segments:
//
//   CRITICAL — saving a segment silently dropped primaryOnly, queueStatus,
//   overdueFollowUp, and noNextStep because SaveSegmentDialog's `definition`
//   literal only copied a subset of Filters. Fixed by routing every save
//   through filtersToSegmentDefinition(), an exhaustive field-for-field
//   mapping (no `...filters` spread, so a Filters field added without a
//   matching line here is a compile error, not a silent drop).
//
//   HIGH — applying a saved segment MERGED its definition onto whatever
//   filters happened to be active (`{ ...current, ...segment.definition }`),
//   so a facet that was on before applying the segment but absent from the
//   saved definition leaked through unchanged. Fixed by applySegmentDefinition()
//   always starting from DEFAULT_FILTERS and overlaying the saved definition —
//   a full replace, never a merge onto prior state.
//
// This file is the contract: when Filters (CoachFilters.tsx) gains a new
// field, extend `fullyPopulatedFilters` below with a non-default value for
// it. TypeScript already fails the literal if the new field is required;
// optional additions need this object updated by hand so they're actually
// exercised.
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import type { Filters } from '../CoachFilters';
import { filtersToSegmentDefinition } from './SaveSegmentDialog';
import { applySegmentDefinition, DEFAULT_FILTERS } from './SavedSegmentsRail';

// SaveSegmentDialog/SavedSegmentsRail import the real server-action module
// (createSegment / listSegments / deleteSegment / updateSegment). None of
// those are invoked by the pure functions under test here, so mock the
// module wholesale rather than let real `'use server'` action code load —
// same pattern as CreateTaskDialog.test.tsx. `vi.mock` is hoisted above
// these imports by Vitest regardless of source order.
vi.mock('@/app/golf/actions/crm-foundations', () => ({
  createSegment: vi.fn(),
  listSegments: vi.fn(),
  deleteSegment: vi.fn(),
  updateSegment: vi.fn(),
}));

// Every field on Filters set to a non-default value so a silently-dropped
// field surfaces as a failed assertion instead of a false-positive pass via
// coincidental defaults (e.g. a bug that drops `starred` would be invisible
// if this fixture left `starred: false`).
const fullyPopulatedFilters: Filters = {
  status: 'engaged',
  division: 'JUCO_D2',
  conference: 'ACC',
  program: 'womens',
  priority: '2',
  search: 'nick rini',
  followUpDue: true,
  starred: true,
  hasNotes: true,
  noContact30Days: true,
  primaryOnly: true,
  queueStatus: 'sent',
  overdueFollowUp: true,
  noNextStep: true,
};

describe('saved segment save -> apply round trip (contract)', () => {
  it('persists and restores every Filters field exactly', () => {
    const definition = filtersToSegmentDefinition(fullyPopulatedFilters);
    const restored = applySegmentDefinition(definition);

    (Object.keys(fullyPopulatedFilters) as Array<keyof Filters>).forEach((key) => {
      expect(restored[key]).toEqual(fullyPopulatedFilters[key]);
    });
  });

  it('replaces rather than merges: a sparse saved segment resets every unset facet to default, never leaking a stale value', () => {
    // A segment saved with only `division` touched — every other facet
    // should come back at its DEFAULT_FILTERS value, not whatever happened
    // to be active in the caller before applying.
    const sparseDefinition = filtersToSegmentDefinition({
      ...DEFAULT_FILTERS,
      division: 'D1',
    });

    const restored = applySegmentDefinition(sparseDefinition);

    expect(restored).toEqual({ ...DEFAULT_FILTERS, division: 'D1' });
    expect(restored.primaryOnly).toBe(false);
    expect(restored.starred).toBe(false);
    expect(restored.queueStatus).toBe('all');
    expect(restored.overdueFollowUp).toBe(false);
    expect(restored.noNextStep).toBe(false);
  });
});
