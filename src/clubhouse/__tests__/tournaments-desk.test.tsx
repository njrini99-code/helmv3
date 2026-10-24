import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../preview/fixtures-tournaments';
import { EventDesk } from '../screens/tournaments/EventDesk';
import type { ChTourDeskData, ChTourDeskSearch, ChTourLoad } from '../screens/tournaments/types';
import './dialog-polyfill';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace }) }));

beforeEach(() => replace.mockClear());
afterEach(cleanup);

/**
 * The event desk (P016, board `EventDesk` with `Contribution`, `Holes` and the evidence drawer). Catalog: CH-16201 and
 * CH-16401 (the page states), CH-16220 (the scorecards didn’t load), CH-16221 (the field didn’t load), CH-16222 (the
 * rounds didn’t load), CH-16320 (no scores yet), CH-16321 (no hole-by-hole scores), CH-16920 (results are provisional).
 * Figures come from the preview fixture: Oakmont 287, 286, 285 (858, −6), third of 14, 11 of 15 team scorecards with shot
 * data, Jonah’s 69 in round 3 the team’s best score and the only one of his three rounds that counted.
 */
const fixture = tourFixture('ready');
const oak = fixture.desks.e33!;
const tab = (t: ChTourDeskSearch['tab'], more: Partial<ChTourDeskSearch> = {}): ChTourDeskSearch => ({ tab: t, round: 'all', view: 'team', holes: 'to-par', ...more });

const draw = (data: ChTourDeskData, search: ChTourDeskSearch, opts: { phone?: boolean; load?: ChTourLoad } = {}) =>
  render(<EventDesk data={data} search={search} load={opts.load ?? 'ready'} phone={opts.phone ?? false} />).container;
function text(el: Element | null | undefined): string {
  if (!el) return '';
  const words: string[] = [];
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) words.push(n.textContent ?? '');
  return words.join(' ').replace(/\s+/g, ' ').trim();
}
/** The sentence as it reads, whitespace collapsed (for copy that has figures inside it). */
const plain = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const rowOf = (c: Element, name: string) => within(c as HTMLElement).getAllByRole('row').find((r) => r.querySelector('.ch-tour-desk-ct__n')?.textContent?.startsWith(name)) as HTMLElement;
const dialog = () => document.querySelector('dialog[open]') as HTMLElement | null;

