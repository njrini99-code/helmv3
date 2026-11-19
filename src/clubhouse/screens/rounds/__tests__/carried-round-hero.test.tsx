import { act, cleanup, render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/golf/dashboard/rounds/r1' }));

import { carryTo, resetCarryForTests } from '../../../lib/carry';
import { CarriedRoundHero } from '../CarriedRoundHero';
import { carriedTeamRound } from '../TeamRounds';
import type { ChTeamRound } from '../../../data/team-rounds-shape';

/** E-1 (audit 2026-11-19): a round opened from a team row lands on its hero, carried from the row, while the rest loads. */

const row = {
  id: 'r1',
  date: '2026-09-26',
  course: 'Pinehurst No. 2',
  tee: 'Blue tees',
  teeColor: 'blue',
  type: 'qualifier',
  holes: 18,
  score: 74,
  toPar: 2,
  player: 'Dylan Brooks',
  playerId: 'p1',
} as unknown as ChTeamRound;

beforeEach(() => resetCarryForTests());
afterEach(cleanup);

describe('the carried round hero', () => {
  it('draws the plain block when nothing was carried (a deep link)', () => {
    const { container } = render(<CarriedRoundHero />);
    expect(container.querySelector('.ch-rv-hero')).toBeNull();
    expect(container.querySelector('.ch-skel')).not.toBeNull();
  });

  it('draws what the row showed, in the review hero, with the score as the shared end', () => {
    carryTo('/golf/dashboard/rounds/r1?from=rounds', carriedTeamRound(row));
    const { container } = render(<CarriedRoundHero />);
    const hero = container.querySelector('.ch-rv-hero')!;
    expect(hero.getAttribute('aria-hidden')).toBe('true');
    expect(hero.textContent).toContain('Dylan Brooks · Sat Sep 26 · Qualifier');
    expect(hero.textContent).toContain('Pinehurst No. 2');
    expect(hero.querySelector('[data-ch-share="round-score"]')!.textContent).toBe('74');
    expect(hero.querySelector('.ch-rv-hero__s em')!.textContent).toBe('+2');
  });

  it('renders nothing carried on the server, so hydration matches the deep link', () => {
    carryTo('/golf/dashboard/rounds/r1', carriedTeamRound(row));
    expect(renderToString(<CarriedRoundHero />)).not.toContain('Pinehurst');
  });

  it('follows a carry that arrives after it mounted', () => {
    const { container } = render(<CarriedRoundHero />);
    act(() => carryTo('/golf/dashboard/rounds/r1', carriedTeamRound(row)));
    expect(container.querySelector('.ch-rv-hero')).not.toBeNull();
  });
});
