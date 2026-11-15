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
vi.mock('next/navigation', () => ({ redirect: vi.fn(), notFound: () => { throw new Error('NEXT_NOT_FOUND'); }, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
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
const { FAILURE_COPY } = await import('../../ui/Notices');
/** A well-formed id: a malformed one is the not-found page before any read (GAP-S-21). */
const PLAN = '00000000-0000-4000-8000-000000000001';

const show = async (node: Promise<ReactElement>) => render(await node);

beforeEach(() => {
  state.role = 'coach';
  state.coach = { status: 'unavailable' };
  state.player = { status: 'unavailable' };
  state.drills.mockReset().mockResolvedValue([]);
});

describe('Practice is not on this database yet', () => {
  it('the coach’s plan page says so, and never that the plan was removed', async () => {
    await show(PracticePlanRoute({ planId: PLAN }));
    expect(screen.getByText('Practice isn’t on yet')).toBeTruthy();
    expect(screen.queryByText(/isn’t available|removed/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Go to Calendar' })).toBeTruthy();
  });
  it('the player’s plan page says the same', async () => {
    state.role = 'player';
    await show(PracticePlanRoute({ planId: PLAN }));
    expect(screen.getByText('Practice isn’t on yet')).toBeTruthy();
    expect(screen.queryByText(/removed|published yet/)).toBeNull();
  });
  it('print says the same, even when the drills read fails with it', async () => {
    state.drills.mockRejectedValue(new Error('unread'));
    await show(PracticePrintRoute({ planId: PLAN }));
    expect(screen.getByText('Practice isn’t on yet')).toBeTruthy();
    expect(screen.queryByText(/isn’t available|removed/)).toBeNull();
  });
});

describe('a plan that really is gone still says so', () => {
  // One not-found voice (GAP-S-24): a gone plan is Practice's not-found page ("This plan isn’t here", CH-1306, drawn by
  // the segment's not-found.tsx), never "Practice isn’t on yet".
  it('on the plan page and on print', async () => {
    state.coach = { status: 'gone' };
    await expect(PracticePlanRoute({ planId: PLAN })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(PracticePrintRoute({ planId: PLAN })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('a plan whose read failed (GAP-S-06)', () => {
  // The route writes FAILURE_COPY.page out (a server route can't read a value from the client Notices module): this
  // keeps the two the same words.
  it('says this plan didn’t load, with the one failure line', async () => {
    state.coach = { status: 'failed' };
    await show(PracticePlanRoute({ planId: PLAN }));
    expect(screen.getByText('This plan didn’t load')).toBeTruthy();
    expect(screen.getByText(FAILURE_COPY.page)).toBeTruthy();
  });
});
