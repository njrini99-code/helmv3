import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px)' }));

import { ClubhouseMarker, type ChHelmViews } from '../../../../shell/context';
import { PlayerHelmTabs } from '../../views/PlayerHelmTabs';
import { COACHHELM_HREF, CoachHelmTabs, type CoachHelmView } from '../SubTabs';

const labels = () => screen.getAllByRole('radio').map((r) => r.textContent);
const coach = (views?: ChHelmViews, onGo?: (v: CoachHelmView) => void) =>
  render(
    <ClubhouseMarker role="coach" helmViews={views}>
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

  it('with the Brief on, it sits between the first view and Ask, and goes to its own address', () => {
    const onGo = vi.fn();
    coach({ brief: true, team: true }, onGo);
    expect(labels()).toEqual(['Team', 'Brief', 'Ask']);
    fireEvent.click(screen.getByRole('radio', { name: 'Brief' }));
    expect(onGo).toHaveBeenCalledWith('brief');
    expect(COACHHELM_HREF.brief).toBe('/golf/dashboard/coachhelm?view=brief');
  });
});

describe('CoachHelm views a player can reach', () => {
  const player = (views?: ChHelmViews) =>
    render(
      <ClubhouseMarker role="player" helmViews={views}>
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
});
