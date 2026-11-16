import './dialog-polyfill';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MIN_PLAUSIBLE_STROKES_PER_18 } from '@/lib/golf/round-countable';
import { isScoreCountable } from '../data/round-scope';
import { LAST_TEN, lastTenRounds, roundsForFigures } from '../data/figure-window';
import { MIN_SG_ROUNDS as SEASON_SG_FLOOR } from '../data/season';
import { effectiveRounds, roundWeight, weightedMean } from '../data/stats-weight';
import { PER_18_NOTE } from '../data/stats-filter';
import { COUNTING_RULE, LAST_N, MIN_SG_ROUNDS, NINES_LINE, STAT_DEFINITIONS, STAT_ORDER, statDefinition } from '../lib/stat-definitions';
import { HowStatsCountLink, StatTerm } from '../ui/StatTerm';
import { TERMS } from '../lib/glossary';

/*
 * F-07 (launch readiness 2026-11-15): every stat a Stats page names has a definition one tap away, and one stated rule says which
 * rounds count. These tests hold the words to the code: each line of the counting rule is checked against the function that applies
 * it, so the sheet cannot promise one thing while the loaders count another.
 */

type R = {
  id: string;
  round_date: string;
  round_type: string | null;
  status: string | null;
  holes_played: number | null;
  total_score: number | null;
  front_nine: number | null;
  back_nine: number | null;
  total_putts: number | null;
  is_test?: boolean;
};
const round = (over: Partial<R> = {}): R => ({
  id: over.id ?? 'r',
  round_date: '2026-10-01',
  round_type: 'tournament',
  status: 'completed',
  holes_played: 18,
  total_score: 74,
  front_nine: 37,
  back_nine: 37,
  total_putts: 30,
  ...over,
});

describe('stat definitions (F-07)', () => {
  it('every stat has a name, a meaning, how it is counted and a direction, and the sheet lists each once', () => {
    for (const [key, d] of Object.entries(STAT_DEFINITIONS)) {
      expect(d.key).toBe(key);
      expect(d.name.length).toBeGreaterThan(1);
      expect(d.means).toMatch(/\.$/);
      expect(d.counted).toMatch(/\.$/);
      expect(['higher', 'lower']).toContain(d.better);
    }
    expect([...STAT_ORDER].sort()).toEqual(Object.keys(STAT_DEFINITIONS).sort());
  });

  it('the labels the Stats pages print find their definition, whatever their spelling', () => {
    expect(statDefinition('Scoring avg')?.key).toBe('scoringAvg');
    expect(statDefinition('Scoring average')?.key).toBe('scoringAvg');
    expect(statDefinition('Greens in regulation')?.key).toBe('gir');
    expect(statDefinition('GIR')?.key).toBe('gir');
    expect(statDefinition('Fairways hit')?.key).toBe('fir');
    expect(statDefinition('Putts / round')?.key).toBe('putts');
    expect(statDefinition('Putts per round')?.key).toBe('putts');
    expect(statDefinition('Putts / GIR')?.key).toBe('puttsGir');
    expect(statDefinition('Three-putts / round')?.key).toBe('threePutts');
    expect(statDefinition('3-putts / round')?.key).toBe('threePutts');
    expect(statDefinition('Penalties / round')?.key).toBe('penalties');
    expect(statDefinition('Sand saves')?.key).toBe('sandSaves');
    expect(statDefinition('Scrambling')?.key).toBe('scrambling');
    expect(statDefinition('Birdies per round')?.key).toBe('birdies');
    expect(statDefinition('SG / round')?.key).toBe('sg');
    expect(statDefinition(TERMS.sgArg.short)?.key).toBe('sgAround');
    // "Putting" is a page section; only under strokes gained is it SG putting.
    expect(statDefinition('Putting')).toBeNull();
    expect(statDefinition('Putting', { sg: true })?.key).toBe('sgPutting');
    // A label that names no stat has no definition and is drawn as plain text.
    expect(statDefinition('Rounds')).toBeNull();
    expect(statDefinition('Handicap')).toBeNull();
  });

  it('sand saves read the Tour definition (#2536, SC-02): in two from the bunker, whatever the score', () => {
    expect(STAT_DEFINITIONS.sandSaves.means).toMatch(/two strokes or fewer/);
    expect(STAT_DEFINITIONS.sandSaves.means).toMatch(/whatever the score/);
    expect(STAT_DEFINITIONS.fir.counted).toMatch(/par 3s are never counted/);
  });
});

