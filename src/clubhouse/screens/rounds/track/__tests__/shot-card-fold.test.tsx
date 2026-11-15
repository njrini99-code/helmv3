import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HoleStats, RoundHole, ShotRecord } from '@/lib/types/golf';
import { RoundTracking, type RoundTrackingProps } from '../RoundTracking';
import { ToastProvider } from '../../../../ui/Toast';
import '../../../../__tests__/dialog-polyfill';

/**
 * The shot card keeps one height (owner, 2026-11-11: nothing moves under the thumb). The result's place holds two faces
 * from the first frame: the results, and what a picked result asks next with the pick folded into its heading ("Rough ·
 * Change"). The face not in use is held hidden and inert, so neither the pick nor the answer changes the card. What is
 * recorded is unchanged: the last test plays a whole hole through the new arrangement and reads the saved shots.
 */
Element.prototype.scrollIntoView ??= function () {};
vi.mock('@/app/golf/actions/shot-actions', () => ({ deleteShot: vi.fn(), updateShot: vi.fn() }));
vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
afterEach(cleanup);

const HOLES: RoundHole[] = [{ number: 1, par: 4, yardage: 380, score: null }];
const ROUND = { course: 'Finley GC', teeLabel: 'Blue', teeColor: 'blue' as const, type: 'practice' as const };
const shot = (s: Partial<ShotRecord> & Pick<ShotRecord, 'shotNumber' | 'shotType' | 'result'>): ShotRecord => ({
  clubType: 'non_driver',
  lieBefore: 'fairway',
  distanceToHoleBefore: 0,
  distanceUnitBefore: 'yards',
  distanceToHoleAfter: 0,
  distanceUnitAfter: 'yards',
  shotDistance: 0,
  isPenalty: false,
  ...s,
});
const TEE = shot({ shotNumber: 1, shotType: 'tee', clubType: 'driver', lieBefore: 'tee', distanceToHoleBefore: 380, result: 'fairway', distanceToHoleAfter: 140, shotDistance: 240 });
const APPROACH = shot({ shotNumber: 2, shotType: 'approach', distanceToHoleBefore: 140, result: 'green', distanceToHoleAfter: 18, distanceUnitAfter: 'feet', shotDistance: 134 });

function setup(over: Partial<RoundTrackingProps> = {}) {
  const onHoleComplete = vi.fn(async (_i: number, _s: HoleStats) => true);
  const props: RoundTrackingProps = { round: ROUND, holes: HOLES, currentHoleIndex: 0, onHoleComplete, onNavigateToHole: vi.fn(), ...over };
  render(
    <ToastProvider>
      <RoundTracking {...props} />
    </ToastProvider>,
  );
  return { onHoleComplete, user: userEvent.setup() };
}
const face = (name: 'pick' | 'follow') => document.querySelector<HTMLElement>(`.ch-rt-face[data-face="${name}"]`)!;
const held = (el: HTMLElement) => el.hasAttribute('inert') && el.getAttribute('aria-hidden') === 'true';
const slot = () => document.querySelector<HTMLElement>('.ch-rt-slot')!;
const change = () => screen.getByRole('button', { name: /Change$/ });
const quick = (n: number) => within(screen.getByRole('group', { name: 'Quick distances' })).getByRole('button', { name: String(n) });
const next = () => screen.getByRole('button', { name: /Record next shot|Complete hole/ });

