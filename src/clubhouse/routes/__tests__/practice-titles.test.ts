import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-R-08 (production audit 2026-11-15): the plan, drill and print pages titled every tab "Practice plan", "Drill" or
 * "Print plan", so the tab, the app switcher and VoiceOver's window title never said which plan was open. The tab now
 * names the plan or drill, read once per request with the page (React `cache`), and falls back to the generic name.
 */
const state = vi.hoisted(() => ({
  session: { role: 'coach', player: null } as { role: 'coach' | 'player'; player: { id: string } | null } | null,
  coach: vi.fn(async (_id: string): Promise<unknown> => ({ status: 'ready', plan: { title: 'Tuesday short game' } })),
  player: vi.fn(async (_id: string, _player: string): Promise<unknown> => ({ status: 'ready', plan: { title: 'Tuesday short game' } })),
  drill: vi.fn(async (_team: string, _id: string): Promise<unknown> => ({ status: 'ready', data: { name: 'Ladder putting' } })),
  team: { teamId: 't-1', role: 'coach' } as { teamId: string; role: string } | null,
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }));
vi.mock('@/lib/coachhelm/v3/chat/context', () => ({ resolveCoachChatContext: async () => null }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => state.session }));
vi.mock('../team', () => ({ resolveClubhouseTeam: async () => state.team }));
vi.mock('../../data/practice-plan', () => ({
  loadCoachPlan: (id: string) => state.coach(id),
  loadPlayerPlan: (id: string, player: string) => state.player(id, player),
  loadPlayerPractice: async () => ({ status: 'unavailable' }),
  loadPlanDrills: async () => [],
}));
vi.mock('../../data/practice-home', () => ({ loadCoachPracticeHome: vi.fn(), loadPlayerPracticeHome: vi.fn(), loadPlanForBuilder: vi.fn() }));
vi.mock('../../data/practice-library', () => ({ loadDrill: (team: string, id: string) => state.drill(team, id), loadDrills: vi.fn(), loadGroups: vi.fn(), loadTemplates: vi.fn() }));

const { practicePlanTitle, practiceDrillTitle } = await import('../practice');

beforeEach(() => {
  state.session = { role: 'coach', player: null };
  state.team = { teamId: 't-1', role: 'coach' };
  state.coach.mockClear();
  state.player.mockClear();
  state.drill.mockClear();
});

describe('GAP-R-08 · a plan’s or drill’s tab names it', () => {
  it('a coach’s plan tab is the plan’s own title', async () => {
    expect(await practicePlanTitle('p1')).toBe('Tuesday short game');
    expect(state.coach).toHaveBeenCalledWith('p1');
    expect(state.player).not.toHaveBeenCalled();
  });

  it('a player’s plan tab reads their own copy of it', async () => {
    state.session = { role: 'player', player: { id: 'pl-1' } };
    expect(await practicePlanTitle('p1')).toBe('Tuesday short game');
    expect(state.player).toHaveBeenCalledWith('p1', 'pl-1');
  });

  it('a plan that is gone, off, failing, untitled or signed out keeps the generic title (the print page’s own)', async () => {
    state.coach.mockResolvedValueOnce({ status: 'gone' });
    expect(await practicePlanTitle('p1')).toBe('Practice plan');
    state.coach.mockRejectedValueOnce(new Error('network'));
    expect(await practicePlanTitle('p1')).toBe('Practice plan');
    state.coach.mockResolvedValueOnce({ status: 'ready', plan: { title: '  ' } });
    expect(await practicePlanTitle('p1', '')).toBe('');
    state.session = null;
    expect(await practicePlanTitle('p1')).toBe('Practice plan');
  });

  it('a drill tab is the drill’s name; a player, no team or a missing drill keeps "Drill"', async () => {
    expect(await practiceDrillTitle('d1')).toBe('Ladder putting');
    expect(state.drill).toHaveBeenCalledWith('t-1', 'd1');
    state.drill.mockResolvedValueOnce({ status: 'ready', data: null });
    expect(await practiceDrillTitle('d1')).toBe('Drill');
    state.team = null;
    expect(await practiceDrillTitle('d1')).toBe('Drill');
    state.session = { role: 'player', player: { id: 'pl-1' } };
    expect(await practiceDrillTitle('d1')).toBe('Drill');
  });

  it('the three pages take their title from these, not a fixed one', () => {
    const page = (rel: string) => readFileSync(join(process.cwd(), 'src/app/golf/(dashboard)/dashboard/practice', rel), 'utf8');
    expect(page('plan/[planId]/page.tsx')).toMatch(/export async function generateMetadata[\s\S]*practicePlanTitle\(planId\)/);
    expect(page('drills/[drillId]/page.tsx')).toMatch(/export async function generateMetadata[\s\S]*practiceDrillTitle\(drillId\)/);
    expect(page('print/[planId]/page.tsx')).toMatch(/export async function generateMetadata[\s\S]*`Print · \$\{title\}`/);
    for (const rel of ['plan/[planId]/page.tsx', 'drills/[drillId]/page.tsx', 'print/[planId]/page.tsx']) expect(page(rel)).not.toMatch(/export const metadata/);
  });
});
