import { afterEach, describe, expect, it, vi } from 'vitest';

/** The one switch between Fairway and Clubhouse (src/clubhouse/gate.ts). */

const flag = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (id: string) => id === 'golf_clubhouse_ui' && flag.on }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => null }));

import { isClubhouseFor } from '../gate';

describe('Shell · gate (P001)', () => {
  afterEach(() => {
    flag.on = false;
  });

  it('10801 Clubhouse renders only for a coach or a player, and only with golf_clubhouse_ui on', async () => {
    expect(await isClubhouseFor('coach')).toBe(false);
    expect(await isClubhouseFor('player')).toBe(false);
    flag.on = true;
    expect(await isClubhouseFor('coach')).toBe(true);
    expect(await isClubhouseFor('player')).toBe(true);
    expect(await isClubhouseFor(null)).toBe(false);
    expect(await isClubhouseFor(undefined)).toBe(false);
    expect(await isClubhouseFor('admin' as 'coach')).toBe(false);
  });
});
