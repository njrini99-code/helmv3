import { LazyMotion, domAnimation } from 'framer-motion';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import { axisLabelIndexes, changeTone, scoreTicks } from '../screens/home/PlayerGame';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';
import './dialog-polyfill';
import { PREVIEW_HOME_NOW } from '../preview/fixtures';
import { PREVIEW_PLAYER_HOME } from '../preview/fixtures-player-home';

const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/home.css'), 'utf8');

const real = window.matchMedia;
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
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

  it('draws each distinct date once on the phone chart, even where rounds share a day', () => {
    show({ scoring: { error: false, points: points([['Aug 2', 71, 72], ['Aug 2', 70, 72], ['Aug 2', 72, 72], ['Sep 25', 69, 72], ['Sep 26', 70, 72]]) } });
    const chart = screen.getByRole('img', { name: /Your scores over the last 5 rounds/ });
    expect([...chart.querySelectorAll('.ch-ph-chart__ax')].map((t) => t.textContent).filter((t) => /[A-Z][a-z]{2} \d/.test(t ?? ''))).toEqual(['Aug 2', 'Sep 25', 'Sep 26']);
  });

  it('marks a round under its own par when the rounds were played to different pars', () => {
    show({ scoring: { error: false, points: points([['Jul 2', 73, 72], ['Jul 9', 70, 71], ['Aug 2', 69, 70], ['Sep 25', 71, 71], ['Sep 26', 68, 70]]) } });
    const chart = screen.getByRole('img', { name: /Your scores over the last 5 rounds/ });
    // No single par to draw, but 70 under 71, 69 under 70 and 68 under 70 are under par; 73 and 71 on 71 are not.
    expect(chart.querySelector('.ch-ph-chart__par')).toBeNull();
    expect([...chart.querySelectorAll('.ch-ph-chart__dot.is-under')]).toHaveLength(3);
    expect([...chart.querySelectorAll('.ch-ph-chart__val.is-under')].map((t) => t.textContent)).toEqual(['70', '69', '68']);
  });
});

describe('the scoring average change', () => {
  it('is green when the average fell, amber when it rose, and plain when it rounds to zero', () => {
    expect(changeTone(-0.8)).toBe('is-gain');
    expect(changeTone(1.4)).toBe('is-loss');
    expect(changeTone(0.04)).toBe('');
    expect(changeTone(-0.049)).toBe('');
    expect(changeTone(null)).toBe('');
    // Where more is better the same change reads the other way.
    expect(changeTone(2, false)).toBe('is-gain');
  });

  it('colours the figure, not its caption (the board: "−0.8 vs previous 10" stays grey)', () => {
    show();
    const avg = [...document.querySelectorAll('.ch-ph-figs dd')].find((d) => d.textContent === '70.1')!;
    expect(avg.className).toContain('is-gain');
    expect(avg.nextElementSibling!.className).not.toMatch(/is-gain|is-loss/);
    expect(avg.nextElementSibling!.textContent).toMatch(/vs previous 10$/);
  });
});

describe('Scoring and the parts of the game, on the phone', () => {
  it('puts each title above its card, with the window picker as the card’s first row', () => {
    show();
    const scoring = screen.getByRole('heading', { level: 2, name: 'Scoring' }).closest('section')!;
    const card = scoring.querySelector('.ch-ph-game')!;
    expect(card.querySelector('h2')).toBeNull();
    expect(within(scoring).getByText(/Gross · par 72 · countable rounds/).closest('.ch-ph-game')).toBeNull();
    expect(card.firstElementChild!.getAttribute('role')).toBe('radiogroup');
    const legs = screen.getByRole('heading', { level: 2, name: 'By part of the game' }).closest('section')!;
    expect(legs.querySelector('.ch-ph-legs')!.querySelector('h2')).toBeNull();
    expect(within(legs).getByText('Strokes gained vs Tour')).toBeTruthy();
  });

  it('offers all three windows, as the board does, even with only a few rounds', async () => {
    const user = userEvent.setup();
    show({ scoring: { error: false, points: points([['Jul 2', 73, 72], ['Jul 9', 70, 72], ['Aug 2', 69, 72]]) } });
    const picker = screen.getByRole('radiogroup', { name: 'Rounds shown' });
    expect(within(picker).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Last 5', 'Last 10', 'Last 20']);
    await user.click(within(picker).getByRole('radio', { name: 'Last 20' }));
    expect(screen.getByRole('img', { name: /Your scores over the last 3 rounds/ })).toBeTruthy();
  });

  it('follows the window: Last 20 reads every round, and the figures follow', async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole('radio', { name: 'Last 20' }));
    expect(screen.getByRole('img', { name: /Your scores over the last 20 rounds/ })).toBeTruthy();
    await user.click(screen.getByRole('radio', { name: 'Last 5' }));
    expect(screen.getByRole('img', { name: /Your scores over the last 5 rounds/ })).toBeTruthy();
    expect([...document.querySelectorAll('.ch-ph-figs dd:not(.ch-ph-figs__m)')].map((d) => d.textContent)[3]).toBe('5 of 5');
  });

  it('gives the scoring card no picker while there is nothing to draw', () => {
    show({ scoring: { error: false, points: points([['Jul 2', 73, 72]]) } });
    expect(screen.queryByRole('radiogroup', { name: 'Rounds shown' })).toBeNull();
    show({ scoring: { error: true, points: [] } });
    expect(screen.queryAllByRole('radiogroup', { name: 'Rounds shown' })).toHaveLength(0);
  });
});

