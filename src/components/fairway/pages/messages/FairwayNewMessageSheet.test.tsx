// @vitest-environment jsdom
/**
 * ============================================================================
 * FairwayNewMessageSheet.tsx — recipient name/role-label collision (#158)
 * ----------------------------------------------------------------------------
 * A coach record whose `full_name` was seeded with a role label (e.g. "Head
 * Coach") instead of a real person's name used to render that role string as
 * the row's NAME line — identical to the real title-holder's subtitle,
 * producing two "Head Coach" entries in the recipient picker where only one
 * should exist. `resolveCoachName` is the guard against that collision: it
 * detects a role-label-shaped full_name and falls back to an honest, clearly
 * non-personal label instead of parroting the role back as a name.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { resolveCoachName, ROLE_LABEL_PATTERN } from './FairwayNewMessageSheet';

describe('resolveCoachName — role label vs. real person collision', () => {
  it('passes through a real person name unchanged', () => {
    expect(resolveCoachName('Nick Rini')).toBe('Nick Rini');
  });

  it('falls back when full_name is exactly a role label ("Head Coach")', () => {
    expect(resolveCoachName('Head Coach')).toBe('Coaching staff');
  });

  it('falls back for other common role-label variants, case-insensitively', () => {
    expect(resolveCoachName('head coach')).toBe('Coaching staff');
    expect(resolveCoachName('Assistant Coach')).toBe('Coaching staff');
    expect(resolveCoachName('ASSOCIATE COACH')).toBe('Coaching staff');
    expect(resolveCoachName('Coach')).toBe('Coaching staff');
  });

  it('falls back when full_name is null, undefined, or blank', () => {
    expect(resolveCoachName(null)).toBe('Coaching staff');
    expect(resolveCoachName(undefined)).toBe('Coaching staff');
    expect(resolveCoachName('   ')).toBe('Coaching staff');
  });

  it('does not falsely flag a real name that merely contains "coach"', () => {
    // A guard against over-matching: only an EXACT role-label string should
    // trigger the fallback, never a real name that happens to contain the
    // substring "coach".
    expect(ROLE_LABEL_PATTERN.test('Coach Reynolds')).toBe(false);
    expect(resolveCoachName('Coach Reynolds')).toBe('Coach Reynolds');
  });

  it('the never-two-Head-Coach-entries contract: title-holder + collided row resolve to distinct labels', () => {
    const titleHolder = { fullName: 'Nick Rini', title: 'Head Coach' };
    const collidedRow = { fullName: 'Head Coach', title: null as string | null };

    const titleHolderName = resolveCoachName(titleHolder.fullName);
    const collidedRowName = resolveCoachName(collidedRow.fullName);

    expect(titleHolderName).not.toBe(collidedRowName);
    // The real title-holder's role label may still legitimately appear as
    // their SUBTITLE ("Head Coach") — but no row's primary NAME is ever
    // that same role string.
    expect(titleHolderName).toBe('Nick Rini');
    expect(collidedRowName).not.toMatch(ROLE_LABEL_PATTERN);
  });
});
