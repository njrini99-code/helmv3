import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tourFixture } from '../preview/fixtures-tournaments';
import { History } from '../screens/tournaments/History';
import { trendNote, trendPoints, trendScale, trendX, trendY, seasonRuns } from '../screens/tournaments/history-model';
import type { ChTourHistoryData, ChTourHistorySearch, ChTourLoad } from '../screens/tournaments/types';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace }) }));

beforeEach(() => replace.mockClear());
afterEach(cleanup);

/**
 * History (P016, board `History`; phone `MHistory`): the team’s scoring against the course rating at every finished event,
 * a line a season, then every event. Catalog: CH-16201 and CH-16401 (the page states), CH-16236 (the trend didn’t load),
 * CH-16340 (no results to compare yet) and, in the ledger, CH-16311. The fixture has seven finished events: four last
 * season, three this one, Will graduated and Eli and Priya joined the lineup.
 */
const data = tourFixture('ready').history;
const search = (more: Partial<ChTourHistorySearch> = {}): ChTourHistorySearch => ({ mode: 'actual', adjust: 'raw', ...more });

const draw = (d: ChTourHistoryData, s: ChTourHistorySearch, opts: { phone?: boolean; load?: ChTourLoad } = {}) =>
  render(<History data={d} search={s} load={opts.load ?? 'ready'} phone={opts.phone ?? false} />).container;
const plain = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const MINUS_FIGURE = /^[+−]\d\.\d$|^0\.0$/;

describe('History, desktop', () => {
  it('draws a line a season, a dashed mean, a divider and a point per finished event', () => {
    const c = draw(data, search());
    expect(c.querySelector('h1')?.textContent).toBe('Tournaments');
    expect(c.querySelectorAll('.ch-tour-rev-trend__line')).toHaveLength(2);
    expect(c.querySelectorAll('.ch-tour-rev-trend__div')).toHaveLength(1);
    expect(c.querySelectorAll('.ch-tour-rev-trend__mean')).toHaveLength(1);
    const dots = c.querySelectorAll('.ch-tour-rev-dot');
    expect(dots).toHaveLength(7);
    const labels = Array.from(c.querySelectorAll('.ch-tour-rev-trend__labels li'));
    expect(labels).toHaveLength(7);
    for (const li of labels) expect(li.querySelector('b')?.textContent).toMatch(MINUS_FIGURE);
    expect(plain(labels[0])).toMatch(/^[+−]\d\.\dRiverside · Sep 25$/);
    expect(plain(labels[labels.length - 1])).toMatch(/Oakmont · Oct 26$/);
  });

  it('opens an event from its point, and says which have scorecards only', () => {
    const c = draw(data, search());
    const oak = within(c as HTMLElement).getByRole('link', { name: /^Oakmont Fall Classic: [+−]\d\.\d a round$/ });
    expect(oak).toHaveAttribute('href', '/golf/dashboard/tournaments/e33');
    const conf = within(c as HTMLElement).getByRole('link', { name: /^Conference Championship: .* a round, scorecards only$/ });
    expect(conf).toHaveClass('is-cards');
    expect(plain(c.querySelector('.ch-tour-rev-trend__key'))).toBe('A point opens its event. A grey ring means scorecards only.');
  });

  it('explains the gain without pretending it is the same players, from the data', () => {
    const c = draw(data, search());
    expect(plain(c.querySelector('.ch-tour-rev-trend__note'))).toMatch(
      /^This season’s 3 events average \d\.\d strokes a round (closer to|further from) the rating than last season\. Will graduated and Eli and Priya joined the lineup, so this is the team you fielded, not the same players over time\.$/,
    );
  });

  it('switches to returning players and puts the choice in the URL', () => {
    const c = draw(data, search());
    const before = Array.from(c.querySelectorAll('.ch-tour-rev-trend__labels b')).map((b) => b.textContent);
    fireEvent.click(within(c as HTMLElement).getByRole('radio', { name: 'Returning players' }));
    expect(replace).toHaveBeenCalledWith('/golf/dashboard/tournaments/history?mode=matched', { scroll: false });
    const after = Array.from(c.querySelectorAll('.ch-tour-rev-trend__labels b')).map((b) => b.textContent);
    expect(after).not.toEqual(before);
    expect(plain(c.querySelector('.ch-tour-rev-trend__s'))).toContain('returning players only');
    expect(plain(c.querySelector('.ch-tour-rev-trend__note'))).toMatch(/^The 4 returning players are \d\.\d strokes a round (closer to|further from) the rating than last season/);
  });

  it('measures against the field when asked, where returning players has no figure', () => {
    const c = draw(data, search({ adjust: 'field' }));
    expect(plain(c.querySelector('.ch-tour-rev-trend__t'))).toBe('Team scoring against the field');
    expect(within(c as HTMLElement).getByRole('radio', { name: 'Returning players' })).toBeDisabled();
    expect(c.querySelector('.ch-tour-rev-trend__note')).toBeNull();
    fireEvent.click(within(c as HTMLElement).getByRole('radio', { name: 'Course rating' }));
    expect(replace).toHaveBeenCalledWith('/golf/dashboard/tournaments/history', { scroll: false });
  });

  it('lists every event below, newest first by season, graduated players with the events they played', () => {
    const c = draw(data, search());
    expect(plain(c.querySelector('#ch-tour-hist-every-t')?.parentElement)).toContain('Graduated players stay with the events they played');
    const table = c.querySelector('[role="table"][aria-label="Season ledger"]') as HTMLElement;
    expect(within(table).getAllByRole('link')).toHaveLength(7);
    // Last season’s Riverside lineup still names Will.
    const riverside = within(table).getByRole('link', { name: 'Riverside Intercollegiate' }).closest('[role="row"]');
    expect(plain(riverside)).toContain('Theo, Sofia, Ava, Will, Jonah');
  });

  it('keeps one primary action, Add event, beside the switch', () => {
    const c = draw(data, search());
    const head = c.querySelector('.ch-tour-head') as HTMLElement;
    expect(head.querySelectorAll('.ch-btn--primary')).toHaveLength(1);
    expect(within(head).getByRole('radiogroup', { name: 'Tournaments view' })).toBeInTheDocument();
  });
});

