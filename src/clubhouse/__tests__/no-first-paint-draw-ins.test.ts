import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Motion decision, 2026-10-21 (three independent votes, 3 to 0, option A): Clubhouse graphics are drawn in place at first paint.
 * Home's team form, Roster's and Qualifiers' spreads and Rounds' ribbon and round review no longer wipe, glide or rise when they scroll into view.
 * A value that changes afterwards (a filter, a new round) may still move on a token duration.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Clubhouse graphics are not drawn in at first paint (Q-139 extended)', () => {
  it('Home team form is not clipped or faded in', () => {
    const css = read('src/clubhouse/styles/home.css');
    expect(css).not.toMatch(/\.ch-h-form__plot:not\(\.is-in\)/);
    expect(css).not.toMatch(/\.ch-h-form__plot\.is-in/);
    expect(css).not.toMatch(/\.ch-h-form__svg\s*\{[^}]*clip-path/);
    expect(/\.ch-h-form__dot\s*\{[^}]*\}/.exec(css)![0]).not.toMatch(/opacity:\s*0|transition/);
  });

  it('Rounds bars, scores and the round review are visible at once', () => {
    const css = read('src/clubhouse/styles/rounds.css');
    expect(css).not.toMatch(/\.ch-rd-stage:not\(\.is-in\)/);
    expect(css).not.toMatch(/\.ch-rd-stage\.is-in/);
    expect(css).not.toMatch(/\.ch-rzstage:not\(\.is-in\)/);
    expect(css).not.toMatch(/ch-rz-draw|ch-rz-pop|ch-rd-fade|--ch-rd-delay/);
  });

  it('the components no longer wait to be seen', () => {
    for (const f of ['screens/home/TeamForm.tsx', 'screens/roster/RosterSpread.tsx', 'screens/rounds/RoundZones.tsx', 'screens/rounds/parts.tsx', 'screens/qualifiers/StandingsSpread.tsx']) {
      expect(read(`src/clubhouse/${f}`), f).not.toMatch(/useInViewOnce/);
    }
  });
});
