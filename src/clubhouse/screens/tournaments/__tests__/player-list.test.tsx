// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../../../preview/fixtures-tournaments';
import { PlayerEvent } from '../PlayerEvent';
import type { ChTourPlayerData } from '../types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/app/golf/actions/tournaments-player', () => ({ saveTournamentReflection: vi.fn() }));
vi.mock('@/app/golf/actions/tournaments-holes', () => ({ saveTournamentHole: vi.fn() }));

const fx = tourFixture('ready').player;
const draw = (d: ChTourPlayerData, phone = false) => render(<PlayerEvent data={d} load="ready" phone={phone} />).container;

afterEach(cleanup);

/**
 * The list said one thing three times: a line under the title ("Your team’s events, with the days, the tee times and
 * your own scores."), then each section's own caption ("2 events on the calendar", "Your own scores, round by round").
 * The captions say it where it applies, so the page line is gone at both widths.
 */
describe('the player’s Tournaments list · said once', () => {
  it.each([
    ['desktop', false],
    ['phone', true],
  ])('%s: the title stands alone, and the sections keep their captions', (_, phone) => {
    const c = draw(fx.list, phone);
    expect(c.querySelector('h1')?.textContent).toBe('Tournaments');
    expect(c.textContent).not.toContain('Your team’s events, with the days');
    const captions = [...c.querySelectorAll('.ch-sec__meta')].map((x) => x.textContent);
    expect(captions).toEqual(phone ? ['1 event', 'Your total, to par'] : ['2 events on the calendar', 'Your own scores, round by round']);
  });

  it('desktop: nothing sits between the title and the head’s rule', () => {
    const c = draw(fx.list);
    expect(c.querySelector('.ch-tour-head__t p')).toBeNull();
  });
});
