import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The course page's address states (P-7, GAP-S-20 and GAP-S-24): a coach with no player named is asked to choose one, never
 * told the player isn't on the team, and an address that is not a course key is the shared "isn't here".
 */
const state = vi.hoisted(() => ({
  role: 'coach' as 'coach' | 'player',
  load: vi.fn(async (): Promise<unknown> => ({ kind: 'notFound' })),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard/rounds/course/x' }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => ({ role: state.role, player: state.role === 'player' ? { id: 'pl-1' } : null }) }));
vi.mock('../team', () => ({ resolveClubhouseTeam: async () => ({ teamId: 't-1', role: state.role, playerId: 'pl-1' }) }));
vi.mock('../../data/course-history', () => ({ loadCourseHistory: () => state.load() }));
vi.mock('../../screens/rounds/CoursePage', () => ({ CoursePage: () => null }));
vi.mock('../../screens/rounds/CourseLoadFailed', () => ({ CourseLoadFailed: () => null }));

const { ClubhouseCourseHistoryRoute } = await import('../course-history');

const KEY = 'n-finley%20gc';
const PLAYER = '00000000-0000-4000-8000-000000000001';
const show = async (node: Promise<ReactElement | null>) => render((await node) as ReactElement);

beforeEach(() => {
  state.role = 'coach';
  state.load.mockReset().mockResolvedValue({ kind: 'notFound' });
});

describe('the course page for a coach', () => {
  it('with no player named asks for one, with the way to Roster (CH-11391)', async () => {
    const { container } = await show(ClubhouseCourseHistoryRoute({ rawKey: KEY, player: null, hole: null, window: 'all' }));
    expect(container.querySelector('[data-ch-code="CH-11391"]')).not.toBeNull();
    expect(screen.getByText('Choose a player to see their course history')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Roster' }).getAttribute('href')).toBe('/golf/dashboard/roster');
    expect(screen.queryByText('This player isn’t on your team')).toBeNull();
    expect(state.load).not.toHaveBeenCalled();
  });

  it('with a player that is not an id asks the same', async () => {
    const { container } = await show(ClubhouseCourseHistoryRoute({ rawKey: KEY, player: 'abc', hole: null, window: 'all' }));
    expect(container.querySelector('[data-ch-code="CH-11391"]')).not.toBeNull();
  });

  it('with a player the loader says is not on the team still says so (CH-11331)', async () => {
    state.load.mockResolvedValue({ kind: 'notOnTeam' });
    const { container } = await show(ClubhouseCourseHistoryRoute({ rawKey: KEY, player: PLAYER, hole: null, window: 'all' }));
    expect(container.querySelector('[data-ch-code="CH-11331"]')).not.toBeNull();
  });
});

describe('an address that is not a course key', () => {
  it('is the shared "isn’t here" for a coach, back to Stats (GAP-S-24)', async () => {
    const { container } = await show(ClubhouseCourseHistoryRoute({ rawKey: 'not-a-key', player: PLAYER, hole: null, window: 'all' }));
    expect(container.querySelector('[data-ch-code="CH-1306"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Go to Stats' }).getAttribute('href')).toBe('/golf/dashboard/stats');
    expect(state.load).not.toHaveBeenCalled();
  });

  it('is the same for a player, back to their rounds', async () => {
    state.role = 'player';
    const { container } = await show(ClubhouseCourseHistoryRoute({ rawKey: 'not-a-key', player: null, hole: null, window: 'all' }));
    expect(container.querySelector('[data-ch-code="CH-1306"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Go to your rounds' }).getAttribute('href')).toBe('/golf/dashboard/rounds');
  });

  it('a real key with no rounds is still "No rounds here" (CH-11330)', async () => {
    state.role = 'player';
    const { container } = await show(ClubhouseCourseHistoryRoute({ rawKey: KEY, player: null, hole: null, window: 'all' }));
    expect(container.querySelector('[data-ch-code="CH-11330"]')).not.toBeNull();
  });
});
