import { describe, expect, it } from 'vitest';
import { personOf } from '../person-of';
import type { ChMember, ChPerson } from '../model';

const coach: ChPerson = { userId: 'u-coach', name: 'Pat Coach', role: 'coach', subtitle: 'Head Coach', playerId: null };
const former: ChMember = { userId: 'u-old', name: 'Sam Former', subtitle: 'Class of 2028', role: 'player' };

describe('personOf', () => {
  it('names someone from the team directory first', () => {
    expect(personOf({ directory: [coach], members: [{ ...former, userId: 'u-coach', name: 'Other' }] }, 'u-coach')?.name).toBe('Pat Coach');
  });

  it('names a member of an older team’s chat from the group’s members instead of leaving them unnamed', () => {
    expect(personOf({ directory: [coach], members: [former] }, 'u-old')).toMatchObject({ name: 'Sam Former', role: 'player', subtitle: 'Class of 2028' });
  });

  it('is undefined when neither knows the person', () => {
    expect(personOf({ directory: [coach], members: null }, 'u-none')).toBeUndefined();
  });
});
