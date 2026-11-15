import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Practice on a database without its held migrations (or with only some of them). Every Practice address says the same plain thing,
 * "Practice isn’t on yet": the plan page and print used to say "This plan isn’t available. It may have been removed", which is a
 * different fact and sends a coach looking for a plan that was never lost.
 */
const state = vi.hoisted(() => ({
  role: 'coach' as 'coach' | 'player',
  coach: { status: 'unavailable' } as { status: string },
  player: { status: 'unavailable' } as { status: string },
  drills: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/lib/coachhelm/v3/chat/context', () => ({ resolveCoachChatContext: async () => null }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => ({ role: state.role, player: state.role === 'player' ? { id: 'pl-1' } : null }) }));
vi.mock('../team', () => ({ resolveClubhouseTeam: async () => ({ teamId: 't-1', role: state.role, playerId: 'pl-1' }) }));
vi.mock('../../data/practice-plan', () => ({
  loadCoachPlan: async () => state.coach,
  loadPlayerPlan: async () => state.player,
  loadPlayerPractice: async () => ({ status: 'unavailable' }),
  loadPlanDrills: () => state.drills(),
}));
vi.mock('../../data/practice-home', () => ({ loadCoachPracticeHome: vi.fn(), loadPlayerPracticeHome: vi.fn(), loadPlanForBuilder: vi.fn() }));
vi.mock('../../data/practice-library', () => ({ loadDrill: vi.fn(), loadDrills: vi.fn(), loadGroups: vi.fn(), loadTemplates: vi.fn() }));

const { PracticePlanRoute, PracticePrintRoute } = await import('../practice');

const show = async (node: Promise<ReactElement>) => render(await node);

beforeEach(() => {
  state.role = 'coach';
  state.coach = { status: 'unavailable' };
  state.player = { status: 'unavailable' };
  state.drills.mockReset().mockResolvedValue([]);
});

describe('Practice is not on this database yet', () => {
  it('the coach’s plan page says so, and never that the plan was removed', async () => {
    await show(PracticePlanRoute({ planId: 'p1' }));
    expect(screen.getByText('Practice isn’t on yet')).toBeTruthy();
    expect(screen.queryByText(/isn’t available|removed/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Go to Calendar' })).toBeTruthy();
  });
  it('the player’s plan page says the same', async () => {
    state.role = 'player';
    await show(PracticePlanRoute({ planId: 'p1' }));
    expect(screen.getByText('Practice isn’t on yet')).toBeTruthy();
    expect(screen.queryByText(/removed|published yet/)).toBeNull();
  });
  it('print says the same, even when the drills read fails with it', async () => {
    state.drills.mockRejectedValue(new Error('unread'));
    await show(PracticePrintRoute({ planId: 'p1' }));
    expect(screen.getByText('Practice isn’t on yet')).toBeTruthy();
    expect(screen.queryByText(/isn’t available|removed/)).toBeNull();
  });
});

describe('a plan that really is gone still says so', () => {
  it('on the plan page and on print', async () => {
    state.coach = { status: 'gone' };
    const page = await show(PracticePlanRoute({ planId: 'p1' }));
    expect(screen.getByText('This plan isn’t available')).toBeTruthy();
    expect(screen.queryByText('Practice isn’t on yet')).toBeNull();
    page.unmount();
    await show(PracticePrintRoute({ planId: 'p1' }));
    expect(screen.getByText('This plan isn’t available')).toBeTruthy();
  });
});
