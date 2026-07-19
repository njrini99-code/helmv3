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
// render `<FeatureUnavailable>` IN PLACE — same route, same request, nothing
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

vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: mocks.getGolfSessionProfile,
}));

vi.mock('@/app/golf/actions/whats-new', () => ({
  getWhatsNewForCoach: mocks.getWhatsNewForCoach,
}));

function FairwayWhatsNewStub() {
  return null;
}
vi.mock('@/components/fairway/pages/whats-new', () => ({
  FairwayWhatsNew: FairwayWhatsNewStub,
}));

function FeatureUnavailableStub() {
  return null;
}
vi.mock('@/components/fairway', () => ({
  FeatureUnavailable: FeatureUnavailableStub,
}));

import WhatsNewPage from '../page';
import type { ReactElement } from 'react';

/** Unwraps the (possibly `<div>`-wrapped) page result down to its innermost element. */
function innermost(element: ReactElement): ReactElement {
  const children = (element.props as { children?: unknown }).children;
  return children && typeof children === 'object' && 'type' in (children as object)
    ? (children as ReactElement)
    : element;
}

describe('WhatsNewPage — #201 player-facing crash / lost redirect message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to /golf/login when there is no session at all (no message to lose here — never authenticated)', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue(null);

    await expect(WhatsNewPage()).rejects.toThrow('REDIRECT:/golf/login');
    expect(mocks.getWhatsNewForCoach).not.toHaveBeenCalled();
  });

  it('renders FeatureUnavailable IN PLACE for a player session — no redirect, no lost message, no second render path to crash on', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue({
      userId: 'player-1',
      role: 'player',
      coach: null,
      player: { id: 'player-1' },
    });

    const element = (await WhatsNewPage()) as ReactElement;

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.getWhatsNewForCoach).not.toHaveBeenCalled();
    expect(element.type).toBe(FeatureUnavailableStub);
    const props = element.props as { title: string; message: string; actionHref?: string; actionLabel?: string };
    expect(props.message).toContain('coach-only feature');
    // Sends the player somewhere real and player-facing, not a dead end.
    expect(props.actionHref).toBe('/golf/dashboard/coachhelm');
  });

  it('renders FeatureUnavailable IN PLACE when neither a coach nor player profile exists', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue({
      userId: 'ghost-1',
      role: null,
      coach: null,
      player: null,
    });

    const element = (await WhatsNewPage()) as ReactElement;

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element.type).toBe(FeatureUnavailableStub);
    const props = element.props as { message: string };
    expect(props.message).toContain('complete onboarding');
  });

  it('fetches and renders the real feed for a coach session (unchanged happy path)', async () => {
    mocks.getGolfSessionProfile.mockResolvedValue({
      userId: 'coach-1',
      role: 'coach',
      coach: { id: 'coach-1' },
      player: null,
    });
    mocks.getWhatsNewForCoach.mockResolvedValue({
      success: true,
      items: [],
      truncated: false,
    });

    const element = (await WhatsNewPage()) as ReactElement;

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.getWhatsNewForCoach).toHaveBeenCalledTimes(1);
    expect(innermost(element).type).toBe(FairwayWhatsNewStub);
  });
});
