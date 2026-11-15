import { describe, expect, it } from 'vitest';
import { memberValue, toChTeamPatterns } from '../data/coachhelm-team-pattern';
import { PREVIEW_TEAM_PATTERNS } from '../preview/fixtures-coachhelm-patterns';

describe('Team patterns (Slice 7b)', () => {
  it('maps nothing to no section', () => {
    expect(toChTeamPatterns({ patterns: [], below_threshold: 0, roster_with_reads: 3, roster_total: 5 }, new Map())).toBeNull();
  });

  it('formats member numbers in the read unit', () => {
    expect(memberValue(41.26, 'percent')).toBe('41.3%');
    expect(memberValue(1, 'strokes')).toBe('1 stroke');
    expect(memberValue(null, 'percent')).toBeNull();
  });

  it('a negative member number has a true minus, and its word follows English (CONS-14)', () => {
    expect(memberValue(-1, 'strokes')).toBe('−1 stroke');
    expect(memberValue(-2.46, 'strokes')).toBe('−2.5 strokes');
    expect(memberValue(0.4, 'strokes')).toBe('0.4 strokes');
    expect(memberValue(2, 'strokes')).toBe('2 strokes');
    expect(memberValue(-12.3, 'percent')).toBe('−12.3%');
    expect(memberValue(-4, 'feet')).toBe('−4 ft');
    expect(memberValue(-0.04, 'strokes')).toBe('0 strokes');
  });

  it('the preview fixture runs the real computation: two patterns, one counted below', () => {
    const d = PREVIEW_TEAM_PATTERNS!;
    expect(d.rows.map((r) => r.title)).toEqual(['Approaches 50–125 yd · finishing short', 'Putts made 5–10 ft']);
    expect(d.rows[0]!.members).toBe('3 of 5 players with enough rounds');
    expect(d.rows[0]!.strokes).toBe('about 1.1 strokes a round across the team');
    expect(d.below).toBe('1 more read is shared by too few players to call a team pattern.');
  });
});
