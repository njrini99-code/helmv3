// =============================================================================
// src/lib/lifting/__tests__/overuse-rules.test.ts
//
// Unit tests for all 6 overuse-detection rules in overuse-rules.ts (spec §13).
//
// Coverage targets:
//   Rule 1 — highSeverity        (threshold: severity >= 7)
//   Rule 2 — recurringRegion     (threshold: 3+ occurrences in 7 days)
//   Rule 3 — worsening           (threshold: delta >= +3 over window)
//   Rule 4 — throwingArmConcern  (CRITICAL boundary: 4 = no flag, 5+ = flag)
//   Rule 5 — lowerBodyLiftConflict (threshold: severity >= 6 + lift day)
//   Rule 6 — missedCheckins      (threshold: 2+ in 7-day window)
//
// Each rule is tested at: below threshold, at threshold, above threshold,
// empty input, and relevant edge cases.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  highSeverity,
  recurringRegion,
  worsening,
  throwingArmConcern,
  lowerBodyLiftConflict,
  missedCheckins,
  runAllOveruseRules,
  type SorenessMapEntry,
  type MissedCheckinEntry,
} from '@/lib/lifting/overuse-rules';
import { isSorenessRegionId } from '@/lib/lifting/soreness-regions';

// ---------------------------------------------------------------------------
// Fixture helpers — typed builders so tests are concise
// ---------------------------------------------------------------------------

function entry(
  athleteId: string,
  regionId: SorenessMapEntry['region_id'],
  severity: number,
  checkin_date: string,
): SorenessMapEntry {
  return { athlete_id: athleteId, region_id: regionId, severity, checkin_date };
}

function missed(athleteId: string, due_date: string): MissedCheckinEntry {
  return { athlete_id: athleteId, due_date };
}

// ===========================================================================
// E1 gate — isSorenessRegionId accepts general_fatigue after §E1 addition
// ===========================================================================

describe('soreness-regions: general_fatigue (E1)', () => {
  it('accepts general_fatigue as a valid SorenessRegionId', () => {
    expect(isSorenessRegionId('general_fatigue')).toBe(true);
  });

  it('rejects strings that are not valid region IDs', () => {
    expect(isSorenessRegionId('whole_body')).toBe(false);
    expect(isSorenessRegionId('fatigue')).toBe(false);
    expect(isSorenessRegionId('')).toBe(false);
    expect(isSorenessRegionId('GENERAL_FATIGUE')).toBe(false);
  });
});

// ===========================================================================
// Rule 1 — highSeverity (any region >= 7)
// ===========================================================================

