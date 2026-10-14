/**
 * @vitest-environment node
 *
 * One rule for coach or player across the golf dashboard layout, its pages and
 * the Clubhouse gate. The case that used to split them: a user whose player
 * profile is onboarded and whose coach profile is not got the player shell
 * from the layout and coach screens from every page that asked "is there a
 * coach row?".
 */
import { describe, expect, it } from 'vitest';
import { onboardedGolfRole, pickGolfDashboardRole } from '../golf-dashboard-role';

const done = { onboarding_completed: true };
const open = { onboarding_completed: false };

describe('pickGolfDashboardRole', () => {
  it('a single profile is that role, onboarded or not', () => {
    expect(pickGolfDashboardRole({ coach: done, player: null })).toBe('coach');
    expect(pickGolfDashboardRole({ coach: open, player: null })).toBe('coach');
    expect(pickGolfDashboardRole({ coach: null, player: done })).toBe('player');
    expect(pickGolfDashboardRole({ coach: null, player: open })).toBe('player');
  });

  it('dual profile: the onboarded one wins, and both onboarded is coach', () => {
    expect(pickGolfDashboardRole({ coach: open, player: done })).toBe('player');
    expect(pickGolfDashboardRole({ coach: done, player: open })).toBe('coach');
    expect(pickGolfDashboardRole({ coach: done, player: done })).toBe('coach');
  });

  it('dual profile with neither onboarded follows the declared role (the layout passes users.role), else coach', () => {
    expect(pickGolfDashboardRole({ coach: open, player: open })).toBe('coach');
    expect(pickGolfDashboardRole({ coach: open, player: open }, 'player')).toBe('player');
    expect(pickGolfDashboardRole({ coach: open, player: open }, null)).toBe('coach');
  });

  it('no profile is the declared role or nothing', () => {
    expect(pickGolfDashboardRole({ coach: null, player: null })).toBeNull();
    expect(pickGolfDashboardRole({ coach: null, player: null }, 'player')).toBe('player');
  });

  it('matches the layout’s previous inline rule for every profile shape', () => {
    const shapes = [null, open, done];
    for (const coach of shapes) {
      for (const player of shapes) {
        for (const usersRole of [null, 'coach', 'player'] as const) {
          // The layout before this change: fast path declares from onboarding, slow path from users.role.
          const fastPath = !!(coach?.onboarding_completed || player?.onboarding_completed);
          const declared = fastPath ? (coach?.onboarding_completed ? 'coach' : 'player') : usersRole;
          const layout = coach && player ? declared || 'coach' : coach ? 'coach' : player ? 'player' : declared;
          expect(pickGolfDashboardRole({ coach, player }, fastPath ? onboardedGolfRole(coach, player) : usersRole)).toBe(layout);
        }
      }
    }
  });
});