describe('Today, on the phone', () => {
  it('is a small label inside This week, with no Calendar link of its own', () => {
    show();
    const week = screen.getByRole('heading', { level: 2, name: 'This week' }).closest('section')!;
    expect(within(week).getByRole('heading', { level: 2, name: 'Today' }).className).toContain('ch-hm-lab');
    expect(week.querySelector('.ch-hm-tl.is-player')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Calendar' })).toBeNull();
  });

  it('marks the next row "Next" before it starts, and the row under way "Now"', () => {
    const { unmount } = show();
    const rows = () => [...document.querySelectorAll('.ch-hm-tl.is-player > li')];
    expect(rows().map((r) => r.querySelector('.ch-hm-now')?.textContent ?? null)).toEqual(['Next', null]);
    unmount();
    // 3:30–5:00 under way (19:30Z–21:00Z).
    show({}, '2026-10-14T20:00:00Z');
    expect(rows().map((r) => r.querySelector('.ch-hm-now')?.textContent ?? null)).toEqual(['Now', null]);
  });

  it('keeps a row that has passed readable: its time steps back, nothing is dimmed', () => {
    show({}, '2026-10-14T21:10:00Z');
    const rows = [...document.querySelectorAll('.ch-hm-tl.is-player > li')];
    expect(rows[0]!.className).toContain('is-past');
    expect(rows[0]!.querySelector('.ch-hm-now')).toBeNull();
    expect(rows[1]!.querySelector('.ch-hm-now')!.textContent).toBe('Next');
    expect(css).toMatch(/\.ch-hm-tl\.is-player \.ch-hm-tl__r\.is-past\s*{\s*opacity: 1;/);
    expect(css).toMatch(/\.ch-hm-tl\.is-player \.is-past \.ch-hm-tl__t\s*{\s*color: var\(--ch-text-tertiary\);/);
  });

  it('marks nothing once every row has passed', () => {
    show({}, '2026-10-14T23:00:00Z');
    expect(document.querySelector('.ch-hm-tl.is-player .ch-hm-now')).toBeNull();
    expect(document.querySelectorAll('.ch-hm-tl.is-player > li.is-past')).toHaveLength(2);
  });

  it('says "Up next · Qualifier" on the hero card, and draws a flag on the competition day', () => {
    show();
    expect(screen.getByRole('link', { name: /Up next · Qualifier/ })).toBeTruthy();
    expect(document.querySelector('.ch-hm-week .is-major svg')!.getAttribute('class')).toMatch(/lucide-flag/);
  });
});

describe('spacing the base reset can’t take away', () => {
  it('sets the hero’s brief, greeting and Up next margins above base.css’s `.ch-root p, h1, h2 { margin: 0 }`', () => {
    // One class (0,1,0) loses to the reset, and two selectors tie it, so load order decided: the brief hugged Up next and the greeting hugged the date.
    expect(css).toMatch(/\.ch-hm-hero > \.ch-hm-hero__brief\s*{[^}]*margin: 0 0 18px;/);
    expect(css).toMatch(/\.ch-hm > \.ch-hm-hero > h1\s*{\s*margin: 8px 0 10px;/);
    expect(css).toMatch(/\.ch-hm-hero \.ch-hm-next h2\s*{\s*margin-top: 6px;/);
    expect(css).toMatch(/\.ch-ph-leg > \.ch-ph-leg__n\s*{\s*margin: 4px 0 0;/);
    expect(css).toMatch(/\.ch-ph-game__h > div > h2\s*{\s*margin: 0 0 5px;/);
    expect(css).not.toMatch(/\n\s*\.ch-hm-hero h1\s*{/);
    expect(css).not.toMatch(/\n\s*\.ch-hm-hero__brief\s*{/);
  });

  it('keeps the window picker’s own labels out of the caption rule', () => {
    expect(css).toMatch(/\.ch-ph-game__h > div > span\s*{/);
    expect(css).not.toMatch(/\.ch-ph-game__h span\s*{/);
  });
});
