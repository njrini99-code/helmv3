import { describe, expect, it, vi } from 'vitest';

/** The dashboard role check (src/clubhouse/gate.ts). Clubhouse is the only coach and player UI (Fairway retired, 2026-11-14). */

vi.mock('server-only', () => ({}));

import { isClubhouseFor } from '../gate';

describe('Shell · gate (P001)', () => {
  it('10801 Clubhouse renders for a coach or a player, and for no other role', async () => {
    expect(await isClubhouseFor('coach')).toBe(true);
    expect(await isClubhouseFor('player')).toBe(true);
    expect(await isClubhouseFor(null)).toBe(false);
    expect(await isClubhouseFor(undefined)).toBe(false);
    expect(await isClubhouseFor('admin' as 'coach')).toBe(false);
  });
});