describe('History, phone', () => {
  it('draws one bar a finished event, this season’s in green, each one opening its event', () => {
    const c = draw(data, search(), { phone: true });
    const bars = c.querySelectorAll('.ch-tour-rev-bar');
    expect(bars).toHaveLength(7);
    expect(c.querySelectorAll('.ch-tour-rev-bar.is-now')).toHaveLength(3);
    expect(plain(c.querySelector('.ch-tour-rev-trend__s'))).toBe('Per round · lower is better · actual lineups');
    expect(bars[bars.length - 1]).toHaveAttribute('href', '/golf/dashboard/tournaments/e33');
    // The tallest bar is the best (lowest) figure; the figure is on top of it.
    const heights = Array.from(bars).map((b) => parseFloat((b.querySelector('i') as HTMLElement).style.height));
    const nums = Array.from(bars).map((b) => Number((b.querySelector('b')?.textContent ?? '').replace('−', '-')));
    expect(heights.indexOf(Math.max(...heights))).toBe(nums.indexOf(Math.min(...nums)));
    expect(plain(c.querySelector('.ch-tour-rev-trend__note'))).toContain('Will graduated and Eli and Priya joined the lineup');
    // The ledger lives on Events on the phone.
    expect(c.querySelector('[role="table"]')).toBeNull();
  });
});

