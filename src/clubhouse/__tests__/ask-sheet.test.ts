import { describe, expect, it } from 'vitest';
import { lookingAt } from '../shell/AskSheet';

describe('the Ask sheet’s context (CH-1842)', () => {
  it('names the page from its own trail, or the navigation', () => {
    expect(lookingAt('/golf/dashboard/stats', 'player=p-jonah', ['Stats', 'Jonah Okafor'])).toEqual({ label: 'Stats · Jonah Okafor', playerId: 'p-jonah' });
    expect(lookingAt('/golf/dashboard/calendar', '', null)).toEqual({ label: 'Calendar', playerId: null });
    expect(lookingAt('/golf/dashboard', '', null).label).toBe('Home');
  });
});
