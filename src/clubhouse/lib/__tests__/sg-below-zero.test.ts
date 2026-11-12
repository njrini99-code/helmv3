import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT, walk } from '../../__tests__/_scan';
import { sgBaseline } from '../sg';

/**
 * Q1 (owner, 12 Nov 2026): keep the PGA Tour as the strokes gained baseline, and say so, so a college coach does not read every
 * negative as broken numbers ("Why are all my players negative … is something wrong with the numbers?"). One sentence, written in
 * one place, said once on each page whose headline is a strokes gained figure, in a caption the page already had.
 */

describe('the sentence', () => {
  it('names the team’s own Tour, says below zero is normal, and claims no tour it could not read', () => {
    expect(sgBaseline('pga').why).toBe('Measured against PGA Tour pros, so below zero is normal for nearly everyone else.');
    expect(sgBaseline('lpga').why).toBe('Measured against LPGA Tour pros, so below zero is normal for nearly everyone else.');
    expect(sgBaseline(null).why).toBe('Measured against Tour pros, so below zero is normal for nearly everyone else.');
    for (const tour of ['pga', 'lpga', null] as const) {
      const b = sgBaseline(tour);
      // Where no figure stands beside it, the sentence names what it is about; otherwise the two say the same.
      expect(b.whyNamed).toBe(`Strokes gained is ${b.why[0]!.toLowerCase()}${b.why.slice(1)}`);
      // Plain words: no abbreviation, no jargon a coach would need explained.
      expect(b.why).not.toMatch(/\bSG\b|baseline|benchmark|expected strokes/);
      // The Tour is the only benchmark (Q-88): no college, division or level, even in passing.
      expect(b.whyNamed).not.toMatch(/\bD[123]\b|\bdivision\b|\bcollege\b|\bNCAA\b/i);
    }
  });
});

// Each page, the file that draws it, and how many times that file says the sentence (Home's file draws the desk and the phone).
const PAGES: Array<[string, string, number]> = [
  ['Team stats, desk (the leg cards’ note)', 'screens/stats/StatsTeamIslands.tsx', 1],
  ['Team stats, phone (Strokes gained by leg)', 'screens/stats/StatsTeamPhoneShs.tsx', 1],
  ['Home, The team’s game (desk head, phone footer)', 'screens/home/TeamLegs.tsx', 2],
  ['Roster, the page head', 'screens/roster/Roster.tsx', 1],
  ['CoachHelm Team, under the hole', 'screens/coachhelm/team/TeamBoard.tsx', 1],
  ['My stats, phone (the Strokes gained card)', 'screens/stats/StatsPlayerPhoneShs.tsx', 1],
];
// `sgBaseline(…).why`, a baseline variable's `.why`, or `const { why } = sgBaseline(…)`.
const SAYS = /\.why(?:Named)?\b|const \{[^}]*\bwhy\b[^}]*\} = sgBaseline\(/g;

describe('one place, once a page', () => {
  it.each(PAGES)('%s says it from sgBaseline, once', (_page, file, times) => {
    expect(readFileSync(join(ROOT, file), 'utf8').match(SAYS) ?? []).toHaveLength(times);
  });

  it('no file but lib/sg.ts writes the sentence itself', () => {
    const own = walk(ROOT, /\.tsx?$/).filter((f) => !f.includes('__tests__') && !f.endsWith(join('lib', 'sg.ts')));
    const copies = own.filter((f) => /below zero is normal for nearly everyone else/.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f));
    expect(copies).toEqual([]);
  });

  it('the captions it replaced no longer say "against the Tour" beside it', () => {
    const phoneTeam = readFileSync(join(ROOT, 'screens/stats/StatsTeamPhoneShs.tsx'), 'utf8');
    expect(phoneTeam).toContain('Team strokes a round. {sgBaseline(data.tour).why}');
    expect(readFileSync(join(ROOT, 'screens/stats/StatsPlayerPhoneShs.tsx'), 'utf8')).toContain('`Strokes a round. ${sgBaseline(data.tour).why}`');
  });

  it('My stats on a desk already says it in its strokes gained definition, so it is not said twice there', () => {
    const desk = readFileSync(join(ROOT, 'screens/stats/OverviewZones.tsx'), 'utf8');
    expect(desk).toContain('<b>Zero is {baseline.noun}.</b> Below zero is normal for most players;');
    expect(desk.match(SAYS) ?? []).toHaveLength(0);
  });
});
