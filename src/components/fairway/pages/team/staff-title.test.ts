/**
 * Team Info coaching staff: a head coach's row printed "Head Coach" (their
 * stored title) beside a "Head coach" pill. The role now shows once.
 */
import { describe, expect, it } from 'vitest';

import { distinctStaffTitle, staffRoleLabel } from './staff-title';

describe('staffRoleLabel', () => {
  it('names the two staff roles in sentence case', () => {
    expect(staffRoleLabel('head_coach')).toBe('Head coach');
    expect(staffRoleLabel('assistant_coach')).toBe('Assistant coach');
  });
});

describe('distinctStaffTitle', () => {
  it('drops a title that only repeats the role, whatever its casing or spacing', () => {
    expect(distinctStaffTitle('Head Coach', 'Head coach')).toBeNull();
    expect(distinctStaffTitle('  HEAD   COACH ', 'Head coach')).toBeNull();
    expect(distinctStaffTitle('head-coach', 'Head coach')).toBeNull();
    expect(distinctStaffTitle('Assistant Coach', 'Assistant coach')).toBeNull();
  });

  it('keeps a title that adds something the role pill does not say', () => {
    expect(distinctStaffTitle('Director of Golf', 'Head coach')).toBe('Director of Golf');
    expect(distinctStaffTitle(' Head Golf Coach ', 'Head coach')).toBe('Head Golf Coach');
  });

  it('returns null for a missing or blank title', () => {
    expect(distinctStaffTitle(null, 'Head coach')).toBeNull();
    expect(distinctStaffTitle(undefined, 'Head coach')).toBeNull();
    expect(distinctStaffTitle('   ', 'Head coach')).toBeNull();
  });
});
