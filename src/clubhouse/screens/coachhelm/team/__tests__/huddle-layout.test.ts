import { describe, expect, it } from 'vitest';
import { STATIONS, type ChTeamPlayer } from '../../../../data/coachhelm-team-shape';
import { namesLine, notPlottedLine, placeHuddleWords, spreadCoins } from '../Huddle';

const BOX = { x0: 50, x1: 294, y0: 30, y1: 206 };
const PLOT = { x0: 36, x1: 308, y0: 16, y1: 220 };

function player(first: string, missing: readonly string[]): ChTeamPlayer {
  const legs = Object.fromEntries(STATIONS.map((s) => [s, { strokes: missing.includes(s) ? null : -0.5, rounds: 3, missing: null }]));
  return { id: first, first, name: first, legs } as unknown as ChTeamPlayer;
}

describe('spreadCoins', () => {
  it('leaves coins that are already clear exactly where they are', () => {
    const points = [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ];
    expect(spreadCoins(points, BOX)).toEqual(points);
  });

  it('pushes overlapping coins apart, even on one point, and keeps them inside the plot', () => {
    const out = spreadCoins(
      [
        { x: 200, y: 110 },
        { x: 205, y: 118 },
        { x: 203, y: 125 },
        { x: 203, y: 125 },
        { x: 290, y: 200 },
        { x: 292, y: 204 },
      ],
      BOX,
    );
    for (let i = 0; i < out.length; i++) {
      const a = out[i]!;
      expect(a.x).toBeGreaterThanOrEqual(BOX.x0);
      expect(a.x).toBeLessThanOrEqual(BOX.x1);
      expect(a.y).toBeGreaterThanOrEqual(BOX.y0);
      expect(a.y).toBeLessThanOrEqual(BOX.y1);
      for (let j = i + 1; j < out.length; j++) {
        const b = out[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(26);
      }
    }
  });

  it('draws the same layout every time', () => {
    const points = [
      { x: 150, y: 150 },
      { x: 150, y: 150 },
      { x: 150, y: 150 },
    ];
    expect(spreadCoins(points, BOX)).toEqual(spreadCoins(points, BOX));
  });
});

describe('placeHuddleWords', () => {
  const at = { ...PLOT, midX: 220, midY: 120, tourX: 290, tourY: 40 };

  it('keeps a word off every coin and across no Tour line', () => {
    const coins = [
      { x: 60, y: 60 },
      { x: 90, y: 195 },
      { x: 240, y: 200 },
    ];
    const words = placeHuddleWords({ ...at, coins });
    expect(words.length).toBeGreaterThan(0);
    for (const w of words) {
      const width = Math.max(...w.lines.map((l) => l.length)) * 5.4;
      const top = w.y - 9;
      const bottom = top + w.lines.length * 11;
      expect(at.tourX < w.x - 2 || at.tourX > w.x + width + 2).toBe(true);
      expect(at.tourY < top - 2 || at.tourY > bottom + 2).toBe(true);
      for (const c of coins) {
        const clear = c.x + 15 <= w.x || c.x - 15 >= w.x + width || c.y + 15 <= top || c.y - 15 >= bottom;
        expect(clear).toBe(true);
      }
    }
  });

  it('leaves a word out rather than crossing the line, when its quadrant has no room', () => {
    const words = placeHuddleWords({ ...at, midX: 285, coins: [] });
    expect(words.map((w) => w.key)).not.toContain('br');
  });
});

describe('notPlottedLine', () => {
  it('still names one player and their missing leg', () => {
    expect(notPlottedLine([player('Sam', ['putting'])])).toBe('Not plotted: Sam, no putting figure yet');
  });

  it('says a shared reason once and caps the names', () => {
    const none = ['Theo', 'Sam', 'Priya', 'Luca', 'Owen', 'Mina'].map((n) => player(n, STATIONS));
    expect(notPlottedLine(none)).toBe('Not plotted: Theo, Sam, Priya and 3 more, no shot figures yet');
  });

  it('keeps different reasons apart', () => {
    expect(notPlottedLine([player('Sam', ['putting']), player('Eli', ['putting']), player('Theo', STATIONS)])).toBe('Not plotted: Sam and Eli, no putting figure yet; Theo, no shot figures yet');
  });
});

describe('namesLine', () => {
  it('reads as a sentence at every length', () => {
    expect(namesLine(['A'])).toBe('A');
    expect(namesLine(['A', 'B'])).toBe('A and B');
    expect(namesLine(['A', 'B', 'C', 'D'])).toBe('A, B, C and D');
    expect(namesLine(['A', 'B', 'C', 'D', 'E'])).toBe('A, B, C and 2 more');
  });
});