describe('highSeverity (Rule 1)', () => {
  it('returns no flags for empty input', () => {
    expect(highSeverity([])).toHaveLength(0);
  });

  it('does NOT flag severity 6 (one below threshold)', () => {
    const flags = highSeverity([entry('a1', 'left_shoulder', 6, '2026-06-25')]);
    expect(flags).toHaveLength(0);
  });

  it('flags severity 7 (at threshold)', () => {
    const flags = highSeverity([entry('a1', 'left_shoulder', 7, '2026-06-25')]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.kind).toBe('high_severity');
    expect(flags[0]!.athleteId).toBe('a1');
    expect(flags[0]!.regionId).toBe('left_shoulder');
    expect(flags[0]!.severity).toBe(7);
  });

  it('flags severity 10 (maximum)', () => {
    const flags = highSeverity([entry('a1', 'right_elbow', 10, '2026-06-25')]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe(10);
  });

  it('produces one flag per entry that meets the threshold', () => {
    const entries = [
      entry('a1', 'left_shoulder', 8, '2026-06-25'), // flag
      entry('a1', 'right_elbow', 5, '2026-06-25'),   // below — no flag
      entry('a2', 'groin', 7, '2026-06-25'),          // flag
    ];
    expect(highSeverity(entries)).toHaveLength(2);
  });

  it('works on general_fatigue region (no baseballRiskGroup required)', () => {
    const flags = highSeverity([entry('a1', 'general_fatigue', 8, '2026-06-25')]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.regionId).toBe('general_fatigue');
  });
});

// ===========================================================================
// Rule 2 — recurringRegion (same region 3+ times in any 7-day window)
// ===========================================================================

describe('recurringRegion (Rule 2)', () => {
  it('returns no flags for empty input', () => {
    expect(recurringRegion([])).toHaveLength(0);
  });

  it('does NOT flag 2 occurrences within 7 days (below threshold)', () => {
    const flags = recurringRegion([
      entry('a1', 'left_knee', 5, '2026-06-20'),
      entry('a1', 'left_knee', 4, '2026-06-24'),
    ]);
    expect(flags).toHaveLength(0);
  });

  it('flags 3 occurrences within 7 days (at threshold)', () => {
    // Jun 19 → Jun 25 = 6 days; all 3 within a single 7-day window
    const flags = recurringRegion([
      entry('a1', 'right_shoulder', 3, '2026-06-19'),
      entry('a1', 'right_shoulder', 4, '2026-06-22'),
      entry('a1', 'right_shoulder', 5, '2026-06-25'),
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.kind).toBe('recurring_region');
    expect(flags[0]!.regionId).toBe('right_shoulder');
    expect(flags[0]!.athleteId).toBe('a1');
  });

  it('does NOT flag 3 occurrences when spread exceeds 7 days from every anchor', () => {
    // Jun 16 → Jun 20 = 4 days; Jun 16 → Jun 25 = 9 days (breaks early)
    // Anchor Jun 16: count = 2 (Jun 16, Jun 20) → no flag
    // Anchor Jun 20: count = 2 (Jun 20, Jun 25) → no flag
    const flags = recurringRegion([
      entry('a1', 'left_hamstring', 4, '2026-06-16'),
      entry('a1', 'left_hamstring', 5, '2026-06-20'),
      entry('a1', 'left_hamstring', 6, '2026-06-25'),
    ]);
    expect(flags).toHaveLength(0);
  });

  it('emits exactly one flag per athlete×region even with 4+ occurrences in window', () => {
    const flags = recurringRegion([
      entry('a1', 'neck', 3, '2026-06-19'),
      entry('a1', 'neck', 4, '2026-06-21'),
      entry('a1', 'neck', 5, '2026-06-23'),
      entry('a1', 'neck', 6, '2026-06-25'),
    ]);
    expect(flags).toHaveLength(1);
  });

  it('flags each athlete independently for the same region', () => {
    const entries = [
      entry('a1', 'abs_core', 4, '2026-06-19'),
      entry('a1', 'abs_core', 5, '2026-06-22'),
      entry('a1', 'abs_core', 6, '2026-06-25'),
      entry('a2', 'abs_core', 3, '2026-06-19'),
      entry('a2', 'abs_core', 4, '2026-06-22'),
      entry('a2', 'abs_core', 5, '2026-06-25'),
    ];
    const flags = recurringRegion(entries);
    expect(flags).toHaveLength(2);
    const athletes = flags.map((f) => f.athleteId).sort();
    expect(athletes).toEqual(['a1', 'a2']);
  });

  it('does NOT cross athlete boundaries when counting occurrences', () => {
    // 3 occurrences total but split across two athletes — neither should flag
    const flags = recurringRegion([
      entry('a1', 'mid_back', 4, '2026-06-20'),
      entry('a2', 'mid_back', 5, '2026-06-22'),
      entry('a1', 'mid_back', 6, '2026-06-24'),
    ]);
    // a1: 2 occurrences → no flag; a2: 1 occurrence → no flag
    expect(flags).toHaveLength(0);
  });
});

// ===========================================================================
// Rule 3 — worsening (same region, severity increased >= +3 over window)
// ===========================================================================

describe('worsening (Rule 3)', () => {
  it('returns no flags for empty input', () => {
    expect(worsening([])).toHaveLength(0);
  });

  it('returns no flags for a single entry (no comparison possible)', () => {
    expect(worsening([entry('a1', 'lower_back', 5, '2026-06-25')])).toHaveLength(0);
  });

  it('does NOT flag delta of +2 (one below threshold)', () => {
    const flags = worsening([
      entry('a1', 'lower_back', 3, '2026-06-19'),
      entry('a1', 'lower_back', 5, '2026-06-25'),
    ]);
    expect(flags).toHaveLength(0);
  });

  it('flags delta of +3 (at threshold)', () => {
    const flags = worsening([
      entry('a1', 'lower_back', 3, '2026-06-19'),
      entry('a1', 'lower_back', 6, '2026-06-25'),
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.kind).toBe('worsening');
    expect(flags[0]!.regionId).toBe('lower_back');
    expect(flags[0]!.severity).toBe(6); // latest severity
  });

  it('flags delta of +4 (above threshold)', () => {
    const flags = worsening([
      entry('a1', 'right_knee', 2, '2026-06-19'),
      entry('a1', 'right_knee', 6, '2026-06-25'),
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe(6);
  });

  it('does NOT flag decreasing severity (delta -3 is not worsening)', () => {
    const flags = worsening([
      entry('a1', 'left_calf', 8, '2026-06-19'),
      entry('a1', 'left_calf', 5, '2026-06-25'),
    ]);
    expect(flags).toHaveLength(0);
  });

  it('does NOT flag stable severity (delta 0)', () => {
    const flags = worsening([
      entry('a1', 'chest', 5, '2026-06-19'),
      entry('a1', 'chest', 5, '2026-06-25'),
    ]);
    expect(flags).toHaveLength(0);
  });

  it('handles multiple athletes × regions independently', () => {
    const flags = worsening([
      entry('a1', 'right_hip', 2, '2026-06-19'),
      entry('a1', 'right_hip', 5, '2026-06-25'), // delta +3 → flag
      entry('a2', 'left_quad', 4, '2026-06-19'),
      entry('a2', 'left_quad', 6, '2026-06-25'), // delta +2 → no flag
    ]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.athleteId).toBe('a1');
  });
});

// ===========================================================================
// Rule 4 — throwingArmConcern
// CRITICAL boundary: severity 4 = no flag; severity 5+ = flag
// ===========================================================================

describe('throwingArmConcern (Rule 4)', () => {
  it('returns no flags for empty input', () => {
    expect(throwingArmConcern([])).toHaveLength(0);
  });

  it('does NOT flag a throwing-arm region at severity 4 (one below threshold)', () => {
    const flags = throwingArmConcern([entry('p1', 'right_shoulder', 4, '2026-06-25')]);
    expect(flags).toHaveLength(0);
  });

  it('flags a throwing-arm region at severity 5 (at threshold)', () => {
    const flags = throwingArmConcern([entry('p1', 'right_shoulder', 5, '2026-06-25')]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.kind).toBe('throwing_arm_concern');
    expect(flags[0]!.athleteId).toBe('p1');
    expect(flags[0]!.regionId).toBe('right_shoulder');
    expect(flags[0]!.severity).toBe(5);
  });

  it('flags right_elbow at severity 5 (throwing_arm risk group)', () => {
    const flags = throwingArmConcern([entry('p1', 'right_elbow', 5, '2026-06-25')]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.regionId).toBe('right_elbow');
  });

  it('flags right_forearm at severity 5 (throwing_arm risk group)', () => {
    const flags = throwingArmConcern([entry('p1', 'right_forearm', 5, '2026-06-25')]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.regionId).toBe('right_forearm');
  });

  it('flags left_shoulder at severity 5 (left-handed pitcher throwing arm)', () => {
    const flags = throwingArmConcern([entry('p1', 'left_shoulder', 5, '2026-06-25')]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.regionId).toBe('left_shoulder');
  });

  it('flags a throwing-arm region at severity 9 (well above threshold)', () => {
    const flags = throwingArmConcern([entry('p1', 'right_elbow', 9, '2026-06-25')]);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.severity).toBe(9);
  });

  it('does NOT flag a non-throwing-arm region (left_knee) even at severity 9', () => {
    const flags = throwingArmConcern([entry('p1', 'left_knee', 9, '2026-06-25')]);
    expect(flags).toHaveLength(0);
  });

  it('does NOT flag lower_back (spine_hip group, not throwing_arm group) at severity 5', () => {
    const flags = throwingArmConcern([entry('p1', 'lower_back', 5, '2026-06-25')]);
    expect(flags).toHaveLength(0);
  });

  it('does NOT flag general_fatigue (whole_body, no baseballRiskGroup) at severity 9', () => {
    const flags = throwingArmConcern([entry('p1', 'general_fatigue', 9, '2026-06-25')]);
    expect(flags).toHaveLength(0);
  });

  it('produces one flag per qualifying entry (multiple throwing-arm regions)', () => {
    const entries = [
      entry('p1', 'right_shoulder', 5, '2026-06-25'),
      entry('p1', 'right_elbow', 6, '2026-06-25'),
      entry('p1', 'right_forearm', 4, '2026-06-25'), // below threshold — no flag
    ];
    const flags = throwingArmConcern(entries);
    expect(flags).toHaveLength(2);
  });
});

// ===========================================================================
// Rule 5 — lowerBodyLiftConflict (lower body >= 6 + lower-body lift day)
// ===========================================================================

describe('lowerBodyLiftConflict (Rule 5)', () => {
  it('returns no flags for empty entries', () => {
    expect(lowerBodyLiftConflict([], new Set(['a1']))).toHaveLength(0);
  });

  it('returns no flags when liftAthleteIds is empty', () => {
    const flags = lowerBodyLiftConflict(
      [entry('a1', 'left_quad', 8, '2026-06-25')],
      new Set(),
    );
    expect(flags).toHaveLength(0);
  });

  it('does NOT flag lower-body severity 5 (one below threshold) even on a lift day', () => {
    const flags = lowerBodyLiftConflict(
      [entry('a1', 'right_hamstring', 5, '2026-06-25')],
      new Set(['a1']),
    );
    expect(flags).toHaveLength(0);
  });

  it('does NOT flag lower-body severity 6 when athlete is NOT in liftAthleteIds', () => {
    const flags = lowerBodyLiftConflict(
      [entry('a1', 'left_quad', 6, '2026-06-25')],
      new Set(['a2']), // a1 not in the set
    );
    expect(flags).toHaveLength(0);
  });

  it('flags lower-body severity 6 when athlete IS in liftAthleteIds (at threshold)', () => {
    const flags = lowerBodyLiftConflict(
      [entry('a1', 'left_quad', 6, '2026-06-25')],
      new Set(['a1']),
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]!.kind).toBe('lower_body_lift_conflict');
    expect(flags[0]!.athleteId).toBe('a1');
    expect(flags[0]!.regionId).toBe('left_quad');
  });

  it('flags groin (counted as lower body) at severity 6 on lift day', () => {
    const flags = lowerBodyLiftConflict(
      [entry('a1', 'groin', 6, '2026-06-25')],
      new Set(['a1']),
    );
    expect(flags).toHaveLength(1);
  });

  it('flags left_glute and right_hip (hip/glute regions in lower body) at severity 6', () => {
    const flags = lowerBodyLiftConflict(
      [
        entry('a1', 'left_glute', 6, '2026-06-25'),
        entry('a1', 'right_hip', 7, '2026-06-25'),
      ],
      new Set(['a1']),
    );
    expect(flags).toHaveLength(2);
  });

  it('does NOT flag an upper-body region (left_shoulder) even at severity 8 on a lift day', () => {
    const flags = lowerBodyLiftConflict(
      [entry('a1', 'left_shoulder', 8, '2026-06-25')],
      new Set(['a1']),
    );
    expect(flags).toHaveLength(0);
  });

  it('does NOT flag abs_core (trunk group, not in lower-body set) at severity 6', () => {
    const flags = lowerBodyLiftConflict(
      [entry('a1', 'abs_core', 6, '2026-06-25')],
      new Set(['a1']),
    );
    expect(flags).toHaveLength(0);
  });

  it('flags only the athlete who is in liftAthleteIds when multiple athletes report', () => {
    const flags = lowerBodyLiftConflict(
      [
        entry('a1', 'right_knee', 7, '2026-06-25'),
        entry('a2', 'left_calf', 8, '2026-06-25'),
      ],
      new Set(['a1']), // only a1 has a lift today
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]!.athleteId).toBe('a1');
  });
});

// ===========================================================================
// Rule 6 — missedCheckins (2+ missed in 7-day window)
// ===========================================================================

describe('missedCheckins (Rule 6)', () => {
  const REF = '2026-06-25'; // reference "today"

  it('returns no flags for empty input', () => {
    expect(missedCheckins([], REF)).toHaveLength(0);
  });

  it('does NOT flag 1 missed entry within the window (below threshold)', () => {
    const flags = missedCheckins([missed('a1', '2026-06-24')], REF);
    expect(flags).toHaveLength(0);
  });

  it('flags 2 missed entries within the 7-day window (at threshold)', () => {
    const flags = missedCheckins(
      [missed('a1', '2026-06-22'), missed('a1', '2026-06-24')],
      REF,
    );
    expect(flags).toHaveLength(1);
    expect(flags[0]!.kind).toBe('missed_checkins');
    expect(flags[0]!.athleteId).toBe('a1');
  });

  it('flags 3 missed entries in window (above threshold)', () => {
    const flags = missedCheckins(
      [missed('a1', '2026-06-20'), missed('a1', '2026-06-22'), missed('a1', '2026-06-24')],
      REF,
    );
    expect(flags).toHaveLength(1);
  });

  it('includes entries on the boundary (exactly 7 days before referenceDate)', () => {
    // Jun 18 is exactly 7 days before Jun 25 → diffDays = 7 ≤ 7 → in window
    const flags = missedCheckins(
      [missed('a1', '2026-06-18'), missed('a1', '2026-06-24')],
      REF,
    );
    expect(flags).toHaveLength(1);
  });

  it('does NOT count entries 8+ days before referenceDate (outside window)', () => {
    // Jun 17 = 8 days before Jun 25 → diffDays = 8 > 7 → outside window
    const flags = missedCheckins(
      [missed('a1', '2026-06-16'), missed('a1', '2026-06-17')],
      REF,
    );
    expect(flags).toHaveLength(0);
  });

  it('does NOT flag when only 1 of 2 entries falls within the window', () => {
    // Jun 17 outside, Jun 24 inside → only 1 in window → no flag
    const flags = missedCheckins(
      [missed('a1', '2026-06-17'), missed('a1', '2026-06-24')],
      REF,
    );
    expect(flags).toHaveLength(0);
  });

  it('flags each athlete independently', () => {
    const flags = missedCheckins(
      [
        missed('a1', '2026-06-22'), missed('a1', '2026-06-24'),
        missed('a2', '2026-06-21'), missed('a2', '2026-06-23'),
      ],
      REF,
    );
    expect(flags).toHaveLength(2);
    const athletes = flags.map((f) => f.athleteId).sort();
    expect(athletes).toEqual(['a1', 'a2']);
  });

  it('emits exactly one flag per athlete regardless of miss count', () => {
    const flags = missedCheckins(
      [
        missed('a1', '2026-06-19'),
        missed('a1', '2026-06-21'),
        missed('a1', '2026-06-23'),
        missed('a1', '2026-06-25'),
      ],
      REF,
    );
    expect(flags).toHaveLength(1);
  });
});

// ===========================================================================
// runAllOveruseRules — integration smoke tests
// ===========================================================================

describe('runAllOveruseRules', () => {
  it('returns an empty array when all inputs are empty', () => {
    const flags = runAllOveruseRules({
      sorenessWindow: [],
      today: [],
      pitcherAthleteIds: new Set(),
      lowerBodyLiftAthleteIds: new Set(),
      missedWindow: [],
      referenceDate: '2026-06-25',
    });
    expect(flags).toHaveLength(0);
  });

  it('deduplicates: each kind|athleteId|regionId key appears at most once', () => {
    const todayEntry = entry('p1', 'left_shoulder', 8, '2026-06-25');
    const sorenessWindow = [
      entry('p1', 'left_shoulder', 5, '2026-06-19'),
      entry('p1', 'left_shoulder', 6, '2026-06-22'),
      todayEntry,
    ];
    const flags = runAllOveruseRules({
      sorenessWindow,
      today: [todayEntry],
      pitcherAthleteIds: new Set(['p1']),
      lowerBodyLiftAthleteIds: new Set(),
      missedWindow: [],
      referenceDate: '2026-06-25',
    });

    // high_severity + recurring_region + worsening + throwing_arm_concern
    const uniqueKeys = new Set(flags.map((f) => `${f.kind}|${f.athleteId}|${f.regionId ?? ''}`));
    expect(uniqueKeys.size).toBe(flags.length);

    const kinds = flags.map((f) => f.kind);
    expect(kinds).toContain('high_severity');
    expect(kinds).toContain('throwing_arm_concern');
    expect(kinds).toContain('recurring_region');
    expect(kinds).toContain('worsening');
  });

  it('filters pitcherEntries — throwingArmConcern fires only for pitcher athletes', () => {
    const nonPitcher = entry('b1', 'right_shoulder', 8, '2026-06-25');
    const flags = runAllOveruseRules({
      sorenessWindow: [nonPitcher],
      today: [nonPitcher],
      pitcherAthleteIds: new Set(), // b1 is not a pitcher
      lowerBodyLiftAthleteIds: new Set(),
      missedWindow: [],
      referenceDate: '2026-06-25',
    });
    const kinds = flags.map((f) => f.kind);
    expect(kinds).toContain('high_severity');
    expect(kinds).not.toContain('throwing_arm_concern');
  });

  it('emits lower_body_lift_conflict when athlete is in liftAthleteIds', () => {
    const todayEntry = entry('a1', 'left_quad', 7, '2026-06-25');
    const flags = runAllOveruseRules({
      sorenessWindow: [todayEntry],
      today: [todayEntry],
      pitcherAthleteIds: new Set(),
      lowerBodyLiftAthleteIds: new Set(['a1']),
      missedWindow: [],
      referenceDate: '2026-06-25',
    });
    const kinds = flags.map((f) => f.kind);
    expect(kinds).toContain('high_severity');
    expect(kinds).toContain('lower_body_lift_conflict');
  });

  it('emits missed_checkins when threshold is met', () => {
    const flags = runAllOveruseRules({
      sorenessWindow: [],
      today: [],
      pitcherAthleteIds: new Set(),
      lowerBodyLiftAthleteIds: new Set(),
      missedWindow: [missed('a1', '2026-06-22'), missed('a1', '2026-06-24')],
      referenceDate: '2026-06-25',
    });
    const kinds = flags.map((f) => f.kind);
    expect(kinds).toContain('missed_checkins');
  });
});