describe.each([
  ['desktop', false],
  ['phone', true],
] as const)('History states, %s', (_, phone) => {
  it('draws the loading state busy (CH-16401)', () => {
    const main = draw(data, search(), { load: 'loading', phone }).querySelector('[data-ch-tour-view="history"]');
    expect(main).toHaveAttribute('data-ch-code', 'CH-16401');
    expect(main).toHaveAttribute('aria-busy', 'true');
  });

  it('draws the page failure with its head (CH-16201)', () => {
    const c = draw(data, search(), { load: 'failed', phone });
    expect(c.querySelector('[data-ch-code="CH-16201"]')).toHaveAttribute('role', 'alert');
    expect(c.querySelector('h1')?.textContent).toBe('Tournaments');
  });

  it('names a failed trend read and keeps the events below it (CH-16236)', () => {
    const c = draw({ ...data, errors: { trend: true } }, search(), { phone });
    const notice = c.querySelector('[data-ch-code="CH-16236"]') as HTMLElement;
    expect(notice).toHaveAttribute('role', 'alert');
    expect(plain(notice)).toContain('The trend didn’t load');
    expect(c.querySelector('.ch-tour-rev-trend')).toBeNull();
    if (!phone) expect(c.querySelector('[role="table"]')).not.toBeNull();
  });

  it('asks for the first event when nothing is finished, with that as the only primary (CH-16340)', () => {
    const c = draw({ ...data, events: [], trend: [] }, search(), { phone });
    expect(plain(c.querySelector('[data-ch-code="CH-16340"]'))).toContain('No results to compare yet');
    expect(c.querySelectorAll('.ch-btn--primary')).toHaveLength(1);
  });

  it('says plainly when this season has no finished event yet (CH-16311)', () => {
    const last = data.events.filter((e) => e.seasonId !== '2026-27');
    const c = draw({ ...data, events: last, trend: data.trend.filter((t) => last.some((e) => e.id === t.eventId)) }, search(), { phone });
    if (!phone) expect(plain(c.querySelector('[data-ch-code="CH-16311"]'))).toContain('No finished events yet');
    expect(c.querySelector('.ch-tour-rev-trend__note')).toBeNull();
  });

  it('writes no exclamation mark and no straight apostrophe', () => {
    for (const s of [search(), search({ mode: 'matched' }), search({ adjust: 'field' })]) {
      expect(plain(draw(data, s, { phone }))).not.toMatch(/[!']/);
      cleanup();
    }
  });
});

describe('the trend model', () => {
  it('plots the lineup as fielded, the returning players, or the margin on the field', () => {
    const t = data.trend[0]!;
    expect(trendPoints(data, search())[0]?.value).toBe(t.actual);
    expect(trendPoints(data, search({ mode: 'matched' }))[0]?.value).toBe(t.matched);
    expect(trendPoints(data, search({ adjust: 'field' }))[0]?.value).toBe(t.vsField);
    expect(trendPoints(data, search({ adjust: 'field', mode: 'matched' }))[0]?.value).toBe(t.vsField);
  });

  it('breaks the line between seasons and scales with room above and below', () => {
    const pts = trendPoints(data, search());
    expect(seasonRuns(pts).map((r) => [r.seasonId, r.from, r.to])).toEqual([['2025-26', 0, 3], ['2026-27', 4, 6]]);
    const { lo, hi, mean } = trendScale(pts);
    const vals = pts.map((p) => p.value as number);
    expect(lo).toBeCloseTo(Math.min(...vals) - 0.6, 6);
    expect(hi).toBeCloseTo(Math.max(...vals) + 0.6, 6);
    expect(mean).toBeCloseTo(vals.reduce((a, b) => a + b, 0) / vals.length, 6);
    expect(trendScale([])).toEqual({ lo: -1, hi: 1, mean: null });
    // Lower is better, so lower sits nearer the top; points fill their own columns.
    expect(trendY(lo, lo, hi)).toBe(0);
    expect(trendY(hi, lo, hi)).toBe(1);
    expect(trendX(0, 4)).toBe(0.125);
    expect(trendX(3, 4)).toBe(0.875);
  });

  it('says the distance did not change when it did not, and says nothing without two seasons', () => {
    const flat = { ...data, trend: data.trend.map((t) => ({ ...t, actual: 1 })) };
    expect(trendNote(flat, search())).toMatch(/^This season’s 3 events average about the same distance from the rating as last season\./);
    expect(trendNote({ ...data, seasons: data.seasons.slice(0, 1) }, search())).toBeNull();
    expect(trendNote({ ...data, trend: data.trend.map((t) => ({ ...t, actual: null })) }, search())).toBeNull();
  });
});
