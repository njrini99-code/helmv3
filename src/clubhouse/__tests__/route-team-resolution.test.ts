import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GolfSessionProfile } from '@/lib/auth/session';

vi.mock('server-only', () => ({}));
const cache = vi.hoisted(() => ({ coach: vi.fn(), player: vi.fn() }));
vi.mock('@/lib/golf/dashboard-request-cache', () => ({
  resolveCoachActiveTeamForRequest: cache.coach,
  getActivePlayerTeamMembership: cache.player,
}));
const log = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: log }));

const coachSession = { coach: { id: 'coach-1', organization_id: 'org-1' }, player: null } as unknown as GolfSessionProfile;

describe('resolveClubhouseTeam — a failed team read is an error, never "no team" (PAGE_PERFORMANCE.md rule 4)', () => {
  beforeEach(() => {
    cache.coach.mockReset();
    log.mockReset();
  });

  it('a coach resolution that failed throws for the route error view to retry', async () => {
    cache.coach.mockResolvedValue({ status: 'failed' });
    const { resolveClubhouseTeam } = await import('../routes/team');
    await expect(resolveClubhouseTeam(coachSession)).rejects.toThrow(/coach team resolution read failed/);
    expect(log).toHaveBeenCalledWith('route', 'coachTeam', expect.any(Error), 'teams');
  });

  it('a coach on no team is null, and a found team is the coach view', async () => {
    const { resolveClubhouseTeam } = await import('../routes/team');
    cache.coach.mockResolvedValue({ status: 'none' });
    expect(await resolveClubhouseTeam(coachSession)).toBeNull();
    cache.coach.mockResolvedValue({ status: 'ok', teamId: 'team-1' });
    expect(await resolveClubhouseTeam(coachSession)).toEqual({ role: 'coach', teamId: 'team-1', coachId: 'coach-1' });
  });
});