describe('the counting rule matches the code that counts (F-07)', () => {
  const line = (id: string) => COUNTING_RULE.find((l) => l.id === id)!;

  it('its numbers are the loaders’ numbers', () => {
    expect(MIN_SG_ROUNDS).toBe(SEASON_SG_FLOOR);
    expect(LAST_N).toBe(LAST_TEN);
    expect(line('sg-floor').body).toContain(String(SEASON_SG_FLOOR));
    expect(line('floor').body).toContain(String(MIN_PLAUSIBLE_STROKES_PER_18));
    expect(NINES_LINE).toBe(PER_18_NOTE);
  });

  it('finished rounds only: one in progress and a test round count in nothing', () => {
    expect(isScoreCountable(round({ status: 'in_progress' }))).toBe(false);
    expect(isScoreCountable(round({ is_test: true }))).toBe(false);
    expect(isScoreCountable(round())).toBe(true);
  });

  it('practice is left out of the figures', () => {
    const kept = roundsForFigures([round({ id: 'a' }), round({ id: 'p', round_type: 'practice' }), round({ id: 'n', round_type: null })]);
    expect(kept.map((r) => r.id)).toEqual(['a', 'n']);
    expect(line('practice').body).toMatch(/Practice/);
  });

  it('a nine counts as half a round: a 38 is a 76 pace, and two nines make one round', () => {
    const nine = round({ holes_played: 9, total_score: 38, front_nine: 38, back_nine: null });
    expect(roundWeight(nine)).toBe(0.5);
    expect(weightedMean([nine], (r) => r.total_score)).toBe(76);
    expect(effectiveRounds([nine, nine])).toBe(1);
    expect(line('nines').body).toContain('a 38 for nine holes counts as half a round at a 76 pace');
  });

  it('Last 10 is ten 18-hole rounds: a nine never takes an 18’s place', () => {
    const eighteens = Array.from({ length: 12 }, (_, i) => round({ id: `e${i}`, round_date: `2026-09-${String(10 + i).padStart(2, '0')}` }));
    const nine = round({ id: 'nine', round_date: '2026-10-30', holes_played: 9, total_score: 38, front_nine: 38, back_nine: null });
    const last = lastTenRounds([...eighteens, nine]);
    expect(last).toHaveLength(LAST_N);
    expect(last.some((r) => r.id === 'nine')).toBe(false);
  });

  it('an unfinished round counts in nothing: a missing nine, or a length other than 9 or 18', () => {
    expect(isScoreCountable(round({ total_score: null, back_nine: null }))).toBe(false);
    expect(isScoreCountable(round({ holes_played: 14, total_score: 58, front_nine: 37, back_nine: 21 }))).toBe(false);
    expect(line('partial').body).toMatch(/other than 9 or 18 holes/);
  });

  it('an 18-hole total without holes counts in scoring; a nine-hole total does not', () => {
    expect(isScoreCountable(round({ front_nine: null, back_nine: null, total_putts: null }))).toBe(true);
    expect(isScoreCountable(round({ holes_played: 9, total_score: 38, front_nine: null, back_nine: null, total_putts: null }))).toBe(false);
    expect(line('total-only').body).toMatch(/An 18-hole round posted as a total/);
  });

  it('an impossible score is left out: under the floor for 18, and its scaled floor for nine', () => {
    const nineFloor = Math.ceil((9 * MIN_PLAUSIBLE_STROKES_PER_18) / 18);
    expect(isScoreCountable(round({ total_score: MIN_PLAUSIBLE_STROKES_PER_18 - 1, front_nine: 24, back_nine: MIN_PLAUSIBLE_STROKES_PER_18 - 25, total_putts: null }))).toBe(false);
    expect(isScoreCountable(round({ holes_played: 9, total_score: nineFloor - 1, front_nine: nineFloor - 1, back_nine: null, total_putts: null }))).toBe(false);
    expect(isScoreCountable(round({ holes_played: 9, total_score: nineFloor, front_nine: nineFloor, back_nine: null, total_putts: null }))).toBe(true);
    expect(line('floor').body).toContain(`(${nineFloor} for nine)`);
  });
});

describe('StatTerm and the sheet (F-07)', () => {
  it('a stat’s name opens its definition, and Escape closes it', () => {
    render(
      <div className="ch-root">
        <StatTerm label="Greens in regulation" />
      </div>,
    );
    const name = screen.getByRole('button', { name: 'Greens in regulation' });
    expect(name).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(name);
    const card = screen.getByRole('dialog', { name: 'Greens in regulation: what it means' });
    expect(card).toHaveTextContent(STAT_DEFINITIONS.gir.means);
    expect(card).toHaveTextContent('Higher is better.');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /what it means/ })).toBeNull();
  });

  it('a label that names no stat is plain text, not a control', () => {
    render(<StatTerm label="Rounds" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Rounds')).toBeInTheDocument();
  });

  it('the card’s link opens the whole rule; the sheet lists every rule line and every stat', () => {
    render(
      <div className="ch-root">
        <StatTerm label="Sand saves" />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sand saves' }));
    fireEvent.click(screen.getByRole('button', { name: 'How stats are counted' }));
    const sheet = screen.getByRole('dialog', { name: 'How stats are counted' });
    for (const l of COUNTING_RULE) expect(within(sheet).getByText(l.title)).toBeInTheDocument();
    for (const k of STAT_ORDER) expect(within(sheet).getByText(STAT_DEFINITIONS[k].name)).toBeInTheDocument();
  });

  it('the sheet opened from a card hands focus back to the stat’s name when it closes', async () => {
    render(
      <div className="ch-root">
        <StatTerm label="Sand saves" />
      </div>,
    );
    const name = screen.getByRole('button', { name: 'Sand saves' });
    fireEvent.click(name);
    fireEvent.click(screen.getByRole('button', { name: 'How stats are counted' }));
    const sheet = screen.getByRole('dialog', { name: 'How stats are counted' });
    // The card's link is gone with the card; the sheet returns focus to the stat's name when it closes.
    fireEvent.click(within(sheet).getByRole('button', { name: /close/i }));
    await waitFor(() => expect(document.activeElement).toBe(name));
  });

  it('the page link opens the same sheet', () => {
    render(
      <div className="ch-root">
        <HowStatsCountLink />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'How stats are counted' }));
    expect(screen.getByRole('dialog', { name: 'How stats are counted' })).toBeInTheDocument();
  });
});
