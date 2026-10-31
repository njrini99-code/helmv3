import { cleanup, render, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../preview/fixtures-tournaments';
import { TournamentsHome } from '../screens/tournaments/TournamentsHome';
import type { ChTourHomeData, ChTourLoad } from '../screens/tournaments/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));

afterEach(cleanup);

/**
 * Season home (P016, board `Home` and the phone's `MEvents`). Catalog: CH-16201 (the one read failed), CH-16401 (on its
 * way), CH-16210 (the events section didn’t load), CH-16352 (P-5's first run, in place of the retired no-tournaments state), CH-16311 (no finished events in the
 * season), CH-16312 (nothing on the calendar). The figures come from the preview fixture, which carries Oakmont as
 * 858 (−6), third of 14, with 11 of 15 team scorecards holding shot data.
 */
const ready = tourFixture('ready').home;

const draw = (data: ChTourHomeData, opts: { phone?: boolean; load?: ChTourLoad } = {}) => render(<TournamentsHome data={data} load={opts.load ?? 'ready'} phone={opts.phone ?? false} />).container;
/** The words an element shows, one space between boxes (so a date block reads "2 Nov", not "2Nov"). */
function text(el: Element | null | undefined): string {
  if (!el) return '';
  const words: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) words.push(n.textContent ?? '');
  return words.join(' ').replace(/\s+/g, ' ').trim();
}
const without = (data: ChTourHomeData, drop: (e: ChTourHomeData['events'][number]) => boolean): ChTourHomeData => ({ ...data, events: data.events.filter((e) => !drop(e)) });

describe('Tournaments home, desktop', () => {
  it('opens on the next event as the one green card, with the week’s one action', () => {
    const c = draw(ready);
    expect(c.querySelector('[data-ch-tour-view="home"] h1')?.textContent).toBe('Tournaments');
    const card = c.querySelector('.ch-tour-home-feat') as HTMLElement;
    expect(text(card)).toContain('Oct 20 – 21 · Pinehurst No. 2');
    // The days come from the data's own clock (Wednesday, six days out), never from the machine's.
    expect(text(card)).toContain('In 6 days');
    expect(text(card)).toContain('Pinehurst Intercollegiate');
    expect(text(card)).toContain('36 holes · stroke play · 5 count 4 each round. Lineup from the Pinehurst qualifier · 4 of 5 set.');
    expect(text(card)).toContain('Lineup isn’t set · locks Tue 7:50 AM');
    const go = within(card).getByRole('link', { name: 'Build lineup' });
    expect(go).toHaveAttribute('href', '/golf/dashboard/tournaments/e34/lineup');
    expect(within(card).getByRole('link', { name: 'Compare lineup options' })).toHaveAttribute('href', '/golf/dashboard/tournaments/compare?event=e34');
    expect(within(card).getByRole('link', { name: 'Pinehurst Intercollegiate' })).toHaveAttribute('href', '/golf/dashboard/tournaments/e34');
  });

  it('keeps one primary action: the card’s, with Add event a quiet key in the head', () => {
    const c = draw(ready);
    expect(c.querySelectorAll('.ch-btn--primary')).toHaveLength(1);
    const add = within(c.querySelector('.ch-tour-head') as HTMLElement).getByRole('link', { name: 'Add event' });
    expect(add).toHaveAttribute('href', '/golf/dashboard/tournaments/new');
    expect(add).not.toHaveClass('ch-btn--primary');
  });

  it('lists the other events on the calendar with their date, course and note', () => {
    const c = draw(ready);
    const row = within(c.querySelector('.ch-tour-home-others') as HTMLElement).getByRole('link', { name: /Holly Ridge Classic/ });
    expect(text(row)).toContain('2 Nov');
    expect(text(row)).toContain('Holly Ridge · 36 holes · Qualifier opens Oct 24');
    expect(text(row)).toContain('Upcoming');
    expect(row).toHaveAttribute('href', '/golf/dashboard/tournaments/e35');
    expect(text(c.querySelector('#ch-tour-home-up-t')?.parentElement)).toContain('2 events on the calendar');
  });

  it('draws the season ledger: finish, team total with its sign, and shot-data coverage per event', () => {
    const c = draw(ready);
    const table = c.querySelector('[role="table"][aria-label="Season ledger"]') as HTMLElement;
    expect(within(table).getByText('This season · 2026–27')).toBeInTheDocument();
    expect(within(table).getByText('Last season · 2025–26')).toBeInTheDocument();
    const oak = within(table).getByRole('link', { name: 'Oakmont Fall Classic' }).closest('[role="row"]') as HTMLElement;
    expect(oak).toHaveAttribute('role', 'row');
    const cells = Array.from(oak.querySelectorAll('[role="cell"]')).map((x) => text(x));
    expect(cells[0]).toBe('Oakmont Fall Classic Oakmont CC · Theo, Sofia, Ava, Jonah, Eli');
    expect(cells[1]).toBe('Oct 5 – 7');
    expect(cells[2]).toBe('54 holes · 5-count-4');
    expect(cells[3]).toBe('858 −6');
    expect(cells[4]).toBe('3 of 14');
    expect(cells[5]).toBe('11 of 15');
    // Under par is the only red, and the minus sign is there beside it.
    expect(oak.querySelector('.ch-tour-under')?.textContent).toBe('−6');
    // Newest first inside a season; last season’s conference event was scorecards only.
    const names = Array.from(table.querySelectorAll('.ch-tour-led__open')).map((a) => a.textContent);
    expect(names.slice(0, 3)).toEqual(['Oakmont Fall Classic', 'Dogwood Collegiate', 'Sedgefield Invitational']);
    const conf = within(table).getByRole('link', { name: 'Conference Championship' }).closest('[role="row"]') as HTMLElement;
    expect(text(conf)).toContain('Scorecards only');
  });

  it('moves with the data’s clock: the day before reads Tomorrow', () => {
    const c = draw({ ...ready, now: '2026-10-19T12:00:00-04:00' });
    expect(text(c.querySelector('.ch-tour-home-feat'))).toContain('Tomorrow');
  });

  it('goes live: the card says so and the action follows the round (CH-16601 is the wash, not drawn here)', () => {
    const live = tourFixture('live').home;
    const c = draw(live);
    const card = c.querySelector('.ch-tour-home-feat') as HTMLElement;
    expect(text(card)).toContain('Live now');
    expect(within(card).getByRole('link', { name: 'Follow live' })).toHaveAttribute('href', '/golf/dashboard/tournaments/e34/live');
    expect(within(card).queryByRole('link', { name: 'Compare lineup options' })).toBeNull();
  });
});

