import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * RR-1 (W7 P0): the round review decides who is looking from the resolved dashboard role, as Roster does, not from
 * "has no coach row". A user with both rows reads their own round as the player and their team's as the coach.
 */

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: vi.fn() }));
const seen = vi.hoisted(() => ({ viewer: undefined as unknown }));
vi.mock('../data/round-review', () => ({
  loadRoundReview: vi.fn(async (_id: string, viewer: Promise<unknown>) => {
    seen.viewer = await viewer;
    return { kind: 'notFound' };
  }),
}));

import { getGolfSessionProfile } from '@/lib/auth/session';
import { ClubhouseRoundReviewRoute } from '../routes/round-review';
import { resolveClubhouseTeam } from '../routes/team';

const both = { coach: { id: 'c1', onboarding_completed: true }, player: { id: 'p1', onboarding_completed: true } };

afterEach(() => {
  seen.viewer = undefined;
  vi.mocked(getGolfSessionProfile).mockReset();
  vi.mocked(resolveClubhouseTeam).mockReset();
});

describe('RR-1 · round review viewer for a user with a coach row and a player row', () => {
  it('acting as the player: the viewer is that player on their team', async () => {
    vi.mocked(getGolfSessionProfile).mockResolvedValue(both as never);
    vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'player', teamId: 't1', playerId: 'p1' });
    await ClubhouseRoundReviewRoute({ id: 'r1' });
    expect(seen.viewer).toEqual({ role: 'player', playerId: 'p1', teamId: 't1' });
  });

  it('acting as the coach: the viewer is the coach of the resolved team', async () => {
    vi.mocked(getGolfSessionProfile).mockResolvedValue(both as never);
    vi.mocked(resolveClubhouseTeam).mockResolvedValue({ role: 'coach', teamId: 't2', coachId: 'c1' });
    await ClubhouseRoundReviewRoute({ id: 'r1' });
    expect(seen.viewer).toEqual({ role: 'coach', teamId: 't2' });
  });

  it('a player on no team still reads their own rounds; a coach on no team is no one here', async () => {
    vi.mocked(resolveClubhouseTeam).mockResolvedValue(null);
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: null, player: both.player } as never);
    await ClubhouseRoundReviewRoute({ id: 'r1' });
    expect(seen.viewer).toEqual({ role: 'player', playerId: 'p1', teamId: null });
    vi.mocked(getGolfSessionProfile).mockResolvedValue({ coach: both.coach, player: null } as never);
    await ClubhouseRoundReviewRoute({ id: 'r1' });
    expect(seen.viewer).toBeNull();
  });
});
