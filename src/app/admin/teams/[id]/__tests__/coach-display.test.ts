import { describe, it, expect } from 'vitest';
import { coachDisplayName, buildCoachDisambiguator } from '../coach-display';

/**
 * Bridge audit 2026-08-21: two distinct golf_coaches rows can legitimately
 * share a display name — verified live, two different accounts both named
 * "Matt Thomas" (bfq14@su.edu and matthew.a.thomas7@gmail.com), both
 * staffed on both Shenandoah teams — and the "Coaches:" line rendered
 * `c.fullName` alone, printing "Coaches: Matt Thomas Matt Thomas" on both
 * team pages. Not a counting bug (resolveTeamUserIds/resolveTeamErrorCounts
 * correctly treat the two accounts as distinct); purely a display gap.
 */
function coach(overrides: { fullName?: string | null; email?: string | null; title?: string | null }) {
  return { fullName: overrides.fullName ?? null, email: overrides.email ?? null, title: overrides.title ?? null };
}

describe('coachDisplayName', () => {
  it('prefers fullName, falls back to email, then "Unnamed coach"', () => {
    expect(coachDisplayName(coach({ fullName: 'Matt Thomas' }))).toBe('Matt Thomas');
    expect(coachDisplayName(coach({ email: 'matt@su.edu' }))).toBe('matt@su.edu');
    expect(coachDisplayName(coach({}))).toBe('Unnamed coach');
  });
});

describe('buildCoachDisambiguator', () => {
  it('the audited scenario — two "Matt Thomas" accounts get their emails as disambiguators', () => {
    const matt1 = coach({ fullName: 'Matt Thomas', email: 'bfq14@su.edu' });
    const matt2 = coach({ fullName: 'Matt Thomas', email: 'matthew.a.thomas7@gmail.com' });
    const all = [matt1, matt2];
    expect(buildCoachDisambiguator(matt1, all)).toBe('bfq14@su.edu');
    expect(buildCoachDisambiguator(matt2, all)).toBe('matthew.a.thomas7@gmail.com');
  });

  it('returns null for a non-colliding name — the common case renders unchanged', () => {
    const solo = coach({ fullName: 'Priya Nair', email: 'priya@team.edu' });
    const other = coach({ fullName: 'Sam Rivera', email: 'sam@team.edu' });
    expect(buildCoachDisambiguator(solo, [solo, other])).toBeNull();
  });

  it('falls back to title when email is missing for a colliding name', () => {
    const a = coach({ fullName: 'Jordan Lee', title: 'Head Coach' });
    const b = coach({ fullName: 'Jordan Lee', title: 'Assistant Coach' });
    expect(buildCoachDisambiguator(a, [a, b])).toBe('Head Coach');
    expect(buildCoachDisambiguator(b, [a, b])).toBe('Assistant Coach');
  });

  it('falls back to title when email equals the already-shown display name', () => {
    // fullName is null, so displayName IS the email — showing "(email)" again
    // would be a pointless repeat of what's already on screen.
    const a = coach({ email: 'coach@team.edu', title: 'Head Coach' });
    const b = coach({ email: 'coach@team.edu', title: 'Assistant Coach' });
    expect(buildCoachDisambiguator(a, [a, b])).toBe('Head Coach');
  });

  it('returns null when a colliding name has neither a useful email nor a title', () => {
    const a = coach({ fullName: 'No Extras' });
    const b = coach({ fullName: 'No Extras' });
    expect(buildCoachDisambiguator(a, [a, b])).toBeNull();
  });

  it('three-way collision — every colliding coach gets checked, not just the first pair', () => {
    const a = coach({ fullName: 'Same Name', email: 'a@x.com' });
    const b = coach({ fullName: 'Same Name', email: 'b@x.com' });
    const c = coach({ fullName: 'Same Name', email: 'c@x.com' });
    expect(buildCoachDisambiguator(c, [a, b, c])).toBe('c@x.com');
  });
});
