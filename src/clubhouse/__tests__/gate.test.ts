import { afterEach, describe, expect, it, vi } from 'vitest';

/** The one switch between Fairway and Clubhouse (src/clubhouse/gate.ts). */

const flag = vi.hoisted(() => ({ on: false }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (id: string) => id === 'golf_clubhouse_ui' && flag.on }));

import { isClubhouseFor } from '../gate';

describe('Shell · gate (P001)', () => {
  afterEach(() => {
    flag.on = false;
  });

  it('10801 Clubhouse renders only for a coach or a player, and only with golf_clubhouse_ui on', () => {
    expect(isClubhouseFor('coach')).toBe(false);
    expect(isClubhouseFor('player')).toBe(false);
    flag.on = true;
    expect(isClubhouseFor('coach')).toBe(true);
    expect(isClubhouseFor('player')).toBe(true);
    expect(isClubhouseFor(null)).toBe(false);
    expect(isClubhouseFor(undefined)).toBe(false);
    expect(isClubhouseFor('admin' as 'coach')).toBe(false);
  });
});
