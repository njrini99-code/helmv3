import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_TEAM_STATS } from '../../../preview/fixtures-stats';
import { POOLED_SD } from '../../../lib/stats-signal';
import type { ChTeamStats } from '../../../data/stats-team';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));

const { TeamRank } = await import('../TeamRank');
const { rankLabel, rankReadout, rankScale, rankSummary, rankTicks, shortName, teamMeanFor, teamRankRows } = await import('../team-rank');

afterEach(cleanup);
beforeEach(() => push.mockClear());

const D = PREVIEW_TEAM_STATS;
type Row = ChTeamStats['grid'][number];
const row = (id: string, total: number | null, n: number, se: number | null, extra: Partial<Row> = {}): Row => ({
  id,
  name: id,
  rounds: n,
  legs: [total, total, total, total],
  total,
  change: null,
  avg: 72,
  spread: { sg: { n, se }, legs: [0, 1, 2, 3].map(() => ({ n, se })), score: { n, se: 1 } },
  ...extra,
});

describe('teamRankRows', () => {
  it('ranks by the dot, best first, and ties neighbors closer than one standard error of their difference', () => {
    // a to b: gap 0.2, diff se √(0.3² + 0.3²) ≈ 0.42, tied; b to c: gap 1.0, not tied; c to d: gap 0.3, tied.
    const rows = teamRankRows([row('c', 0.5, 10, 0.3), row('a', 1.7, 10, 0.3), row('d', 0.2, 10, 0.3), row('b', 1.5, 10, 0.3)], 'sg');
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(rows.map(rankLabel)).toEqual(['T1', 'T1', 'T3', 'T3']);
  });

  it('a tie never reorders: tied players keep the order of their dots', () => {
    const rows = teamRankRows([row('low', 1.0, 10, 2), row('high', 1.1, 10, 2)], 'sg');
    expect(rows.map((r) => r.id)).toEqual(['high', 'low']);
    expect(rows.every((r) => r.tied)).toBe(true);
  });

  it('the scoring average ranks lowest first', () => {
    const rows = teamRankRows([row('a', 0, 10, 0.1, { avg: 74 }), row('b', 0, 10, 0.1, { avg: 70 })], 'score');
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('follows the floors: early reads are muted with a tag; under the show floor there is no value, no rank, and what it needs', () => {
    const rows = teamRankRows([row('steady', 1, 10, 0.5), row('early', 0.5, 6, 0.8), row('none', null, 2, null)], 'sg');
    expect(rows.map((r) => [r.id, r.state])).toEqual([
      ['steady', 'steady'],
      ['early', 'early'],
      ['none', 'none'],
    ]);
    expect(rows[1]!.tag).toBe('Early read · 6 rounds');
    expect(rows[2]).toMatchObject({ value: null, rank: null, tag: 'Needs 3 rounds' });
  });

  it('around the green and putting have their own floor: five rounds to show, fifteen to be steady', () => {
    const rows = teamRankRows([row('four', 0.4, 4, 0.5), row('ten', 0.2, 10, 0.3)], 'putting');
    expect(rows.find((r) => r.id === 'four')).toMatchObject({ state: 'none', value: null, tag: 'Needs 5 rounds' });
    expect(rows.find((r) => r.id === 'ten')).toMatchObject({ state: 'early', value: 0.2 });
  });

  it('without the loader’s samples, falls back on the pooled spread over the player’s rounds', () => {
    const { spread: _drop, ...bare } = row('x', 1, 9, null);
    void _drop;
    const [r] = teamRankRows([bare], 'sg');
    expect(r!.n).toBe(9);
    expect(r!.se).toBeCloseTo(POOLED_SD.sg / 3, 10);
  });
});

describe('scale, readout and summary', () => {
  it('the scale holds every whisker, the team mean and zero; scores run so that lower is to the right', () => {
    const rows = teamRankRows([row('a', 1.5, 10, 0.5), row('b', 0.5, 10, 0.5)], 'sg');
    const s = rankScale(rows, -0.2, 'sg');
    expect(s.lo).toBeLessThan(-0.2);
    expect(s.hi).toBeGreaterThan(2);
    expect(s.at(1.5)).toBeGreaterThan(s.at(0.5));
    const sc = teamRankRows([row('a', 0, 10, 0.1, { avg: 70 }), row('b', 0, 10, 0.1, { avg: 75 })], 'score');
    const ss = rankScale(sc, 72, 'score');
    expect(ss.at(70)).toBeGreaterThan(ss.at(75));
  });

  it('ticks are tidy and inside the range', () => {
    expect(rankTicks(-0.68, 0.78, 3)).toEqual([-0.5, 0, 0.5]);
    expect(rankTicks(69.6, 79.6, 5)).toEqual([70, 72, 74, 76, 78]);
  });

  it('the readout names the player, the figure, the rank, the sample, the likely range and the team', () => {
    const rows = teamRankRows(D.grid, 'sg');
    expect(rankReadout(rows[1]!, 'sg', 6, -0.5)).toBe('Sofia Alvarez · +1.2 a round · T1 of 6 · 10 rounds · likely range +0.5 to +1.9 · team −0.5');
    const eli = rows.find((r) => r.id === 'eli')!;
    expect(rankReadout(eli, 'sg', 6, null)).toContain('Early read · 6 rounds');
    const luca = rows.find((r) => r.id === 'luca')!;
    expect(rankReadout(luca, 'sg', 6, null)).toBe('Luca Ferraro · Needs 3 rounds');
  });

  it('the scoring readout keeps its likely range in numeric order even though the axis runs the other way', () => {
    const rows = teamRankRows(D.grid, 'score');
    const theo = rows[0]!;
    const text = rankReadout(theo, 'score', 6, null);
    const [, a, b] = /likely range ([\d.]+) to ([\d.]+)/.exec(text)!;
    expect(Number(a)).toBeLessThan(Number(b));
  });

  it('the summary says the order, the team and who has too few rounds', () => {
    const s = rankSummary(teamRankRows(D.grid, 'sg'), 'sg', -0.5);
    expect(s).toMatch(/^Players ranked by strokes gained: T1 Theo Marchetti \+1\.7;/);
    expect(s).toContain('Eli Brandt −0.5, early read');
    expect(s).toContain('Team −0.5.');
    expect(s).toContain('Luca Ferraro: needs 3 rounds.');
    expect(rankSummary(teamRankRows(D.grid, 'score'), 'score', 73.6)).toContain('lower is better');
  });

  it('the team mean is the page’s own figure for the metric', () => {
    expect(teamMeanFor('sg', D.team, D.legTotals)).toBe(D.team.sgMean);
    expect(teamMeanFor('approach', D.team, D.legTotals)).toBe(D.legTotals[1]);
    expect(teamMeanFor('score', D.team, D.legTotals)).toBe(D.team.scoreMean);
  });

  it('shortens names for the phone', () => {
    expect(shortName('Theo Marchetti')).toBe('Theo M.');
    expect(shortName('Cher')).toBe('Cher');
  });
});

const rowsEl = () => [...document.querySelectorAll<HTMLElement>('.ch-sv-tr__r.ch-sv-row')];
const read = () => document.querySelector('.ch-sv-tr .ch-sv-read')!.textContent;
const live = () => document.querySelector('.ch-sv-tr [aria-live="polite"]')!.textContent;
const group = () => screen.getByRole('group');

describe('TeamRank', () => {
  it('draws one row per player in rank order, a muted early read, and a needs row with no dot', () => {
    render(<TeamRank data={D} />);
    const rows = rowsEl();
    expect(rows).toHaveLength(D.grid.length);
    expect(rows.map((r) => r.querySelector('.ch-sv-tr__who')!.textContent)).toEqual([
      'Theo Marchetti',
      'Sofia Alvarez',
      'Ava Lindqvist',
      'Eli Brandt',
      'Jonah Okafor',
      'Priya Natarajan',
      'Luca Ferraro',
    ]);
    const eli = rows[3]!;
    expect(eli.className).toContain('is-early');
    expect(eli.querySelector('.ch-sv-tr__dot')!.className).not.toMatch(/is-gain|is-loss/);
    expect(eli.querySelector('.ch-sv-tr__v')!.className).not.toMatch(/ch-gain|ch-loss/);
    const luca = rows[6]!;
    expect(luca.className).toContain('is-none');
    expect(luca.querySelector('.ch-sv-tr__dot')).toBeNull();
    expect(luca.querySelector('.ch-sv-tr__needs')!.textContent).toBe('Needs 3 rounds');
    expect(rows[0]!.querySelector('.ch-sv-tr__dot')!.className).toContain('is-gain');
    expect(rows[5]!.querySelector('.ch-sv-tr__dot')!.className).toContain('is-loss');
    expect(document.querySelectorAll('.ch-sv-tr__mean')).toHaveLength(1);
    expect(document.querySelector('.ch-sv-note')!.textContent).toContain('Eli Brandt');
  });

  it('rests on a hint that names the whisker as it is drawn: one standard error, the likely range (B14)', () => {
    render(<TeamRank data={D} />);
    expect(read()).toBe('Select a player to see their likely range; select again to open them.');
    expect(document.querySelector('.ch-sv-tr')!.textContent).not.toContain('margin of error');
    cleanup();
  });

  it('hover reads a player without announcing; a click pins, announces and offers Open player; a second click opens', () => {
    render(<TeamRank data={D} />);
    const sofia = rowsEl()[1]!;
    fireEvent.pointerEnter(sofia, { pointerType: 'mouse' });
    expect(read()).toMatch(/^Sofia Alvarez · \+1\.2 a round/);
    expect(live()).toBe('');
    fireEvent.pointerLeave(sofia, { pointerType: 'mouse' });
    fireEvent.click(sofia);
    expect(live()).toMatch(/^Sofia Alvarez/);
    expect(sofia.hasAttribute('data-pinned')).toBe(true);
    expect(screen.getByRole('link', { name: 'Open player' }).getAttribute('href')).toContain('player=sofia');
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(sofia);
    expect(push).toHaveBeenCalledWith(expect.stringContaining('player=sofia'));
  });

  it('42001 keys: arrows move the pin, Enter opens the pinned player, Esc lets go', () => {
    render(<TeamRank data={D} />);
    fireEvent.keyDown(group(), { key: 'ArrowDown' });
    expect(live()).toMatch(/^Theo Marchetti/);
    fireEvent.keyDown(group(), { key: 'ArrowDown' });
    expect(live()).toMatch(/^Sofia Alvarez/);
    fireEvent.keyDown(group(), { key: 'End' });
    expect(live()).toBe('Luca Ferraro · Needs 3 rounds');
    fireEvent.keyDown(group(), { key: 'Enter' });
    expect(push).toHaveBeenCalledWith(expect.stringContaining('player=luca'));
    fireEvent.keyDown(group(), { key: 'Escape' });
    expect(live()).toBe('');
    expect(screen.queryByRole('link', { name: 'Open player' })).toBeNull();
  });

  it('the menu switches the metric: the scoring average ranks lowest first and says lower is better', () => {
    render(<TeamRank data={D} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Rank players by' }), { target: { value: 'score' } });
    expect(rowsEl()[0]!.querySelector('.ch-sv-tr__who')!.textContent).toBe('Theo Marchetti');
    expect(rowsEl()[0]!.querySelector('.ch-sv-tr__v')!.textContent).toBe('70.9');
    expect(document.querySelector('.ch-sv-tr')!.textContent).toContain('lower is better, so better is to the right');
    // Scores take no gain or loss color.
    expect(document.querySelectorAll('.ch-sv-tr__dot.is-gain, .ch-sv-tr__dot.is-loss')).toHaveLength(0);
  });

  it('a new order lets go of the pin, so it never points at another player', () => {
    render(<TeamRank data={D} />);
    fireEvent.click(rowsEl()[1]!);
    expect(live()).toMatch(/^Sofia Alvarez/);
    fireEvent.change(screen.getByRole('combobox', { name: 'Rank players by' }), { target: { value: 'score' } });
    expect(live()).toBe('');
    expect(screen.queryByRole('link', { name: 'Open player' })).toBeNull();
  });

  it('the phone draws short names and the same rows', () => {
    render(<TeamRank data={D} phone />);
    expect(rowsEl()[0]!.querySelector('.ch-sv-tr__who')!.textContent).toBe('Theo M.');
    expect(document.querySelector('.ch-sv-tr.is-phone')).not.toBeNull();
  });

  it('an empty window says so', () => {
    render(<TeamRank data={{ ...D, grid: [] }} />);
    expect(document.querySelector('[data-ch-code="CH-4305"]')).toBeTruthy();
  });
});