describe('the result and what it asks next share one place', () => {
  it('both faces are in the card from the first frame; the follow-up is held hidden and inert', () => {
    setup();
    expect(slot().querySelectorAll(':scope > .ch-rt-face')).toHaveLength(2);
    expect(slot().dataset.face).toBe('pick');
    expect(held(face('pick'))).toBe(false);
    expect(held(face('follow'))).toBe(true);
    // The held face already holds the miss keys (it is what gives the place its height), out of reach.
    expect(face('follow').querySelector('[role="radiogroup"][aria-label="Miss direction"]')).not.toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Miss direction' })).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Shot result' })).toBeTruthy();
  });

  it('a result that asks for more folds into the question’s heading, with a way back', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('radio', { name: 'Rough' }));
    expect(slot().dataset.face).toBe('follow');
    expect(held(face('pick'))).toBe(true);
    expect(held(face('follow'))).toBe(false);
    // The six results are still mounted where they were (held, so the tapped key never moved), and out of reach.
    expect(face('pick').querySelectorAll('[role="radio"]')).toHaveLength(6);
    expect(screen.queryByRole('radiogroup', { name: 'Shot result' })).toBeNull();
    expect(change().getAttribute('aria-label')).toBe('Shot result: Rough. Change');
    expect(change().textContent).toBe('RoughChange');
    expect(within(screen.getByRole('radiogroup', { name: 'Miss direction' })).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Left', 'Right']);
    // The fold is marked as a turn, which is what holds a double tap off the keys that have just arrived.
    expect(slot().dataset.turn).toBe('a');

    await user.click(change());
    expect(slot().dataset.face).toBe('pick');
    expect(slot().dataset.turn).toBe('b');
    expect(held(face('follow'))).toBe(true);
    expect(screen.getByRole('radio', { name: 'Rough' }).getAttribute('aria-checked')).toBe('true');
    // Picking the same result again asks its question again; nothing was lost by looking back.
    await user.click(screen.getByRole('radio', { name: 'Rough' }));
    expect(slot().dataset.face).toBe('follow');
  });

  it('a result that asks nothing more stays lit in the grid', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('radio', { name: 'Fairway' }));
    expect(slot().dataset.face).toBe('pick');
    expect(slot().dataset.turn).toBeUndefined();
    expect(screen.getByRole('radio', { name: 'Fairway' }).getAttribute('aria-checked')).toBe('true');
    expect(held(face('follow'))).toBe(true);
    // Back from a fold to a result with no question: the grid stays.
    await user.click(screen.getByRole('radio', { name: 'Sand' }));
    await user.click(change());
    await user.click(screen.getByRole('radio', { name: 'Fairway' }));
    expect(slot().dataset.face).toBe('pick');
    expect(screen.queryByRole('radiogroup', { name: 'Miss direction' })).toBeNull();
  });

  it('an approach folds onto the miss grid, a putt onto its optional tags; the green and a holed ball fold nothing', async () => {
    const approach = setup({ initialShots: [TEE], initialShotNumber: 2 });
    expect(face('follow').querySelector('[role="radiogroup"][aria-label="Where it missed the green"]')).not.toBeNull();
    await approach.user.click(screen.getByRole('radio', { name: /^Green/ }));
    expect(slot().dataset.face).toBe('pick');
    await approach.user.click(screen.getByRole('radio', { name: 'Sand' }));
    expect(change().getAttribute('aria-label')).toBe('Shot result: Sand. Change');
    expect(within(screen.getByRole('radiogroup', { name: 'Where it missed the green' })).getAllByRole('radio')).toHaveLength(8);
    cleanup();

    const putt = setup({ initialShots: [TEE, APPROACH], initialShotNumber: 3 });
    await putt.user.click(screen.getByRole('radio', { name: 'Holed' }));
    expect(slot().dataset.face).toBe('pick');
    await putt.user.click(screen.getByRole('radio', { name: 'Green' }));
    expect(change().getAttribute('aria-label')).toBe('Putt result: Green. Change');
    const tags = screen.getByRole('group', { name: 'How the putt missed' });
    expect(within(tags).getAllByRole('button').map((b) => b.textContent)).toEqual(['Short', 'Long', 'Low side', 'High side']);
    expect(within(screen.getByRole('region', { name: 'What happened' })).getByText('Optional')).toBeTruthy();
  });

  it('the fold never carries to the next shot', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('radio', { name: 'Driver' }));
    await user.click(screen.getByRole('radio', { name: 'Rough' }));
    await user.click(screen.getByRole('radio', { name: 'Left' }));
    await user.click(quick(140));
    await user.click(next());
    expect(slot().dataset.face).toBe('pick');
    expect(slot().dataset.turn).toBeUndefined();
    expect(screen.getByRole('radiogroup', { name: 'Shot result' })).toBeTruthy();
  });
});