describe('Tournaments home, phone', () => {
  it('draws the card, then the ledger as grouped rows with the finish and the score', () => {
    const c = draw(ready, { phone: true });
    expect(c.querySelector('.ch-tour')).toHaveClass('is-phone');
    const card = c.querySelector('.ch-tour-home-feat') as HTMLElement;
    expect(text(card)).toContain('In 6 days');
    expect(within(card).getByRole('link', { name: 'Build lineup' })).toBeInTheDocument();
    // The phone board has no second key on the card.
    expect(within(card).queryByRole('link', { name: 'Compare lineup options' })).toBeNull();
    const oak = within(c).getByRole('link', { name: /Oakmont Fall Classic/ });
    expect(text(oak)).toBe('Oakmont Fall Classic Oct 5 · Oakmont CC 3 of 14 858 · −6');
    const past = within(c).getByRole('link', { name: /Conference Championship/ });
    // Last season shows the month and year, the finish and the to-par alone, and says scorecards only.
    expect(text(past)).toBe('Conference Championship Apr 2026 · scorecards only 4 of 10 −3');
    expect(c.querySelectorAll('.ch-btn--primary')).toHaveLength(1);
    expect(c.querySelector('[role="table"]')).toBeNull();
  });

  it('keeps Add event full width under the switch', () => {
    const c = draw(ready, { phone: true });
    const actions = c.querySelector('.ch-tour-head__a') as HTMLElement;
    expect(within(actions).getByRole('radiogroup', { name: 'Tournaments view' })).toBeInTheDocument();
    expect(within(actions).getByRole('link', { name: 'Add event' })).toBeInTheDocument();
  });

  it('lists later events under the card as Coming up', () => {
    const c = draw(ready, { phone: true });
    expect(within(c).getByRole('heading', { name: 'Coming up' })).toBeInTheDocument();
    expect(within(c).getByRole('link', { name: 'Holly Ridge Classic, Nov 2 – 3' })).toBeInTheDocument();
  });
});

