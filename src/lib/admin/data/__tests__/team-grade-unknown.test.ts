/**
 * A failed read cannot produce a healthy grade.
 *
 * THE GAP THIS CLOSES — TEAM_GRADE_READ_FAILURE_READS_AS_HEALTHY.
 *
 *     resolveTeamErrorCounts rejects
 *         -> errors7d = 0
 *         -> computeTeamGrade sees zero errors
 *         -> team renders 'A'
 *
 * So a broken observability path rendered as excellent health. It had been
 * known and reasoned in a code comment since the counts were fixed, and left
 * open because honesty required a grade the type did not have.
 *
 * `0 errors` and `could not determine the error count` are different facts.
 * Failure to observe something is not evidence that the thing is healthy.
 */
import { describe, it, expect } from 'vitest';
import { computeTeamGrade, computeTeamComputedInsights } from '@/lib/admin/data/team-grade';

const ACTIVE = 'active' as const;

describe('an unreadable error count never grades a team', () => {
  it('null errors7d yields UNKNOWN, not A', () => {
    // The exact regression. A clean active team with an UNREADABLE count is
    // indistinguishable from a clean active team with zero errors — unless the
    // grade says so.
    expect(computeTeamGrade({ health: ACTIVE, errors7d: null, dormantRosterRatio: 0 })).toBe('UNKNOWN');
  });

  it('a genuine zero still yields A — the two are distinguishable', () => {
    expect(computeTeamGrade({ health: ACTIVE, errors7d: 0, dormantRosterRatio: 0 })).toBe('A');
  });

  it('UNKNOWN wins over EVERY other rule, including the bad ones', () => {
    // Checked before health and roster ratio on purpose. Grading a dormant team
    // 'D' on an unreadable count would be luck, not evidence — right answer,
    // wrong reason, and it would mask the same blindness.
    expect(computeTeamGrade({ health: 'dormant', errors7d: null, dormantRosterRatio: 0.9 })).toBe('UNKNOWN');
    expect(computeTeamGrade({ health: 'cooling', errors7d: null, dormantRosterRatio: 0.6 })).toBe('UNKNOWN');
  });

  it('no input combination turns an unreadable count into a passing grade', () => {
    // Exhaustive over the other two inputs, so a future rule reordering cannot
    // reintroduce the defect quietly.
    for (const health of ['active', 'cooling', 'dormant'] as const) {
      for (const ratio of [0, 0.1, 0.26, 0.5, 0.51, 1]) {
        expect(
          computeTeamGrade({ health, errors7d: null, dormantRosterRatio: ratio }),
          `health=${health} ratio=${ratio}`,
        ).toBe('UNKNOWN');
      }
    }
  });
});

describe('the insights strip does not claim an all-clear it cannot support', () => {
  const roster = [{ activityStatus: ACTIVE }];

  it('never says "no errors" when the count is unreadable', () => {
    // The second, quieter half of the same defect: the strip read
    // `errors7d === 0` and printed "Team is fully active with no errors".
    const out = computeTeamComputedInsights(roster, 5, null);
    expect(out.join(' | ')).not.toMatch(/no errors/i);
  });

  it('says so explicitly instead of staying silent', () => {
    // Silence would be its own false comfort — an empty strip reads as nothing
    // to report.
    expect(computeTeamComputedInsights(roster, 5, null).join(' | ')).toMatch(/unavailable/i);
  });

  it('still gives the all-clear on a real zero', () => {
    expect(computeTeamComputedInsights(roster, 5, 0).join(' | ')).toMatch(/fully active with no errors/i);
  });

  it('still reports a real error count', () => {
    expect(computeTeamComputedInsights(roster, 5, 3).join(' | ')).toMatch(/3 errors in the last 7 days/);
  });
});
