import { LazyMotion, domAnimation } from 'motion/react';
import { render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Player Home on the phone against the board (design/handoff/Player - Home - Mobile.html, m-player-home.jsx):
 * Scoring and the parts of the game sit under their own titles, the window picker is the card's first row,
 * Today is a label inside This week, a row that has passed never looks disabled, and the chart's dates and ticks
 * stay readable. The pure helpers are tested on their own.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import type { ChPlayerHome } from '../data/player-home';
import { PlayerHome } from '../screens/home/PlayerHome';
import { changeTone } from '../lib/format';
import { axisLabelIndexes, scoreTicks } from '../screens/home/PlayerGame';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_HOME_NOW } from '../preview/fixtures';
import { PREVIEW_PLAYER_HOME } from '../preview/fixtures-player-home';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/home.css'), 'utf8');

const real = window.matchMedia;
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px), (max-height: 500px) and (pointer: coarse)' })) as typeof window.matchMedia;
});
afterEach(() => {
  window.matchMedia = real;
});

function show(over: Partial<ChPlayerHome> = {}, now = PREVIEW_HOME_NOW) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <PhoneChromeProvider>
          <div className="ch-root" data-ui="clubhouse">
            <PlayerHome data={{ ...PREVIEW_PLAYER_HOME, ...over }} now={now} />
          </div>
        </PhoneChromeProvider>
      </ToastProvider>
    </LazyMotion>,
  );
}
const points = (rows: Array<[string, number, number | null]>) => rows.map(([label, score, par], i) => ({ id: `p${i}`, label, score, par }));

describe('the chart axis', () => {
  it('labels a run of one date once, where it starts, and never repeats a date', () => {
    const labels = ['Aug 2', 'Aug 2', 'Aug 2', 'Sep 25', 'Sep 26'];
    expect(axisLabelIndexes(labels, 1)).toEqual([0, 3, 4]);
    expect(axisLabelIndexes(['Aug 2', 'Aug 2', 'Aug 2'], 1)).toEqual([0]);
  });

  it('counts the step back from the newest round, and skips a date the previous label already says', () => {
    const labels = Array.from({ length: 10 }, (_, i) => `D${i}`);
    expect(axisLabelIndexes(labels, 3)).toEqual([0, 3, 6, 9]);
    expect(axisLabelIndexes(['A', 'A', 'B', 'B', 'B', 'C', 'C'], 2)).toEqual([0, 2, 6]);
    expect(axisLabelIndexes([], 3)).toEqual([]);
  });

  it('keeps the score ticks to a handful of whole strokes', () => {
    expect(scoreTicks(68, 73, 6)).toEqual([68, 69, 70, 71, 72, 73]);
    // Nineteen strokes of range do not become nineteen labels in 150px.
    const wide = scoreTicks(68, 86, 6);
    expect(wide.length).toBeLessThanOrEqual(6);
    expect(wide).toEqual([70, 75, 80, 85]);
    expect(scoreTicks(60, 90, 8).every((v) => Number.isInteger(v))).toBe(true);
  });
});

describe('the scoring average change', () => {
  it('is green when it moved the good way, amber when the other, and plain when it rounds to zero as shown', () => {
    expect(changeTone(-0.8, true)).toBe('is-gain');
    expect(changeTone(1.4, true)).toBe('is-loss');
    expect(changeTone(0.04, true)).toBe('');
    expect(changeTone(-0.049, true)).toBe('');
    expect(changeTone(null, true)).toBe('');
    // Where more is better the same change reads the other way.
    expect(changeTone(2, false)).toBe('is-gain');
    expect(changeTone(-0.05, false)).toBe('is-loss');
    // Greens move in whole points: 0.4 shows as "0", 0.5 as "+1".
    expect(changeTone(0.4, false, 0)).toBe('');
    expect(changeTone(0.5, false, 0)).toBe('is-gain');
    expect(changeTone(0, false)).toBe('');
  });
});

describe('Scoring and the parts of the game, on the phone', () => {

  it('gives the scoring card no picker while there is nothing to draw', () => {
    show({ scoring: { error: false, points: points([['Jul 2', 73, 72]]) } });
    expect(screen.queryByRole('radiogroup', { name: 'Rounds shown' })).toBeNull();
    show({ scoring: { error: true, points: [] } });
    expect(screen.queryAllByRole('radiogroup', { name: 'Rounds shown' })).toHaveLength(0);
  });
});

describe('spacing the base reset can’t take away', () => {
  it('sets the hero’s brief, greeting and Up next margins above base.css’s `.ch-root p, h1, h2 { margin: 0 }`', () => {
    // One class (0,1,0) loses to the reset, and two selectors tie it, so load order decided: the brief hugged Up next and the greeting hugged the date.
    expect(css).toMatch(/\.ch-hm-hero > \.ch-hm-hero__brief\s*{[^}]*margin: 0 0 16px;/); // the 4pt scale (row 33)
    expect(css).toMatch(/\.ch-hm > \.ch-hm-hero > h1\s*{\s*margin: 8px 0 8px;/);
    expect(css).toMatch(/\.ch-hm-hero \.ch-hm-next h2\s*{\s*margin-top: 6px;/);
    expect(css).toMatch(/\.ch-ph-leg > \.ch-ph-leg__n\s*{\s*margin: 4px 0 0;/);
    expect(css).toMatch(/\.ch-ph-game__h > div > h2\s*{\s*margin: 0 0 6px;/);
    expect(css).not.toMatch(/\n\s*\.ch-hm-hero h1\s*{/);
    expect(css).not.toMatch(/\n\s*\.ch-hm-hero__brief\s*{/);
  });

  it('keeps the window picker’s own labels out of the caption rule', () => {
    expect(css).toMatch(/\.ch-ph-game__h > div > span\s*{/);
    expect(css).not.toMatch(/\.ch-ph-game__h span\s*{/);
  });
});

describe('the hero on the phone (wave 7)', () => {
  it('New round, the player’s own reply beside what is next under the greeting, and From your coach under the keys', () => {
    show();
    expect(screen.getByRole('link', { name: 'New round' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Post a round' })).toBeNull();
    // The greeting's line is Up next (S-HOMEGAME): the event, when and where, and the player's own reply beside it.
    const next = screen.getByRole('link', { name: /Qualifier Fri at / });
    expect(within(next).getByText('You’re going')).toBeTruthy();
    expect(screen.getByRole('link', { name: /^From your coach/ }).getAttribute('href')).toBe('/golf/dashboard/team-hub');
    expect(screen.getByRole('heading', { level: 2, name: 'Your latest round' })).toBeTruthy();
  });

  it('Reply needed in the warning tone when the player still owes one', () => {
    show({ next: { ...PREVIEW_PLAYER_HOME.next!, mine: 'needed' } });
    const badge = within(screen.getByRole('link', { name: /Qualifier Fri at / })).getByText('Reply needed');
    expect(badge.classList.contains('ch-badge--warning')).toBe(true);
  });
});