describe('nothing else in the card changes its height', () => {
  it('the distance row is held, hidden and inert, for a holed ball as it is before a result', async () => {
    const { user } = setup({ initialShots: [TEE], initialShotNumber: 2 });
    const row = () => document.getElementById('ch-rt-dist')!.closest('.ch-rt-sec')!;
    expect(row().classList.contains('is-reserved')).toBe(true);
    await user.click(screen.getByRole('radio', { name: /^Green/ }));
    expect(row().classList.contains('is-reserved')).toBe(false);
    await user.click(screen.getByRole('radio', { name: 'Holed' }));
    expect(row().classList.contains('is-reserved')).toBe(true);
    expect(row().hasAttribute('inert')).toBe(true);
    expect(screen.getByRole('button', { name: 'Complete hole with score 2' })).toBeTruthy();
  });

  it('the shot’s length takes Required’s place in the heading instead of adding a line', async () => {
    const { user } = setup({ initialShots: [TEE], initialShotNumber: 2 });
    await user.click(screen.getByRole('radio', { name: /^Green/ }));
    const heading = () => document.getElementById('ch-rt-dist')!.closest('.ch-rt-sec')!.querySelector('.ch-rt-sec__h')!;
    expect(heading().textContent).toBe('Proximity to hole (ft)Required');
    await user.click(quick(10));
    expect(heading().textContent).toBe('Proximity to hole (ft)Shot distance ~137 yds');
    expect(document.querySelectorAll('.ch-rt-shotlen')).toHaveLength(1);
  });

  it('on a putt the tap in’s line keeps its place once a result is picked', async () => {
    const { user } = setup({ initialShots: [TEE, APPROACH], initialShotNumber: 3 });
    expect(screen.getByRole('button', { name: /^Tap in/ })).toBeTruthy();
    expect(document.querySelector('.ch-rt-tapin.is-held')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Holed' }));
    expect(screen.queryByRole('button', { name: /^Tap in/ })).toBeNull();
    expect(face('pick').querySelector('.ch-rt-tapin.is-held')).not.toBeNull();
  });
});

describe('the phone card is laid out to hold still (rounds-track.css)', () => {
  const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/rounds-track.css'), 'utf8');
  const phone = css.slice(css.indexOf('/* Board 3, "On the course, glove on"'));
  const rule = (src: string, selector: string) => {
    const at = src.indexOf(`\n  ${selector} {`);
    expect(at, selector).toBeGreaterThan(-1);
    return src.slice(at, src.indexOf('\n  }', at));
  };

  it('the two faces share one cell, and the one not in use keeps its box', () => {
    expect(rule(phone, '.ch-rt-slot')).toMatch(/display: grid;/);
    expect(rule(phone, '.ch-rt-face')).toMatch(/grid-area: 1 \/ 1;/);
    const heldFace = rule(phone, '.ch-rt-face[inert]');
    expect(heldFace).toMatch(/visibility: hidden;/);
    expect(heldFace).not.toMatch(/display: none/);
    // On the desk the unseen face takes no room, as before.
    expect(css.slice(0, css.indexOf('/* Board 3, "On the course, glove on"'))).toMatch(/\.ch-rt-face\[inert\] \{\s*display: none;/);
  });

  it('the fold eases in opacity and transform only, and the face that leaves is never moved', () => {
    expect(rule(phone, '.ch-rt-face')).toMatch(/transition: opacity var\(--ch-dur-base\) var\(--ch-ease\);/);
    const heldFace = rule(phone, '.ch-rt-face[inert]');
    expect(heldFace).not.toMatch(/transform/);
    expect(heldFace).toMatch(/opacity var\(--ch-dur-quick\) var\(--ch-ease\)/);
    expect(rule(phone, ".ch-rt-slot[data-turn] .ch-rt-face:not([inert])")).toMatch(/animation: ch-rt-face-in var\(--ch-dur-spring-settle\) var\(--ch-ease-spring-settle\) backwards;/);
    expect(css).toMatch(/@keyframes ch-rt-face-in \{\s*from \{\s*transform: translateY\(6px\);\s*\}\s*\}/);
    for (const selector of ['.ch-rt-slot', '.ch-rt-face', '.ch-rt-face[inert]', '.ch-rt-card']) {
      expect(rule(phone, selector), selector).not.toMatch(/transition:[^;]*\b(all|height|max-height|min-height|top|margin|padding|grid)/);
    }
  });

  it('a turned place takes no tap for one base beat', () => {
    expect(css).toMatch(/\.ch-rt-slot\[data-turn='a'\]::after \{\s*animation: ch-rt-face-hold-a var\(--ch-dur-base\) step-end;/);
    expect(css).toMatch(/\.ch-rt-slot\[data-turn='b'\]::after \{\s*animation: ch-rt-face-hold-b var\(--ch-dur-base\) step-end;/);
    expect(css).toMatch(/@keyframes ch-rt-face-hold-a \{\s*from \{\s*visibility: visible;/);
  });

  it('the card has one least height and the hero gives the screen’s spare height up, so the page has nothing to scroll', () => {
    expect(rule(phone, '.ch-rt-card')).toMatch(/min-height: calc\(298px \+ 43 \* var\(--ch-type-k\)\);/);
    expect(rule(phone, '.ch-rt-hero')).toMatch(/flex: 1 1 0;/);
    const stage = rule(phone, '.ch-rt-hero__stage');
    expect(stage).toMatch(/flex: 1 1 0;/);
    expect(stage).toMatch(/min-height: calc\(44px \+ 34 \* var\(--ch-type-k\)\);/);
    expect(stage).toMatch(/container: chrtstage \/ size;/);
  });
});

describe('the same shot data is saved through the new arrangement', () => {
  it('a whole hole: every field a shot could carry is still entered and recorded', async () => {
    const { onHoleComplete, user } = setup();
    // Tee: driver, into the rough, missed left, 150 yds left.
    await user.click(screen.getByRole('radio', { name: 'Driver' }));
    await user.click(screen.getByRole('radio', { name: 'Rough' }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'Miss direction' })).getByRole('radio', { name: 'Left' }));
    await user.type(document.getElementById('ch-rt-dist')!, '150');
    await user.click(next());
    // Approach: into the sand, short left of the green, 20 yds left.
    await user.click(screen.getByRole('radio', { name: 'Sand' }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'Where it missed the green' })).getByRole('radio', { name: 'Short left' }));
    await user.click(quick(20));
    await user.click(next());
    // Around the green: on, 8 ft.
    await user.click(screen.getByRole('radio', { name: /^Green/ }));
    await user.type(document.getElementById('ch-rt-dist')!, '8');
    await user.click(next());
    // First putt: left to right, uphill (its optional row, opened once), missed short and on the low side, 2 ft left.
    await user.click(screen.getByRole('button', { name: /^Break and slope/ }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'Putt break' })).getByRole('radio', { name: 'L → R' }));
    await user.click(within(screen.getByRole('radiogroup', { name: 'Putt slope' })).getByRole('radio', { name: 'Uphill' }));
    await user.click(screen.getByRole('radio', { name: 'Green' }));
    await user.click(within(screen.getByRole('group', { name: 'How the putt missed' })).getByRole('button', { name: 'Short' }));
    await user.click(within(screen.getByRole('group', { name: 'How the putt missed' })).getByRole('button', { name: 'Low side' }));
    await user.click(quick(2));
    await user.click(next());
    // Second putt: holed.
    await user.click(screen.getByRole('radio', { name: 'Holed' }));
    await user.click(next());

    expect(onHoleComplete).toHaveBeenCalledTimes(1);
    const stats = onHoleComplete.mock.calls[0]![1];
    expect(stats.score).toBe(5);
    expect(stats.putts).toBe(2);
    expect(stats.shots).toHaveLength(5);
    expect(stats.shots[0]).toMatchObject({ shotNumber: 1, shotType: 'tee', clubType: 'driver', result: 'rough', missDirection: 'left', distanceToHoleBefore: 380, distanceToHoleAfter: 150, distanceUnitAfter: 'yards' });
    expect(stats.shots[1]).toMatchObject({ shotNumber: 2, shotType: 'approach', lieBefore: 'rough', result: 'sand', approachMissDirection: 'short_left', distanceToHoleBefore: 150, distanceToHoleAfter: 20, distanceUnitAfter: 'yards' });
    expect(stats.shots[2]).toMatchObject({ shotNumber: 3, shotType: 'around_green', lieBefore: 'sand', result: 'green', distanceToHoleBefore: 20, distanceToHoleAfter: 8, distanceUnitAfter: 'feet' });
    expect(stats.shots[3]).toMatchObject({ shotNumber: 4, shotType: 'putting', lieBefore: 'green', result: 'green', puttBreak: 'left_to_right', puttSlope: 'uphill', puttMissTags: ['short', 'low'], distanceToHoleBefore: 8, distanceToHoleAfter: 2, distanceUnitAfter: 'feet' });
    expect(stats.shots[4]).toMatchObject({ shotNumber: 5, shotType: 'putting', result: 'hole', distanceToHoleBefore: 2 });
  });
});