describe('Event desk, desktop', () => {
  it('opens with the event, its result and the state of its numbers', () => {
    const c = draw(oak, tab('overview'));
    expect(c.querySelector('h1')?.textContent).toBe('Oakmont Fall Classic');
    const head = c.querySelector('.ch-tour-head') as HTMLElement;
    expect(text(head)).toContain('Oct 5 – 7, 2026 · Oakmont CC · Blue tees');
    expect(text(head)).toContain('54 holes · stroke play');
    expect(text(head)).toContain('5 count 4 each round');
    expect(text(head)).toContain('Completed');
    expect(text(head)).toContain('Official');
    expect(text(head)).toContain('15 scorecards · 11 with shot data');
    expect(c.querySelector('.ch-tour-chip.is-warn')?.textContent).toContain('11 with shot data');
    const res = c.querySelector('.ch-tour-desk-res') as HTMLElement;
    expect(text(res)).toBe('858 −6 3 of 14 teams');
    expect(res.querySelector('.ch-tour-under')?.textContent).toBe('−6');
    expect(within(head).getByRole('link', { name: /Official results/ })).toHaveAttribute('href', 'https://results.example.org/e33');
    expect(within(c as HTMLElement).getByRole('link', { name: 'Tournaments' })).toHaveAttribute('href', '/golf/dashboard/tournaments');
  });

  it('keeps one primary action, the next thing to do: Compare once the event is a result', () => {
    const c = draw(oak, tab('overview'));
    const primaries = c.querySelectorAll('.ch-btn--primary');
    expect(primaries).toHaveLength(1);
    expect(primaries[0]?.textContent).toBe('Compare');
    fireEvent.click(primaries[0]!);
    expect(replace).toHaveBeenCalledWith('/golf/dashboard/tournaments/e33?tab=compare', { scroll: false });
  });

  it('draws who counted: every score, NC where it did not count, the team under the lineup, individuals apart', () => {
    const c = draw(oak, tab('overview'));
    const table = c.querySelector('[role="table"][aria-label="Who counted"]') as HTMLElement;
    const jonah = rowOf(table, 'Jonah Okafor');
    expect(Array.from(jonah.querySelectorAll('[role="cell"]')).map((x) => text(x))).toEqual(['JO Jonah Okafor Sophomore', '75 NC', '76 NC', '69', '220', '1/3']);
    const sofia = rowOf(table, 'Sofia Alvarez');
    expect(Array.from(sofia.querySelectorAll('[role="cell"]')).map((x) => text(x)).slice(1, 4)).toEqual(['72', '71', '74 NC']);
    const team = rowOf(table, 'Team');
    expect(Array.from(team.querySelectorAll('[role="cell"]')).map((x) => text(x))).toEqual(['Team · lowest 4 each round', '287', '286', '285', '858 −6', 'Par 864']);
    const priya = rowOf(table, 'Priya Natarajan');
    expect(text(priya)).toContain('Individual entry · not in team score');
    expect(Array.from(priya.querySelectorAll('[role="cell"]')).map((x) => text(x)).slice(-2)).toEqual(['223', '—']);
    // The individual comes after the team row, never inside the team’s score.
    const order = within(table).getAllByRole('row').map((r) => r.querySelector('.ch-tour-desk-ct__n')?.textContent ?? '');
    expect(order.indexOf('Team · lowest 4 each round')).toBeLessThan(order.indexOf('Priya Natarajan'));
    expect(text(c.querySelector('.ch-tour-desk-key'))).toContain('Team totals use whole-round scores, never best holes');
  });

  it('says in words how a score counted, and whether it has shot data, on the key', () => {
    const c = draw(oak, tab('overview'));
    const key = within(c as HTMLElement).getByRole('button', { name: /Jonah Okafor round 3: 69, counted\. Open the evidence/ });
    expect(key).not.toHaveClass('no-shot');
    const nc = within(c as HTMLElement).getByRole('button', { name: /Jonah Okafor round 1: 75, not counted, scorecard only/ });
    expect(nc).toHaveClass('is-nc');
    expect(nc).toHaveClass('no-shot');
  });

  it('lists the findings, and a finding’s link opens its tab on its round', () => {
    const c = draw(oak, tab('overview'));
    const cards = c.querySelectorAll('.ch-tour-desk-fc');
    expect(cards).toHaveLength(3);
    expect(text(cards[0])).toContain('Round 3 · 285');
    expect(cards[0]?.querySelector('.ch-tour-chip')).toHaveClass('is-ok');
    expect(cards[1]?.querySelector('.ch-tour-chip')).toHaveClass('is-warn');
    fireEvent.click(within(cards[0] as HTMLElement).getByRole('button', { name: /See round 3 holes/ }));
    expect(replace).toHaveBeenCalledWith('/golf/dashboard/tournaments/e33?tab=holes&round=3', { scroll: false });
    expect(c.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Holes');
    expect(c.querySelector('[aria-label="Hole-by-hole scores, round 3"]')).not.toBeNull();
  });

  it('moves between sections with real tabs, and arrows move them', () => {
    const c = draw(oak, tab('overview'));
    const tabs = within(c.querySelector('[role="tablist"]') as HTMLElement).getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Overview', 'Who counted', 'Holes', 'Compare', 'Review3']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('tabindex', '0');
    expect(tabs[1]).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    expect(replace).toHaveBeenCalledWith('/golf/dashboard/tournaments/e33?tab=counted', { scroll: false });
    expect(c.querySelector('[role="tabpanel"]')).toHaveAttribute('aria-labelledby', 'ch-tour-desk-tab-counted');
  });

  it('narrows Who counted to one round and says who made the count', () => {
    const c = draw(oak, tab('counted', { round: 3 }));
    const table = c.querySelector('[role="table"][aria-label="Who counted in round 3"]') as HTMLElement;
    expect(rowOf(table, 'Jonah Okafor').textContent).toContain('Counted');
    expect(text(rowOf(table, 'Sofia Alvarez'))).toContain('Not counted');
    expect(text(rowOf(table, 'Priya Natarajan'))).toContain('Individual, not in the team score');
    expect(plain(c.querySelector('.ch-tour-desk-note'))).toContain('Round 3: the lowest 4 of 5 whole-round scores counted for 285 (−3).');
    // The pills are the URL: a press keeps the tab and sets the round.
    fireEvent.click(within(c as HTMLElement).getByRole('button', { name: 'Round 2' }));
    expect(replace).toHaveBeenCalledWith('/golf/dashboard/tournaments/e33?tab=counted&round=2', { scroll: false });
  });

  it('lists players flat by their own total when asked', () => {
    const c = draw(oak, tab('counted', { view: 'players' }));
    const names = within(c.querySelector('[role="table"]') as HTMLElement).getAllByRole('row').slice(1).map((r) => r.querySelector('.ch-tour-desk-ct__n')?.textContent);
    expect(names).toEqual(['Theo Marchetti', 'Ava Lindqvist', 'Eli Brandt', 'Sofia Alvarez', 'Jonah Okafor', 'Priya Natarajan']);
    expect(text(c.querySelector('[role="table"]'))).not.toContain('Team · lowest');
  });

  it('opens a score’s evidence: the formula, the round’s lineup scores, and the card', () => {
    const c = draw(oak, tab('overview'));
    fireEvent.click(within(c as HTMLElement).getByRole('button', { name: /Jonah Okafor round 3: 69/ }));
    const d = dialog() as HTMLElement;
    expect(d).not.toBeNull();
    expect(text(d.querySelector('h2'))).toBe('Jonah Okafor · round 3');
    expect(text(d)).toContain('The team’s round is the lowest 4 of 5 whole-round scores.');
    const figs = text(d.querySelector('.ch-tour-desk-ev__fig'));
    expect(figs).toContain('69 (−3)');
    expect(figs).toContain('5 lineup scores in round 3');
    expect(figs).toContain('Used 4 of 5');
    const rounds = Array.from(d.querySelectorAll('.ch-tour-desk-ev__list li')).map((li) => text(li));
    expect(rounds[0]).toBe('Oct 7 Jonah Okafor Counted 69');
    expect(rounds[rounds.length - 1]).toBe('Oct 7 Sofia Alvarez Not counted 74');
    const card = d.querySelector('.ch-tour-desk-ev__card') as HTMLElement;
    expect(text(card.querySelector('h3'))).toBe('Jonah Okafor · round 3 Oakmont CC · Blue tees');
    expect(card.querySelectorAll('.ch-score').length).toBe(18);
    expect(text(card.querySelector('p'))).toContain('69 (−3)');
    fireEvent.click(within(d).getByRole('button', { name: 'Close' }));
    expect(dialog()).toBeNull();
  });
});

describe('Event desk, holes', () => {
  it('draws a round’s holes with the team’s average against par and the three costliest holes marked', () => {
    const c = draw(oak, tab('holes', { round: 3 }));
    const grid = c.querySelector('[role="table"][aria-label="Hole-by-hole scores, round 3"]') as HTMLElement;
    const rows = within(grid).getAllByRole('row');
    expect(text(rows[0])).toBe('Hole 1 2 3 4 5 6 7 8 9 Out 10 11 12 13 14 15 16 17 18 In Tot');
    expect(text(rows[1])).toBe('Par 4 4 3 4 5 4 3 4 5 36 4 4 3 5 4 4 3 4 5 36 72');
    // Six cards: five lineup and one individual; the last row is the team’s own.
    expect(rows).toHaveLength(2 + 6 + 1);
    const jonah = rows.find((r) => r.textContent?.includes('Jonah')) as HTMLElement;
    const sums = Array.from(jonah.querySelectorAll('.ch-tour-desk-hg__tot')).map((x) => Number(x.textContent));
    // Out, In and the round: the nines add up to the 69 Jonah posted.
    expect(sums).toHaveLength(3);
    expect(sums[2]).toBe(69);
    expect(sums[0]! + sums[1]!).toBe(69);
    expect(rows[rows.length - 1]?.querySelectorAll('.ch-tour-desk-heat.is-worst').length).toBeLessThanOrEqual(3);
    expect(c.querySelectorAll('.ch-tour-desk-heat.is-worst').length).toBeGreaterThan(0);
    expect(plain(c.querySelector('.ch-tour-desk-note'))).toMatch(/^Highlighted: the \d+ holes? that cost the team most in round 3, averaged over the 5 team players\./);
    expect(grid.querySelectorAll('.ch-tour-under').length).toBeGreaterThan(0);
  });

  it('switches to scores (the kit’s marks) and to counting (grouped), keeping the URL in step', () => {
    const c = draw(oak, tab('holes', { round: 3 }));
    expect(c.querySelectorAll('.ch-score').length).toBe(0);
    fireEvent.click(within(c as HTMLElement).getByRole('radio', { name: 'Scores' }));
    expect(replace).toHaveBeenCalledWith('/golf/dashboard/tournaments/e33?tab=holes&round=3&holes=scores', { scroll: false });
    expect(c.querySelectorAll('.ch-score').length).toBeGreaterThan(0);
    fireEvent.click(within(c as HTMLElement).getByRole('radio', { name: 'Counting' }));
    const groups = Array.from(c.querySelectorAll('.ch-tour-desk-hg__group')).map((g) => g.textContent);
    expect(groups).toEqual(['Counted', 'Not counted', 'Individuals']);
  });

  it('opens a hole’s evidence from the cell', () => {
    const c = draw(oak, tab('holes', { round: 3 }));
    const cell = within(c as HTMLElement).getAllByRole('button', { name: /^Jonah Okafor hole 13:/ })[0]!;
    fireEvent.click(cell);
    expect(text(dialog()?.querySelector('h2'))).toBe('Jonah Okafor · round 3');
  });
});

describe('Event desk, phone', () => {
  it('draws the result, the sections as a scroller, and who counted in the board’s narrow columns', () => {
    const c = draw(oak, tab('overview'), { phone: true });
    expect(c.querySelector('.ch-tour')).toHaveClass('is-phone');
    expect(text(c.querySelector('.ch-tour-desk-res'))).toBe('858 −6 3 of 14 teams');
    const table = c.querySelector('[role="table"][aria-label="Who counted"]') as HTMLElement;
    const jonah = rowOf(table, 'Jonah');
    expect(Array.from(jonah.querySelectorAll('[role="cell"]')).map((x) => text(x))).toEqual(['Jonah 1/3 counted', '75 NC', '76 NC', '69', '220']);
    expect(text(rowOf(table, 'Priya'))).toContain('Individual');
    expect(text(rowOf(table, 'Team'))).toContain('858 −6');
    expect(c.querySelectorAll('.ch-btn--primary')).toHaveLength(1);
    expect(c.querySelector('[role="tablist"]')).toHaveClass('ch-hscroll');
  });

  it('scrolls the hole grid sideways inside a focusable region and says so', () => {
    const c = draw(oak, tab('holes', { round: 3 }), { phone: true });
    const grid = c.querySelector('[role="table"][aria-label="Hole-by-hole scores, round 3"]') as HTMLElement;
    expect(grid).toHaveAttribute('tabindex', '0');
    expect(text(c.querySelector('.ch-tour-desk-hg'))).toContain('Swipe the grid sideways. The page itself doesn’t scroll sideways.');
    expect(within(c as HTMLElement).getByRole('radio', { name: 'R3' })).toBeInTheDocument();
  });
});

describe.each([
  ['desktop', false],
  ['phone', true],
] as const)('Event desk states, %s', (_, phone) => {
  it('draws the loading state busy at its final geometry (CH-16401)', () => {
    const c = draw(oak, tab('overview'), { load: 'loading', phone });
    const main = c.querySelector('[data-ch-tour-view="desk"]');
    expect(main).toHaveAttribute('data-ch-code', 'CH-16401');
    expect(main).toHaveAttribute('aria-busy', 'true');
    expect(c.querySelector('h1')).toBeNull();
  });

  it('draws the page failure with the event’s name (CH-16201)', () => {
    const c = draw(oak, tab('overview'), { load: 'failed', phone });
    expect(c.querySelector('[data-ch-code="CH-16201"]')).toHaveAttribute('role', 'alert');
    expect(c.querySelector('h1')?.textContent).toBe('Oakmont Fall Classic');
  });

  it('names a failed scorecards read in the Holes tab and keeps team scores (CH-16220)', () => {
    const partial = tourFixture('partial').desks.e33!;
    const c = draw(partial, tab('holes'), { phone });
    const notice = c.querySelector('[data-ch-code="CH-16220"]') as HTMLElement;
    expect(notice).toHaveAttribute('role', 'alert');
    expect(text(notice)).toContain('The scorecards didn’t load');
    expect(c.querySelector('[data-ch-code="CH-16321"]')).toBeNull();
  });

  it('names a failed field read without hiding the scores (CH-16221)', () => {
    const partial = tourFixture('partial').desks.e33!;
    const c = draw(partial, tab('overview'), { phone });
    expect(text(c.querySelector('[data-ch-code="CH-16221"]'))).toContain('The field didn’t load');
    expect(c.querySelector('[role="table"]')).not.toBeNull();
  });

  it('names a failed rounds read instead of drawing a table of nothing (CH-16222)', () => {
    const c = draw({ ...oak, errors: { rounds: true } }, tab('overview'), { phone });
    expect(text(c.querySelector('[data-ch-code="CH-16222"]'))).toContain('The rounds didn’t load');
    expect(c.querySelector('[role="table"]')).toBeNull();
  });

  it('says there are no scores yet for an event that has not been played, with where the lineup stands (CH-16320)', () => {
    const next = fixture.desks.e34!;
    const c = draw(next, tab('overview'), { phone });
    const empty = c.querySelector('[data-ch-code="CH-16320"]') as HTMLElement;
    expect(text(empty)).toContain('No scores yet');
    expect(text(empty)).toContain('Draft lineup · 4 of 5 set · locks Tue 7:50 AM.');
    expect(text(empty)).toContain('Lineup from the Pinehurst qualifier · 4 of 5 set.');
    // The week’s action is the lineup, and it is the only primary.
    expect(c.querySelectorAll('.ch-btn--primary')).toHaveLength(1);
    expect(within(c as HTMLElement).getByRole('link', { name: 'Edit lineup' })).toHaveAttribute('href', '/golf/dashboard/tournaments/e34/lineup');
  });

  it('says there are no hole-by-hole scores when the ledger is empty (CH-16321)', () => {
    const c = draw({ ...oak, holes: null }, tab('holes'), { phone });
    expect(text(c.querySelector('[data-ch-code="CH-16321"]'))).toContain('No hole-by-hole scores yet');
  });

  it('warns when the host’s number differs from our card, and says which (CH-16920)', () => {
    const provisional = tourFixture('provisional').desks.e33!;
    const c = draw(provisional, tab('overview'), { phone });
    const warn = c.querySelector('[data-ch-code="CH-16920"]') as HTMLElement;
    expect(warn).toHaveAttribute('role', 'status');
    expect(text(warn.querySelector('.ch-tour-desk-warn__t'))).toBe('Results are provisional');
    expect(plain(warn.querySelectorAll('p')[1])).toBe('The imported leaderboard has Sofia at 73 in round 3. The scorecard says 74. Team totals use the scorecard until you confirm which is right.');
    expect(c.querySelector('[data-ch-trust="final"]')).not.toBeNull();
    // And no warning when nothing differs.
    cleanup();
    expect(draw(oak, tab('overview'), { phone }).querySelector('[data-ch-code="CH-16920"]')).toBeNull();
  });

  it('writes no exclamation mark and no straight apostrophe', () => {
    for (const data of [oak, fixture.desks.e34!, tourFixture('partial').desks.e33!, tourFixture('provisional').desks.e33!]) {
      for (const t of ['overview', 'counted', 'holes', 'compare', 'review'] as const) {
        const out = text(draw(data, tab(t), { phone }));
        expect(out).not.toMatch(/[!']/);
        cleanup();
      }
    }
  });
});
