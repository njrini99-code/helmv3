import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ROOT } from '../../../__tests__/_scan';
import type { ChTeamRound } from '../../../data/team-rounds-shape';
import { groupTeamRounds } from '../TeamRounds';
import { monthLabel, shortDay } from '../parts';

/**
 * F-0010 (route-switch frame cost): the coach’s Rounds book labels every row (the month it falls in, its short day twice) in the first
 * frame after a switch. A date formatter is expensive to build, so each kind is built once, and the desktop book, which draws a season
 * of rows, skips the groups that are off screen.
 */

const Real = Intl.DateTimeFormat;
let built = 0;
beforeEach(() => {
  built = 0;
  class Counting extends Real {
    constructor(...args: ConstructorParameters<typeof Real>) {
      super(...args);
      built += 1;
    }
  }
  Intl.DateTimeFormat = Counting as unknown as typeof Intl.DateTimeFormat;
});
afterEach(() => {
  Intl.DateTimeFormat = Real;
});

const round = (i: number): ChTeamRound =>
  ({ id: `r${i}`, playerId: `p${i % 12}`, player: `Player ${i % 12}`, course: `Course ${i % 5}`, date: new Date(Date.UTC(2026, 7, 1 + (i % 100))).toISOString().slice(0, 10), score: 70 + (i % 9), toPar: (i % 9) - 2, holes: 18, countable: true, type: null, tee: null, teeColor: null }) as unknown as ChTeamRound;

describe('F-0010 the team rounds book labels its rows with reused formatters', () => {
  it('builds no formatter after the first rows, however many rounds follow', () => {
    const first = Array.from({ length: 3 }, (_, i) => round(i));
    groupTeamRounds(first, 'month', '', 'all');
    for (const r of first) shortDay(r.date);
    const afterFirst = built;
    expect(afterFirst).toBeGreaterThan(0);
    const season = Array.from({ length: 600 }, (_, i) => round(i));
    groupTeamRounds(season, 'month', '', 'all');
    for (const r of season) {
      shortDay(r.date);
      shortDay(r.date);
    }
    expect(built).toBe(afterFirst);
  });

  it('says what it always said', () => {
    expect(monthLabel('2026-10-14')).toBe('October 2026');
    expect(shortDay('2026-10-14')).toBe('Oct 14');
    // Read in UTC: a date is a calendar day, never moved by the viewer’s zone.
    expect(shortDay('2026-10-01')).toBe('Oct 1');
    const groups = groupTeamRounds([round(0), round(1), round(40)], 'month', '', 'all');
    expect(groups.map((g) => g.title)).toEqual(['August 2026', 'September 2026']);
  });
});

describe('F-0010 the desktop team rounds book skips its off-screen groups', () => {
  const css = readFileSync(join(ROOT, 'styles', 'rounds.css'), 'utf8');
  const rule = (sel: string) => {
    const at = css.lastIndexOf(`${sel} {`);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  };

  it("each month’s or player’s group draws only near the screen, with an intrinsic size", () => {
    const r = rule(".ch-trd-tbl > [role='rowgroup'][aria-labelledby]");
    expect(r).toMatch(/content-visibility: auto;/);
    expect(r).toMatch(/contain-intrinsic-size: auto \d+px;/);
  });

  it('not the header group: it is always on screen and its labels line up with the rows', () => {
    expect(css).not.toMatch(/\.ch-trd-tbl > \[role='rowgroup'\]\s*\{[^}]*content-visibility/);
  });
});
