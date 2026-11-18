import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GolfSessionProfile } from '@/lib/auth/session';

/**
 * PMAC-12 (production audit 2026-11-15): Settings took 750 ms to its first byte. Its loader read in two waves, one after
 * the other: the account's own reads, then the role's (a player's notification routing, join requests and team row; a
 * coach's team settings, team row, CoachHelm row and philosophy), though the role's need only the ids and the team. They
 * now start with the first wave: here they are asked for while the first wave's slowest read has not answered.
 */
vi.mock('server-only', () => ({}));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));

const reads = vi.hoisted(() => [] as string[]);
const gate = vi.hoisted(() => ({ release: () => {} }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const answer = { data: null, error: null };
    const builder = (table: string) => {
      reads.push(table);
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order']) chain[m] = () => chain;
      chain.maybeSingle = () => Promise.resolve(answer);
      chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(answer).then(ok);
      return chain;
    };
    return { from: builder, auth: { getUser: async () => ({ data: { user: { email: 'a@b.test' } }, error: null }) } };
  },
}));
vi.mock('@/app/actions/notification-preferences', () => ({
  // The first wave's slowest read: held until the test lets it answer.
  getNotificationPreferences: () => new Promise((resolve) => (gate.release = () => resolve({ data: {}, error: null }))),
}));
vi.mock('@/app/golf/actions/insights-coachhelm', () => ({
  getTeamCoachHelmAccess: async () => ({ success: false, error: 'off' }),
  getOrCreateTeamCoachHelmSettings: async () => ({ success: false, error: 'off' }),
}));
vi.mock('@/app/golf/actions/teams', () => ({ getPlayerJoinRequests: async () => ({ success: true, data: [] }) }));
vi.mock('@/lib/golf/player-private-fields', () => ({ readPlayerPrivateFields: async () => ({ data: new Map(), error: null }) }));

import { loadSettings } from '../settings';

const coachSession = { userId: 'u1', role: 'coach', coach: { id: 'c1', organization_id: 'org1', onboarding_completed: true }, player: null } as unknown as GolfSessionProfile;
const playerSession = { userId: 'u2', role: 'player', coach: null, player: { id: 'p1', onboarding_completed: true } } as unknown as GolfSessionProfile;

beforeEach(() => {
  reads.length = 0;
});

describe('Settings reads in one wave (PMAC-12)', () => {
  it('a player’s routing, team row and join requests start before the first wave has answered', async () => {
    const page = loadSettings(playerSession, 't1');
    await vi.waitFor(() => expect(reads).toEqual(expect.arrayContaining(['golf_player_notification_state', 'golf_teams', 'golf_players'])), { timeout: 500 });
    gate.release();
    const data = await page;
    expect(data.role).toBe('player');
  });

  it('a coach’s team settings, team row, CoachHelm row and philosophy start before the first wave has answered', async () => {
    const page = loadSettings(coachSession, 't1');
    await vi.waitFor(
      () => expect(reads).toEqual(expect.arrayContaining(['golf_team_settings', 'golf_teams', 'golf_coachhelm_settings', 'golf_coach_philosophy', 'golf_coaches'])),
      { timeout: 500 },
    );
    gate.release();
    const data = await page;
    expect(data.role).toBe('coach');
  });
});
