// =============================================================================
// WhatsNewPage — #201: a player visiting /golf/dashboard/whats-new must never
// crash with a real React error, and the "coach-only feature" explanation
// must actually render.
//
// Root cause: the player branch used to `redirect('/golf/dashboard?message=…')`
// — a cross-page hop whose query-string explanation `/golf/dashboard` never
// reads (its `searchParams` type is `Promise<{ range?: string }>`), so the
// message silently vanished, and bouncing a player into the full dashboard's
// own heavy data-fetch (cached dashboard payload, hub summary, join requests)
// opened an unrelated render path where a real error could surface before the
// hop finished. This pins the fix: the player (and no-profile) branches now
// render the coach-only state IN PLACE (Clubhouse's NotRebuilt since GAP-R-11) — same route, same request, nothing
// new to fetch, message always visible, no redirect at all — matching the
// proven pattern already used by every other coach-only page (Patterns,
// Insights, Development).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getGolfSessionProfile: vi.fn(),
  getWhatsNewForCoach: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

function ClubhouseWhatsNewRouteStub() {
  return null;
}
vi.mock('@/clubhouse/routes/whats-new', () => ({ ClubhouseWhatsNewRoute: ClubhouseWhatsNewRouteStub }));

vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: mocks.getGolfSessionProfile,
}));

vi.mock('@/app/golf/actions/whats-new', () => ({
  getWhatsNewForCoach: mocks.getWhatsNewForCoach,
}));

function NotRebuiltStub() {
  return null;
}
vi.mock('@/clubhouse/shell/NotRebuilt', () => ({
  NotRebuilt: NotRebuiltStub,
}));

import WhatsNewPage from '../page';
import type { ReactElement } from 'react';

describe('WhatsNewPage — #201 player-facing crash / lost redirect message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /golf/login when there is no session at all (no message to lose here — never authenticated)', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue(null);

    await expect(WhatsNewPage()).rejects.toThrow('REDIRECT:/golf/login');
    expect(mocks.getWhatsNewForCoach).not.toHaveBeenCalled();
  });

  it('renders the Clubhouse coach-only state IN PLACE for a player session — no redirect, no lost message, no second render path to crash on (GAP-R-11)', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue({
      userId: 'player-1',
      role: 'player',
      coach: null,
      player: { id: 'player-1' },
    });

    const element = (await WhatsNewPage()) as ReactElement;

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.getWhatsNewForCoach).not.toHaveBeenCalled();
    expect(element.type).toBe(NotRebuiltStub);
    // "Only coaches use What’s new", with the way back Home (CH-1301): never the retired Fairway page.
    expect(element.props).toEqual({ label: 'What’s new', coachOnly: true });
  });

  it('renders the coach-only state IN PLACE when neither a coach nor player profile exists', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue({
      userId: 'ghost-1',
      role: null,
      coach: null,
      player: null,
    });

    const element = (await WhatsNewPage()) as ReactElement;

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element.type).toBe(NotRebuiltStub);
  });

  it('renders the Clubhouse What’s new for a coach (the route reads its own week), and the page reads no feed itself', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue({ userId: 'coach-1', role: 'coach', coach: { id: 'coach-1' }, player: null });

    const element = (await WhatsNewPage()) as ReactElement;

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element.type).toBe(ClubhouseWhatsNewRouteStub);
    expect(mocks.getWhatsNewForCoach).not.toHaveBeenCalled();
  });
});