describe.each([
  ['desktop', false],
  ['phone', true],
] as const)('Tournaments home states, %s', (_, phone) => {
  it('draws the loading state at its final geometry and busy (CH-16401)', () => {
    const c = draw(ready, { load: 'loading', phone });
    const main = c.querySelector('[data-ch-tour-view="home"]');
    expect(main).toHaveAttribute('data-ch-code', 'CH-16401');
    expect(main).toHaveAttribute('aria-busy', 'true');
    expect(main).toHaveAttribute('aria-label', 'Loading tournaments');
    expect(c.querySelector('h1')).toBeNull();
  });

  it('draws the page failure with its head (CH-16201)', () => {
    const c = draw(ready, { load: 'failed', phone });
    const alert = c.querySelector('[data-ch-code="CH-16201"]');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert?.textContent).toContain('Tournaments didn’t load');
    expect(c.querySelector('h1')?.textContent).toBe('Tournaments');
  });

  it('says the events section didn’t load, with Try again, and never an empty list (CH-16210)', () => {
    const c = draw({ ...ready, errors: { events: true } }, { phone });
    const notice = c.querySelector('[data-ch-code="CH-16210"]') as HTMLElement;
    expect(notice).toHaveAttribute('role', 'alert');
    expect(text(notice)).toContain('The events didn’t load');
    expect(within(notice).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(c.querySelector('.ch-tour-home-feat')).toBeNull();
    expect(c.querySelector('[data-ch-code="CH-16352"]')).toBeNull();
  });

  it('draws the home without a notice when only the sections it does not draw failed (partial)', () => {
    const c = draw(tourFixture('partial').home, { phone });
    expect(c.querySelector('[data-ch-code="CH-16210"]')).toBeNull();
    expect(c.querySelector('.ch-tour-home-feat')).not.toBeNull();
  });

  it('asks for the first tournament on the calendar when there are none, with that as the only primary (CH-16352)', () => {
    const c = draw(tourFixture('empty').home, { phone });
    const empty = c.querySelector('[data-ch-code="CH-16352"]') as HTMLElement;
    expect(text(empty)).toContain('Your season starts on the calendar');
    expect(within(empty).getByRole('link', { name: 'Add a tournament' })).toHaveAttribute('href', '/golf/dashboard/calendar?new=1&type=tournament');
    expect(within(empty).getByRole('link', { name: 'Plan from here instead' })).toHaveAttribute('href', '/golf/dashboard/tournaments/new');
    expect(c.querySelectorAll('.ch-btn--primary')).toHaveLength(1);
    expect(c.querySelectorAll('a[href="/golf/dashboard/tournaments/new"]')).toHaveLength(1);
  });

  it('says plainly when the season has no finished event yet (CH-16311)', () => {
    const c = draw(without(ready, (e) => e.seasonId === '2026-27' && e.status === 'complete'), { phone });
    const none = c.querySelector('[data-ch-code="CH-16311"]') as HTMLElement;
    expect(text(none)).toContain('No finished events yet');
    expect(text(c)).toContain('Last season · 2025–26');
  });

  it('says plainly when nothing is on the calendar (CH-16312)', () => {
    const c = draw(without(ready, (e) => e.status !== 'complete'), { phone });
    expect(text(c.querySelector('[data-ch-code="CH-16312"]'))).toContain('Nothing on the calendar');
    expect(c.querySelector('.ch-tour-home-feat')).toBeNull();
  });

  it('writes no exclamation mark and no straight apostrophe, and no digit counts up', () => {
    for (const data of [ready, tourFixture('live').home, tourFixture('empty').home, tourFixture('thin').home]) {
      const t = text(draw(data, { phone }));
      expect(t).not.toMatch(/[!']/);
      cleanup();
    }
  });
});
