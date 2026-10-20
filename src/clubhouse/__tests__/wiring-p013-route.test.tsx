import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GolfSessionProfile } from '@/lib/auth/session';

/**
 * P013 wiring pass (2026-10-17): /golf/dashboard/coachhelm follows the dashboard role, not "has a coach row". A user whose
 * onboarded profile is the player one (an unfinished coach profile beside it) is drawn as a player by the layout, and was
 * sent down the coach branch here, to the coach's "You aren't on a team yet" page instead of their own CoachHelm.
 */

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
const session = vi.hoisted(() => ({ current: null as GolfSessionProfile | null }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => session.current }));
const team = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('../routes/team', () => ({ resolveClubhouseTeam: team.resolve }));
vi.mock('../data/coachhelm', () => ({ emptyCoachHelm: vi.fn(), loadCoachCoachHelm: vi.fn(), loadCoachHelmGate: vi.fn(), loadPlayerCoachHelm: vi.fn(), loadPlayerHelmGate: vi.fn() }));
vi.mock('../data/coachhelm-chat', () => ({ loadAskCoachHelm: vi.fn() }));
vi.mock('../data/coachhelm-dive', () => ({ loadPlayerDeepDive: vi.fn() }));
vi.mock('../data/coachhelm-profile', () => ({ loadPlayerProfile: vi.fn() }));
vi.mock('../data/coachhelm-standing', () => ({ loadPlayerStanding: vi.fn() }));

import { ClubhouseCoachHelmRoute } from '../routes/coachhelm';

const dual = (coachDone: boolean) =>
  ({
    coach: { id: 'coach-1', organization_id: 'org-1', onboarding_completed: coachDone },
    player: { id: 'player-1', onboarding_completed: true },
  }) as unknown as GolfSessionProfile;

/** The async view inside the route's one Suspense: its component's name and its props. */
function view(out: unknown): { name: string; props: Record<string, unknown> } {
  expect(isValidElement(out)).toBe(true);
  const child = (out as ReactElement<{ children: ReactElement<Record<string, unknown>> }>).props.children;
  return { name: (child.type as { name: string }).name, props: child.props };
}

beforeEach(() => {
  team.resolve.mockReset();
});

describe('ClubhouseCoachHelmRoute picks the view by the dashboard role', () => {
  it('an onboarded player profile beside an unfinished coach profile gets the player’s own CoachHelm, with or without a team', async () => {
    session.current = dual(false);
    team.resolve.mockResolvedValue({ role: 'player', teamId: 'team-p', playerId: 'player-1' });
    const out = view(await ClubhouseCoachHelmRoute({ view: 'standing' }));
    expect(out).toMatchObject({ name: 'PlayerHelmView', props: { playerId: 'player-1', drill: 'standing' } });
    // The player's board needs no team: the coach's team resolver is never the gate for them.
    team.resolve.mockResolvedValue(null);
    expect(view(await ClubhouseCoachHelmRoute({})).name).toBe('PlayerHelmView');
  });

  it('both profiles onboarded is the coach, as the layout draws it: the coach’s board for the resolved team', async () => {
    session.current = dual(true);
    team.resolve.mockResolvedValue({ role: 'coach', teamId: 'team-c', coachId: 'coach-1' });
    const out = view(await ClubhouseCoachHelmRoute({ view: 'ask', c: 'conv-1' }));
    expect(out).toMatchObject({ name: 'CoachHelmView', props: { coachId: 'coach-1', teamId: 'team-c', ask: true, conversationId: 'conv-1' } });
  });

  it('a coach with no team keeps the coach’s no-team page (CH-13308)', async () => {
    session.current = { coach: { id: 'coach-1', organization_id: 'org-1' }, player: null } as unknown as GolfSessionProfile;
    team.resolve.mockResolvedValue(null);
    const out = (await ClubhouseCoachHelmRoute({})) as ReactElement<{ className: string }>;
    expect(out.props.className).toBe('ch-hl');
  });
});
