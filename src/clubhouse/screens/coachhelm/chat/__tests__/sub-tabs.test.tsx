import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px)' }));

import { ClubhouseMarker, type ChHelmViews } from '../../../../shell/context';
import { PLAYER_HELM_HREF } from '../../../../data/coachhelm-views-shape';
import { PlayerHelmTabs, playerHelmTabHref } from '../../views/PlayerHelmTabs';
import { COACHHELM_HREF, CoachHelmTabs, type CoachHelmView } from '../SubTabs';

const labels = () => screen.getAllByRole('radio').map((r) => r.textContent);
const coach = (views?: ChHelmViews, onGo?: (v: CoachHelmView) => void) =>
  render(
    <ClubhouseMarker {...{ role: 'coach' as const }} helmViews={views}>
      <CoachHelmTabs active="board" onGo={onGo} />
    </ClubhouseMarker>,
  );

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe('CoachHelm views a coach can reach', () => {
  it('flag off: Board and Ask, as before', () => {
    coach();
    expect(labels()).toEqual(['Board', 'Ask']);
  });

  it('the Brief tab is gone: Team and Ask are the views, and the Brief has no address of its own', () => {
    coach({ team: true });
    expect(labels()).toEqual(['Team', 'Ask']);
    expect(Object.keys(COACHHELM_HREF)).toEqual(['board', 'ask']);
  });
});

describe('CoachHelm views a player can reach', () => {
  const player = (views?: ChHelmViews) =>
    render(
      <ClubhouseMarker {...{ role: 'player' as const }} helmViews={views}>
        <PlayerHelmTabs active="board" />
      </ClubhouseMarker>,
    );

  it('flag off: no Ask', () => {
    player();
    expect(screen.queryByRole('radio', { name: 'Ask' })).toBeNull();
  });

  it('with player Ask on, Ask is one of the views', () => {
    player({ playerAsk: true });
    fireEvent.click(screen.getByRole('radio', { name: 'Ask' }));
    expect(push).toHaveBeenCalledWith('/golf/dashboard/coachhelm?view=ask');
  });

  // P1-57 (GAP-H-07): an owned strip sends Ask through the owner's switch, as every other view, so the tab takes the
  // selection on the tap and the page is marked busy; the strip pushes nothing of its own.
  it('with an owner, Ask goes through the owner’s switch, and its address is Ask’s own', () => {
    const onGo = vi.fn();
    render(
      <ClubhouseMarker {...{ role: 'player' as const }} helmViews={{ playerAsk: true }}>
        <PlayerHelmTabs active="board" onGo={onGo} />
      </ClubhouseMarker>,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Ask' }));
    expect(onGo).toHaveBeenCalledWith('ask');
    expect(push).not.toHaveBeenCalled();
    expect(playerHelmTabHref('ask')).toBe('/golf/dashboard/coachhelm?view=ask');
    expect(playerHelmTabHref('standing')).toBe(PLAYER_HELM_HREF.standing);
  });
});
