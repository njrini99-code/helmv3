// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard' }));
vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { PREVIEW_LIVE_NOW, PREVIEW_OWN_PLAYER_ID, PREVIEW_OWN_STATES } from '../../../preview/fixtures-live';
import { OwnLiveCard, lastHoles } from '../OwnLiveCard';

afterEach(cleanup);

const own = (state: keyof typeof PREVIEW_OWN_STATES) => {
  const s = PREVIEW_OWN_STATES[state]!;
  return render(<OwnLiveCard initial={s.snapshot} playerId={PREVIEW_OWN_PLAYER_ID} legs={s.legs} frozen now={PREVIEW_LIVE_NOW} />);
};

describe('Player Home: the own live card (CH-16680, CH-16681, CH-16683)', () => {
  it('draws nothing when the player has no round in progress', () => {
    const { container } = own('none');
    expect(container.firstChild).toBeNull();
  });

  it('CH-16680 titles the card and shows to-par, how far through, and the last three holes', () => {
    own('practice');
    expect(screen.getByRole('heading', { name: 'Round in progress' }).getAttribute('data-ch-code')).toBe('CH-16680');
    expect(screen.getByRole('img', { name: 'even par' }).textContent).toBe('E');
    expect(screen.getByText('thru 9')).toBeTruthy();
    const marks = screen.getByRole('img', { name: /^Last holes:/ });
    expect(marks.getAttribute('aria-label')).toBe('Last holes: hole 7, par; hole 8, bogey; hole 9, par');
    expect(marks.querySelectorAll('.ch-lv-bead')).toHaveLength(3);
  });

  it('CH-16681 names the next hole from the round, with its par and yardage', () => {
    own('practice');
    const next = document.querySelector('[data-ch-code="CH-16681"]');
    expect(next?.textContent).toBe('Next: 10 · Par 4 · 410 yds');
  });

  it('Resume round goes to the round the player is playing', () => {
    own('practice');
    const resume = screen.getByRole('link', { name: 'Resume round' });
    expect(resume.getAttribute('href')).toMatch(/^\/golf\/dashboard\/rounds\/continue\/[0-9a-f-]{36}$/);
  });

  it('a practice round shows strokes gained by leg, signed, in a two by two grid', () => {
    const { container } = own('practice');
    const legs = container.querySelector('.ch-lv-own__legs') as HTMLElement;
    const text = (name: string) => within(legs).getByText(name).parentElement?.querySelector('dd')?.textContent;
    expect(text('Off the tee')).toBe('+0.4');
    expect(text('Approach')).toBe('−0.3');
    expect(text('Around the green')).toBe('+0.2');
    expect(text('Putting')).toBe('+0.6');
  });

  it('a qualifier shows no strokes gained (owner call 2), even if legs were passed', () => {
    const s = PREVIEW_OWN_STATES.qualifier!;
    const { container } = render(<OwnLiveCard initial={s.snapshot} playerId={PREVIEW_OWN_PLAYER_ID} legs={{ tee: 1, approach: 1, short: 1, putting: 1 }} frozen now={PREVIEW_LIVE_NOW} />);
    expect(container.querySelector('.ch-lv-own__legs')).toBeNull();
    expect(screen.getByRole('link', { name: 'Resume round' })).toBeTruthy();
  });

  it('CH-16683 says how long ago the round was last saved once it is stale, and not before', () => {
    own('practice');
    expect(document.querySelector('[data-ch-code="CH-16683"]')).toBeNull();
    cleanup();
    own('stale');
    expect(document.querySelector('[data-ch-code="CH-16683"]')?.textContent).toBe('Last saved 15 min ago');
  });

  it('lastHoles keeps the last three scored holes in play order, across a shotgun start', () => {
    const lane = PREVIEW_OWN_STATES.practice!.snapshot.lanes[0]!;
    expect(lastHoles(lane).map((h) => h.n)).toEqual([7, 8, 9]);
    expect(lastHoles({ ...lane, startPosition: 10, holes: lane.holes.map((h) => ({ ...h, score: h.n >= 10 || h.n <= 2 ? 4 : null })) }).map((h) => h.n)).toEqual([18, 1, 2]);
  });
});
